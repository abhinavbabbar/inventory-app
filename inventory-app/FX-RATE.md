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
**exact** Central Bank number landing daily.

### 0. The endpoint must be live on the target deployment

`/api/fx/ingest` ships with this code. Pushes to `main` deploy to **Preview**;
**Production** runs the `production` branch — so promote/merge this code to
`production` before pointing the job at the production URL (or, to test first,
point `FX_INGEST_URL` at the current Preview URL).

### 1. Let the request reach the endpoint (Deployment Protection)

If your deployment shows a Vercel "Authentication Required" page (HTTP 401),
that auth wall blocks the job. Pick one:

- **Easiest** — Vercel → Project → Settings → **Deployment Protection** →
  *Vercel Authentication* → protect **Only Preview Deployments**. Production
  becomes reachable (the app still requires its own login), and the ingest
  endpoint stays protected by the bearer token below. No extra secret needed.
- **Keep production protected** — Settings → Deployment Protection →
  **Protection Bypass for Automation** → generate a secret, then add it as a
  GitHub Actions secret named `VERCEL_PROTECTION_BYPASS`. The job sends it as
  the `x-vercel-protection-bypass` header.

### 2. Create a shared secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Vercel → Settings → Environment Variables (Production)

- `FX_INGEST_SECRET` = the value from step 2 → redeploy production.

### 4. GitHub → repo → Settings → Secrets and variables → Actions

- `FX_INGEST_SECRET` = the **same** value from step 2
- `FX_INGEST_URL` = `https://<your-production-domain>/api/fx/ingest`
- `VERCEL_PROTECTION_BYPASS` = only if you chose the bypass route in step 1

### 5. Run it once

GitHub → Actions → "Daily FX rate (CBUAE)" → *Run workflow*. Then open Settings —
the badge should read **Central Bank**.

### Verify
- Health check: `GET https://<your-domain>/api/fx/ingest` returns the stored value.
- The workflow log prints what it pushed, e.g.
  `→ CBUAE: 1 INR = 0.038929 AED (1 AED = 25.6878 INR)`.

> Point `FX_INGEST_URL` at the deployment whose database you want updated
> (normally Production). If a deploy uses a fresh database, just re-run the job.
