// Daily FX pusher — run by .github/workflows/fx-rate.yml on a schedule.
//
// Fetches today's INR→AED rate from the UAE Central Bank (with a market-rate
// fallback) and POSTs it to the app's /api/fx/ingest endpoint, which stores it
// in the database. This runs from a GitHub-hosted runner whose IP CBUAE does
// not block — unlike Vercel's serverless egress — so the app always has the
// exact official rate to serve.
//
// Env:
//   FX_INGEST_URL          full URL of the ingest endpoint
//                          e.g. https://your-app.vercel.app/api/fx/ingest
//   FX_INGEST_SECRET       shared bearer token (must match the app's env var)
//   VERCEL_PROTECTION_BYPASS  (optional) Vercel "Protection Bypass for
//                          Automation" secret — set this if the deployment has
//                          Deployment Protection enabled, so the request gets
//                          past Vercel's auth wall to reach our endpoint.

const INGEST_URL = process.env.FX_INGEST_URL;
const INGEST_SECRET = process.env.FX_INGEST_SECRET;
const PROTECTION_BYPASS = process.env.VERCEL_PROTECTION_BYPASS;

const CBUAE_ENDPOINT =
  "https://www.centralbank.ae/umbraco/Surface/Exchange/GetExchangeRateAllCurrency";
const CBUAE_REFERER =
  "https://www.centralbank.ae/en/forex-eibor/exchange-rates/";
const MARKET_ENDPOINT = "https://open.er-api.com/v6/latest/AED";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function parseCbuaeInr(html) {
  const patterns = [
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
  return null;
}

function parseCbuaeUpdated(html) {
  const m = html.match(/Last updated:\s*([\s\S]*?)<\/p>/i);
  if (!m) return null;
  const text = m[1].replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.replace(/^[A-Za-z]+day\s+/, "").replace(/(\d{2}:\d{2}):\d{2}\s/, "$1 ");
}

async function tryCbuae() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(CBUAE_ENDPOINT, {
        headers: {
          "User-Agent": BROWSER_UA,
          "X-Requested-With": "XMLHttpRequest",
          Referer: CBUAE_REFERER,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const inrToAed = parseCbuaeInr(html);
      if (inrToAed) {
        return { inrToAed, updatedLabel: parseCbuaeUpdated(html), source: "CBUAE" };
      }
      throw new Error("INR row not found");
    } catch (e) {
      console.error(`  CBUAE attempt ${attempt} failed: ${e.message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  return null;
}

async function tryMarket() {
  try {
    const res = await fetch(MARKET_ENDPOINT, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const inrPerAed = j?.rates?.INR;
    if (j?.result === "success" && Number.isFinite(inrPerAed) && inrPerAed > 0) {
      let label = null;
      if (j.time_last_update_utc) {
        const d = new Date(j.time_last_update_utc);
        if (!Number.isNaN(d.getTime())) {
          label = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
        }
      }
      return { inrToAed: 1 / inrPerAed, updatedLabel: label, source: "MARKET" };
    }
    throw new Error("INR missing in market response");
  } catch (e) {
    console.error(`  market fallback failed: ${e.message}`);
    return null;
  }
}

async function main() {
  if (!INGEST_URL || !INGEST_SECRET) {
    fail("FX_INGEST_URL and FX_INGEST_SECRET must be set");
  }

  const rate = (await tryCbuae()) ?? (await tryMarket());
  if (!rate) fail("could not obtain a rate from CBUAE or the market fallback");

  console.log(
    `→ ${rate.source}: 1 INR = ${rate.inrToAed} AED (1 AED = ${(1 / rate.inrToAed).toFixed(4)} INR)` +
      `${rate.updatedLabel ? ` · ${rate.updatedLabel}` : ""}`,
  );

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${INGEST_SECRET}`,
  };
  // Get past Vercel Deployment Protection, if enabled on the target.
  if (PROTECTION_BYPASS) headers["x-vercel-protection-bypass"] = PROTECTION_BYPASS;

  const res = await fetch(INGEST_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ inrToAed: rate.inrToAed, updatedLabel: rate.updatedLabel }),
  });

  const text = await res.text();
  if (!res.ok) fail(`ingest endpoint returned HTTP ${res.status}: ${text}`);
  console.log(`✓ pushed to app: ${text}`);
}

main().catch((e) => fail(e.message));
