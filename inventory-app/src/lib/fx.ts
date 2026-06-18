import { prisma } from "@/lib/prisma";
import { getDefaultFxRate } from "@/lib/settings";

// -----------------------------------------------------------------------------
// UAE Central Bank live FX rate (INR ⇄ AED)
//
// The CBUAE publishes daily rates (Mon–Fri, ~6pm UAE time) as an HTML fragment
// served from an Umbraco "surface" controller. We GET it, parse out the Indian
// Rupee row, and derive both directions. The published value is "AED per 1 unit
// of foreign currency" — so the INR row IS the INR→AED rate, matching the
// semantics of our stored default_fx_rate.
//
// Resilience: live fetch → DB cache (last good value) → manual default rate.
// -----------------------------------------------------------------------------

const CBUAE_ENDPOINT =
  "https://www.centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency";
const CBUAE_REFERER =
  "https://www.centralbank.ae/en/forex-eibor/exchange-rates/";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const CACHE_SETTING_KEY = "cbuae_fx_cache";
const REVALIDATE_SECONDS = 6 * 60 * 60; // 6h — CBUAE updates once per business day

export type RateSource = "CBUAE_LIVE" | "CBUAE_CACHE" | "MANUAL";

export type FxRate = {
  inrToAed: number; // 1 INR = inrToAed AED (CBUAE published value)
  aedToInr: number; // 1 AED = aedToInr INR (derived)
  /** Human-readable "last updated" string from CBUAE, e.g. "18 June 2026 06:05 PM". */
  updatedLabel: string | null;
  source: RateSource;
};

type ParsedRate = { inrToAed: number; updatedLabel: string | null };

// --- HTML parsing -----------------------------------------------------------

function parseInrToAed(html: string): number {
  // The endpoint may answer in English ("Indian Rupee") or Arabic
  // ("روبية هندية") depending on culture context. Match either, then grab the
  // adjacent value cell (`<td ... value">0.038929</td>`).
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

function parseUpdatedLabel(html: string): string | null {
  const m = html.match(/Last updated:\s*([\s\S]*?)<\/p>/i);
  if (!m) return null;
  const text = m[1].replace(/\s+/g, " ").trim();
  if (!text) return null;
  // Drop a leading weekday ("Thursday 18 June 2026 …") and seconds for brevity.
  return text
    .replace(/^[A-Za-z]+day\s+/, "")
    .replace(/(\d{2}:\d{2}):\d{2}\s/, "$1 ");
}

async function fetchLive(fresh = false): Promise<ParsedRate> {
  const res = await fetch(CBUAE_ENDPOINT, {
    headers: {
      "User-Agent": BROWSER_UA,
      "X-Requested-With": "XMLHttpRequest",
      Referer: CBUAE_REFERER,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    ...(fresh
      ? { cache: "no-store" as const }
      : { next: { revalidate: REVALIDATE_SECONDS } }),
  });
  if (!res.ok) throw new Error(`CBUAE responded ${res.status}`);
  const html = await res.text();
  return { inrToAed: parseInrToAed(html), updatedLabel: parseUpdatedLabel(html) };
}

// --- DB cache (fallback when CBUAE is unreachable) --------------------------

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

export async function writeCache(rate: ParsedRate): Promise<void> {
  const value: CachedRate = {
    inrToAed: rate.inrToAed,
    updatedLabel: rate.updatedLabel,
    cachedAt: new Date().toISOString(),
  };
  await prisma.setting.upsert({
    where: { key: CACHE_SETTING_KEY },
    update: { value: JSON.stringify(value) },
    create: { key: CACHE_SETTING_KEY, value: JSON.stringify(value) },
  });
}

// Throttle opportunistic cache writes during passive renders (per process).
let lastPersistMs = 0;
async function maybePersist(rate: ParsedRate): Promise<void> {
  const now = Date.now();
  if (now - lastPersistMs < REVALIDATE_SECONDS * 1000) return;
  lastPersistMs = now;
  try {
    await writeCache(rate);
  } catch {
    /* best-effort */
  }
}

function withDerived(inrToAed: number, updatedLabel: string | null, source: RateSource): FxRate {
  return { inrToAed, aedToInr: 1 / inrToAed, updatedLabel, source };
}

// --- Public API -------------------------------------------------------------

/**
 * Resilient accessor used by pages. Tries the live CBUAE feed (cached for 6h),
 * falls back to the last good value persisted in the DB, then to the manually
 * configured default FX rate. Never throws.
 */
export async function getCbuaeRate(): Promise<FxRate> {
  try {
    const live = await fetchLive(false);
    void maybePersist(live);
    return withDerived(live.inrToAed, live.updatedLabel, "CBUAE_LIVE");
  } catch {
    const cached = await readCache();
    if (cached) return withDerived(cached.inrToAed, cached.updatedLabel, "CBUAE_CACHE");
    const manual = Number.parseFloat(await getDefaultFxRate());
    const safe = Number.isFinite(manual) && manual > 0 ? manual : 0.0445;
    return withDerived(safe, null, "MANUAL");
  }
}

/**
 * Forces a fresh fetch (bypasses the Next fetch cache) and persists it to the
 * DB cache. Used by the "Refresh" action. Falls back like getCbuaeRate on error.
 */
export async function refreshCbuaeRate(): Promise<FxRate> {
  try {
    const live = await fetchLive(true);
    await writeCache(live);
    return withDerived(live.inrToAed, live.updatedLabel, "CBUAE_LIVE");
  } catch {
    return getCbuaeRate();
  }
}
