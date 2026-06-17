# Deploying to Vercel + Neon

The app deploys to **Vercel** (hosting) with **Neon** (serverless PostgreSQL). Both have free
tiers that comfortably cover this workload. Migrations and the admin user are created
automatically on the first deploy — no server to manage.

```
Browser ──▶ Vercel (Next.js, auto HTTPS) ──▶ Neon Postgres (pooled connection)
                 vercel-build:                      migrations run during build
                 migrate deploy → seed → next build
```

Estimated time: ~15 minutes. Cost: $0 to start.

> **Heads-up on data location:** unlike the earlier Serverspace-UAE plan, Neon hosts the
> database in its own cloud regions. Neon has no Dubai region — pick the **closest** one
> (e.g. AWS Europe/Frankfurt or Asia/Singapore). If in-UAE data residency is a hard
> requirement, use the self-host option in the appendix instead.

---

## What you do vs what's automated

| Step | Who |
|---|---|
| Create Neon project, copy 2 connection strings | **You** |
| Import the GitHub repo into Vercel, set Root Directory + env vars | **You** (clicks) |
| `prisma generate`, run migrations, seed admin, build & host | **Automated** each deploy |

---

## 1. Push the code to GitHub

If you haven't already, get this repo onto GitHub (see the chat — I can do this with you).
Vercel deploys from the GitHub repo.

## 2. Create the database (Neon)

1. Sign up at **https://neon.tech** → **New Project**.
2. Name it (e.g. `inventory`), choose the **region closest to your users**, Postgres 16.
3. After it's created, open **Connect** / **Connection Details** and copy **two** strings:
   - **Pooled** connection (host contains `-pooler`) → this is your `DATABASE_URL`
   - **Direct** connection (no `-pooler`) → this is your `DIRECT_URL`

   Both end with `?sslmode=require`. Keep them handy for step 3.

## 3. Import into Vercel

1. Sign up at **https://vercel.com** with your GitHub account → **Add New… → Project**.
2. Select this repository.
3. **Important — Root Directory:** click **Edit** and set it to **`inventory-app`**
   (the Next.js app lives in that subfolder).
4. Framework preset auto-detects **Next.js**. Leave the build command as-is — the repo's
   `vercel-build` script runs migrations + seed + build automatically.
5. Add **Environment Variables** (Production, and Preview if you want):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Neon **pooled** string (from step 2) |
   | `DIRECT_URL` | Neon **direct** string (from step 2) |
   | `AUTH_SECRET` | a fresh 32-byte secret — see below |
   | `AUTH_TRUST_HOST` | `true` |
   | `SEED_ADMIN_EMAIL` | `admin@yourcompany.com` |
   | `SEED_ADMIN_PASSWORD` | a strong password (change it after first login) |

   Generate `AUTH_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

6. Click **Deploy**. The build will: install deps → `prisma generate` (postinstall) →
   `prisma migrate deploy` (creates all tables) → seed the admin user + default settings →
   `next build`. Watch the build log; it finishes in ~2–3 min.

## 4. First login & setup

1. Open your `*.vercel.app` URL → you'll see the sign-in page.
2. Log in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
3. **Settings → Manage users** → change your admin password.
4. **Settings → Company info / VAT / FX** → fill in your real details.
5. Add partners and start entering data.

## 5. Custom domain (when ready)

In Vercel: **Project → Settings → Domains → Add**. Enter your domain; Vercel shows the exact
DNS records to add at your registrar (an `A` record for the apex or a `CNAME` for `www`).
HTTPS is automatic. NextAuth needs no change — `AUTH_TRUST_HOST=true` handles the new host.

---

## Release workflow (preview → promote)

The Vercel **Production Branch** is **`production`**. Day-to-day work happens on `main`:

```
edit → git push (main) → Vercel Preview URL → test → promote → Production
```

- **Push to `main`** → builds a **Preview** deployment (own URL, production untouched).
- **Promote to production** when happy, either:
  - **Dashboard:** open the preview deployment → **⋯ → Promote to Production** (instant, same build), or
  - **Merge:** `git checkout production && git merge main && git push` → Vercel builds production
    from the `production` branch (keeps the branch equal to what's live).

New Prisma migrations apply automatically during whichever build runs.

- **Logs:** Vercel dashboard → your project → **Logs** (runtime) / **Deployments** (build).
- **Database console / backups:** Neon dashboard → SQL Editor, branching, and point-in-time
  restore are built in.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails at `prisma migrate deploy` | `DIRECT_URL` missing or wrong. It must be the **direct** (non-pooler) Neon string. |
| App loads but DB calls error | `DATABASE_URL` should be the **pooled** (`-pooler`) Neon string. |
| Can't log in / no admin | Check the build log for the seed step. Re-run locally: pull env with `npx vercel env pull .env.local`, then `npm run db:seed`. |
| "PrismaClient is not generated" | Ensure `postinstall: prisma generate` is in package.json (it is) and the Root Directory is `inventory-app`. |
| 404 on every route | Root Directory isn't set to `inventory-app`. |

---

## Appendix — self-host alternative (Docker, in-UAE data residency)

If you need the database physically in the UAE, the repo also ships a Docker stack
(**Postgres + app + Caddy auto-HTTPS**) you can run on a Serverspace UAE VPS:

- `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `docker-entrypoint.sh`, `.env.production.example`

Run on the server with `docker compose up -d --build`. (Full self-host steps are preserved in
git history of this file, or ask and I'll restore the detailed runbook.) This trades Vercel's
zero-ops convenience for full in-region control.
