# Live FX rate (UAE Central Bank)

The app shows today's INR ⇄ AED rate from the **Central Bank of the UAE** and a
converter (Settings → "Live exchange rate", plus a banner on the Dashboard).

## How it resolves a rate

When a page needs the rate it tries, in order, and uses the first that works:

1. **Live CBUAE** — fetched in-request from `centralbank.ae`. Exact official rate.
2. **Today's CBUAE value from the database** — written by the daily job below.
   Still the exact Central Bank rate (CBUAE only publishes once per business day).
3. **Live market rate** — `open.er-api.com` (keyless). ≈CBUAE, never stale.
4. **Last stored value** — even if older than a few days.
5. **Saved default rate** — the manual value in Settings.

The source badge on the Settings card tells you which one you're seeing:
**Central Bank** / **Market · Live** / **Recent** / **Saved rate**.

## Why the daily job exists

CBUAE sits behind a WAF that **blocks datacenter IPs**, so Vercel's own servers
often can't reach it (step 1 fails there). A scheduled **GitHub Action** runs
from a GitHub-hosted runner — an IP CBUAE does *not* block — fetches the exact
rate, and POSTs it to the app, which stores it for step 2.

```
GitHub Action (daily)  ──fetch──▶  CBUAE
        │
        └──POST { inrToAed }──▶  /api/fx/ingest  ──▶  database  ──▶  app reads it
```

Files:
- `scripts/push-fx-rate.mjs` — fetch + parse + push (market fallback built in)
- `.github/workflows/fx-rate.yml` — schedule (15:00 UTC, Mon–Fri) + manual run
- `src/app/api/fx/ingest/route.ts` — token-secured ingest endpoint

## One-time setup

Everything already works via the market fallback (~correct). Do this to get the
**exact** Central Bank number landing daily:

1. **Create a shared secret** (any long random string):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Vercel** → Project → Settings → Environment Variables → add for **Production**:
   - `FX_INGEST_SECRET` = the value from step 1
   - Redeploy production so it takes effect.

3. **GitHub** → repo → Settings → Secrets and variables → **Actions** → add:
   - `FX_INGEST_SECRET` = the **same** value from step 1
   - `FX_INGEST_URL` = `https://<your-production-domain>/api/fx/ingest`

4. **Run it once now**: GitHub → Actions → "Daily FX rate (CBUAE)" → *Run workflow*.
   Then open Settings — the badge should read **Central Bank**.

### Verify
- Health check (no secret needed): `GET https://<your-domain>/api/fx/ingest`
  returns the currently stored value.
- The workflow log prints the rate it pushed, e.g.
  `→ CBUAE: 1 INR = 0.038929 AED (1 AED = 25.6878 INR)`.

> Point `FX_INGEST_URL` at your **production** domain so the value lands in the
> production database. If a deploy uses a fresh database, just re-run the
> workflow once.
