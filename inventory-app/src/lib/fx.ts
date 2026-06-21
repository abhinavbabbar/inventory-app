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
const FETCH_TIMEOUT_MS = 7000;
// A stored value younger than this is served as-is on render (no upstream call),
// so every serverless instance shows the same number. CBUAE only publishes once
// per business day, so this just avoids hammering upstreams between updates.
const SERVE_FRESH_MS = 3 * 60 * 60 * 1000; // 3h

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

// --- DB cache (shared source of truth across all serverless instances) ------
//
// One Setting row holds the most recent rate + which source it came from. It is
// written (awaited, never fire-and-forget) by:
//   - a successful live CBUAE or market fetch during render/refresh, and
//   - the daily GitHub Action via /api/fx/ingest (ingestCbuaeRate).
// Because every instance reads this same row, the "Refresh" button and the
// daily job are immediately visible everywhere — no per-instance memory cache.

// How long a stored CBUAE value is still "today's rate". CBUAE publishes once
// per business day, so 4 days covers a weekend plus a public holiday. While a
// CBUAE value is this fresh we keep serving it and won't downgrade to market.
const CBUAE_FRESH_MS = 4 * 24 * 60 * 60 * 1000;
// Plausible band for INR→AED — rejects garbage / inverted (aed→inr) values.
const MIN_INR_AED = 0.01;
const MAX_INR_AED = 0.1;

type CacheSource = "CBUAE" | "MARKET";
type CachedRate = {
  inrToAed: number;
  updatedLabel: string | null;
  source: CacheSource;
  cachedAt: string;
};

async function readCache(): Promise<CachedRate | null> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: CACHE_SETTING_KEY } });
    if (!row) return null;
    const parsed = JSON.parse(row.value) as Partial<CachedRate>;
    if (typeof parsed.inrToAed === "number" && parsed.inrToAed > 0) {
      return {
        inrToAed: parsed.inrToAed,
        updatedLabel: parsed.updatedLabel ?? null,
        source: parsed.source === "MARKET" ? "MARKET" : "CBUAE",
        cachedAt: parsed.cachedAt ?? new Date().toISOString(),
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function writeCache(p: ParsedRate, source: CacheSource): Promise<void> {
  // Never let an approximate market value overwrite a still-current CBUAE one.
  if (source === "MARKET") {
    const existing = await readCache();
    if (existing && existing.source === "CBUAE" && ageMs(existing) < CBUAE_FRESH_MS) return;
  }
  const value: CachedRate = {
    inrToAed: p.inrToAed,
    updatedLabel: p.updatedLabel,
    source,
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

function ageMs(c: CachedRate): number {
  const t = Date.parse(c.cachedAt);
  return Number.isFinite(t) ? Date.now() - t : Number.POSITIVE_INFINITY;
}

// Try CBUAE, then the market fallback. Returns the value + which source it came
// from, or null if both are unreachable.
async function resolveLive(): Promise<{ p: ParsedRate; source: CacheSource } | null> {
  try {
    return { p: await fetchCbuae(), source: "CBUAE" };
  } catch {
    /* try market */
  }
  try {
    return { p: await fetchMarket(), source: "MARKET" };
  } catch {
    return null;
  }
}

// --- Public API -------------------------------------------------------------

/**
 * Resilient accessor used by pages. Reads the shared DB cache first so every
 * instance is consistent; only hits upstreams when the cache is stale. Order:
 *   1. a still-current CBUAE value from the DB (daily job / last good fetch)
 *   2. any very recent stored value (avoids hammering upstreams)
 *   3. a fresh live fetch (CBUAE → market), persisted for everyone
 *   4. any stored value, even if old
 *   5. the manually configured default rate
 * Never throws.
 */
export async function getCbuaeRate(): Promise<FxRate> {
  const cached = await readCache();

  // 1. A current Central Bank value — serve it without downgrading to market.
  if (cached && cached.source === "CBUAE" && ageMs(cached) < CBUAE_FRESH_MS) {
    return withDerived(cached, "CBUAE");
  }
  // 2. Any very recent value — serve it to keep instances consistent and cheap.
  if (cached && ageMs(cached) < SERVE_FRESH_MS) {
    return withDerived(cached, cached.source);
  }

  // 3. Cache is stale/missing — refresh from upstream and persist (awaited).
  const live = await resolveLive();
  if (live) {
    await writeCache(live.p, live.source);
    return withDerived(live.p, live.source);
  }

  // 4. Couldn't reach anything — serve whatever we still have.
  if (cached) return withDerived(cached, cached.source === "CBUAE" ? "CBUAE" : "CACHE");

  // 5. Manual default.
  const manual = Number.parseFloat(await getDefaultFxRate());
  const safe = Number.isFinite(manual) && manual > 0 ? manual : 0.0445;
  return withDerived({ inrToAed: safe, updatedLabel: null }, "MANUAL");
}

/**
 * Forces a fresh fetch and persists it (awaited), so the new value is visible
 * on every instance immediately. Used by the "Refresh" / "Use as default"
 * actions. Falls back to the resilient read if upstreams are unreachable.
 */
export async function refreshCbuaeRate(): Promise<FxRate> {
  const live = await resolveLive();
  if (live) {
    await writeCache(live.p, live.source);
    return withDerived(live.p, live.source);
  }
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
  await writeCache({ inrToAed: p.inrToAed, updatedLabel: p.updatedLabel }, "CBUAE");
}

/** Read-only peek at the stored value (no network). For the ingest GET. */
export async function peekStoredRate(): Promise<
  | {
      inrToAed: number;
      aedToInr: number;
      updatedLabel: string | null;
      source: CacheSource;
      cachedAt: string;
      fresh: boolean;
    }
  | null
> {
  const c = await readCache();
  if (!c) return null;
  return {
    inrToAed: c.inrToAed,
    aedToInr: 1 / c.inrToAed,
    updatedLabel: c.updatedLabel,
    source: c.source,
    cachedAt: c.cachedAt,
    fresh: ageMs(c) < CBUAE_FRESH_MS,
  };
}
