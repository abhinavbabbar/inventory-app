import { prisma } from "@/lib/prisma";
import { getDefaultFxRate } from "@/lib/settings";

// -----------------------------------------------------------------------------
// Live FX rate (INR ⇄ AED)
//
// Primary source: UAE Central Bank daily feed (Mon–Fri, ~6pm UAE time), served
// as an HTML fragment from an Umbraco "surface" controller. The published value
// is "AED per 1 unit of foreign currency", so the Indian Rupee row IS the
// INR→AED rate — matching the semantics of our stored default_fx_rate.
//
// CBUAE sits behind an F5/Akamai WAF that can challenge requests from
// datacenter IPs (e.g. serverless). To stay correct we use a resilient chain:
//   1. CBUAE live  (exact official rate)
//   2. open.er-api.com live market rate (keyless; ~identical, never stale)
//   3. last good value persisted in the DB
//   4. the manually configured default rate
//
// Fetches use `no-store` and we validate the body BEFORE caching, so a WAF
// challenge page is never cached as a good rate. A small in-memory TTL cache
// avoids hitting upstreams on every render within a warm instance.
// -----------------------------------------------------------------------------

const CBUAE_ENDPOINT =
  "https://www.centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency";
const CBUAE_REFERER =
  "https://www.centralbank.ae/en/forex-eibor/exchange-rates/";
const MARKET_ENDPOINT = "https://open.er-api.com/v6/latest/AED";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const CACHE_SETTING_KEY = "cbuae_fx_cache";
const MEM_TTL_MS = 60 * 60 * 1000; // 1h in-memory cache per warm instance
const FETCH_TIMEOUT_MS = 7000;

export type RateSource = "CBUAE" | "MARKET" | "CACHE" | "MANUAL";

export type FxRate = {
  inrToAed: number; // 1 INR = inrToAed AED
  aedToInr: number; // 1 AED = aedToInr INR (derived)
  /** Human-readable freshness label (CBUAE timestamp or market update time). */
  updatedLabel: string | null;
  source: RateSource;
};

type ParsedRate = { inrToAed: number; updatedLabel: string | null };

// --- helpers ----------------------------------------------------------------

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

function withDerived(p: ParsedRate, source: RateSource): FxRate {
  return { inrToAed: p.inrToAed, aedToInr: 1 / p.inrToAed, updatedLabel: p.updatedLabel, source };
}

// --- CBUAE (primary) --------------------------------------------------------

function parseCbuaeInr(html: string): number {
  // Endpoint may answer in English ("Indian Rupee") or Arabic ("روبية هندية").
  const patterns: RegExp[] = [
    /Indian Rupee\s*<\/td>\s*<td[^>]*\bvalue\b[^>]*>\s*([\d.]+)/i,
    /روبية هندية\s*<\/td>\s*<td[^>]*\bvalue\b[^>]*>\s*([\d.]+)/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      const v = Number.parseFloat(m[1]);
      if (Number.isFinite(v) && v > 0) return v;
    }
  }
  throw new Error("INR rate not found in CBUAE response");
}

function parseCbuaeUpdated(html: string): string | null {
  const m = html.match(/Last updated:\s*([\s\S]*?)<\/p>/i);
  if (!m) return null;
  const text = m[1].replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text
    .replace(/^[A-Za-z]+day\s+/, "") // drop leading weekday
    .replace(/(\d{2}:\d{2}):\d{2}\s/, "$1 "); // drop seconds
}

async function fetchCbuae(): Promise<ParsedRate> {
  const res = await fetchWithTimeout(CBUAE_ENDPOINT, {
    headers: {
      "User-Agent": BROWSER_UA,
      "X-Requested-With": "XMLHttpRequest",
      Referer: CBUAE_REFERER,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`CBUAE responded ${res.status}`);
  const html = await res.text();
  return { inrToAed: parseCbuaeInr(html), updatedLabel: parseCbuaeUpdated(html) };
}

// --- Market (secondary, keyless) -------------------------------------------

async function fetchMarket(): Promise<ParsedRate> {
  const res = await fetchWithTimeout(MARKET_ENDPOINT, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`market responded ${res.status}`);
  const json = (await res.json()) as {
    result?: string;
    rates?: Record<string, number>;
    time_last_update_utc?: string;
  };
  const inrPerAed = json?.rates?.INR;
  if (json?.result !== "success" || typeof inrPerAed !== "number" || inrPerAed <= 0) {
    throw new Error("market INR rate unavailable");
  }
  let label: string | null = null;
  if (json.time_last_update_utc) {
    const d = new Date(json.time_last_update_utc);
    if (!Number.isNaN(d.getTime())) {
      label = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    }
  }
  return { inrToAed: 1 / inrPerAed, updatedLabel: label };
}

// --- DB cache (the authoritative store, kept CBUAE-only) --------------------
//
// This row holds the most recent *Central Bank* value. It is written by:
//   - a successful in-request live CBUAE fetch, and
//   - the daily GitHub Action via the /api/fx/ingest endpoint (ingestCbuaeRate),
//     which runs from an IP CBUAE doesn't block.
// The live market fallback intentionally does NOT write here, so this row never
// gets clobbered by an approximate rate.

// How long a stored CBUAE value is still considered "today's rate". CBUAE only
// publishes on business days, so 4 days covers a weekend plus a public holiday.
const CBUAE_FRESH_MS = 4 * 24 * 60 * 60 * 1000;
// Plausible band for INR→AED — rejects garbage / inverted (aed→inr) values.
const MIN_INR_AED = 0.01;
const MAX_INR_AED = 0.1;

type CachedRate = { inrToAed: number; updatedLabel: string | null; cachedAt: string };

async function readCache(): Promise<CachedRate | null> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: CACHE_SETTING_KEY } });
    if (!row) return null;
    const parsed = JSON.parse(row.value) as Partial<CachedRate>;
    if (typeof parsed.inrToAed === "number" && parsed.inrToAed > 0) {
      return {
        inrToAed: parsed.inrToAed,
        updatedLabel: parsed.updatedLabel ?? null,
        cachedAt: parsed.cachedAt ?? new Date().toISOString(),
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function writeCache(p: ParsedRate): Promise<void> {
  const value: CachedRate = {
    inrToAed: p.inrToAed,
    updatedLabel: p.updatedLabel,
    cachedAt: new Date().toISOString(),
  };
  try {
    await prisma.setting.upsert({
      where: { key: CACHE_SETTING_KEY },
      update: { value: JSON.stringify(value) },
      create: { key: CACHE_SETTING_KEY, value: JSON.stringify(value) },
    });
  } catch {
    /* best-effort */
  }
}

function isCacheFresh(c: CachedRate): boolean {
  const t = Date.parse(c.cachedAt);
  return Number.isFinite(t) && Date.now() - t < CBUAE_FRESH_MS;
}

// --- in-memory cache (per warm instance) -----------------------------------

let mem: { rate: FxRate; ts: number } | null = null;

// --- Public API -------------------------------------------------------------

/**
 * Resilient accessor used by pages. Priority:
 *   1. live CBUAE (exact, this request)
 *   2. recent CBUAE value from the DB (written by the daily job) — still exact
 *   3. live market rate (≈CBUAE, never stale)
 *   4. any stored value, even if old
 *   5. the manually configured default rate
 * Never throws. Cached in memory for an hour within a warm serverless instance.
 */
export async function getCbuaeRate(): Promise<FxRate> {
  if (mem && Date.now() - mem.ts < MEM_TTL_MS) return mem.rate;

  // 1. Live Central Bank.
  try {
    const p = await fetchCbuae();
    void writeCache(p);
    const rate = withDerived(p, "CBUAE");
    mem = { rate, ts: Date.now() };
    return rate;
  } catch {
    /* blocked or down — try the stored value next */
  }

  const cached = await readCache();

  // 2. Recent Central Bank value (from the daily job) — authoritative.
  if (cached && isCacheFresh(cached)) {
    const rate = withDerived({ inrToAed: cached.inrToAed, updatedLabel: cached.updatedLabel }, "CBUAE");
    mem = { rate, ts: Date.now() };
    return rate;
  }

  // 3. Live market rate (≈CBUAE). Does not overwrite the CBUAE store.
  try {
    const p = await fetchMarket();
    const rate = withDerived(p, "MARKET");
    mem = { rate, ts: Date.now() };
    return rate;
  } catch {
    /* fall through to whatever we have */
  }

  // 4. Stale stored value.
  if (cached) {
    return withDerived({ inrToAed: cached.inrToAed, updatedLabel: cached.updatedLabel }, "CACHE");
  }

  // 5. Manual default.
  const manual = Number.parseFloat(await getDefaultFxRate());
  const safe = Number.isFinite(manual) && manual > 0 ? manual : 0.0445;
  return withDerived({ inrToAed: safe, updatedLabel: null }, "MANUAL");
}

/**
 * Forces a fresh resolution (ignores the in-memory cache). Used by the
 * "Refresh" / "Use as default" actions.
 */
export async function refreshCbuaeRate(): Promise<FxRate> {
  mem = null;
  return getCbuaeRate();
}

/**
 * Stores a Central Bank rate pushed in by the daily job (/api/fx/ingest).
 * Validates the value is a plausible INR→AED figure before persisting.
 */
export async function ingestCbuaeRate(p: {
  inrToAed: number;
  updatedLabel: string | null;
}): Promise<void> {
  if (!Number.isFinite(p.inrToAed) || p.inrToAed < MIN_INR_AED || p.inrToAed > MAX_INR_AED) {
    throw new Error(`inrToAed out of range (${MIN_INR_AED}–${MAX_INR_AED})`);
  }
  await writeCache({ inrToAed: p.inrToAed, updatedLabel: p.updatedLabel });
  mem = null; // invalidate so the next read reflects the new value
}

/** Read-only peek at the stored CBUAE value (no network). For the ingest GET. */
export async function peekStoredRate(): Promise<
  ({ inrToAed: number; aedToInr: number; updatedLabel: string | null; cachedAt: string; fresh: boolean }) | null
> {
  const c = await readCache();
  if (!c) return null;
  return {
    inrToAed: c.inrToAed,
    aedToInr: 1 / c.inrToAed,
    updatedLabel: c.updatedLabel,
    cachedAt: c.cachedAt,
    fresh: isCacheFresh(c),
  };
}
