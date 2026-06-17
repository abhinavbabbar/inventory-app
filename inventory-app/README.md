# Inventory & P&L

A web + mobile (PWA) app for two-partner businesses that import goods from India (INR) and sell in the UAE (AED). Tracks inventory, FIFO landed cost, sales, invoices, opex, and per-partner profit shares.

Architecture and feature spec live in [../SPEC.md](../SPEC.md).

---

## Quickstart

Requires **Node 20+** (developed against Node 24 LTS).

```powershell
npm install
npm run db:migrate    # creates dev.db (SQLite) and applies migrations
npm run db:seed       # creates admin + default settings
npm run dev           # http://localhost:3000
```

Default login: `admin@example.com` / `ChangeMe123!`. Change the password from **Settings → Manage users** after first login.

To populate the dashboard with realistic demo data on a fresh DB:

```powershell
$env:SEED_SAMPLE_DATA="true"; npm run db:seed
```

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with Turbopack on :3000 |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run lint` | ESLint |
| `npm test` | Run the Vitest suite (25 tests covering allocation, FIFO, PDF rendering, KPIs) |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:reset` | Drop + recreate the DB and re-run migrations + seed |
| `npm run db:seed` | Re-seed admin + settings (and sample data if `SEED_SAMPLE_DATA=true`) |
| `npm run db:studio` | Open Prisma Studio against the local DB |

---

## Environment

Copy `.env.example` to `.env` (already done by the scaffold; check the values).

| Variable | Notes |
|---|---|
| `DATABASE_URL` | `file:./dev.db` for local SQLite, or a Postgres connection string for production |
| `AUTH_SECRET` | 32+ random chars. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `AUTH_TRUST_HOST` | `true` for self-hosted/Vercel; leave unset for typical OAuth providers |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Override the default seeded admin |
| `SEED_SAMPLE_DATA` | Set to `true` to seed demo items/shipments/sales/opex |

---

## Switching SQLite → Postgres for production

Two changes:

1. `prisma/schema.prisma` — change the datasource provider:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. `.env` (production) — set `DATABASE_URL` to a Postgres connection string (e.g. from Neon, Supabase, or Railway).

Then:
```powershell
npx prisma migrate deploy   # apply existing migrations to the new DB
npm run db:seed             # seed admin + settings
```

Decimals stored as TEXT in SQLite become real `DECIMAL` columns in Postgres — no data-shape changes needed.

---

## Deploying to Vercel + Neon

1. **Database** — sign up at [neon.tech](https://neon.tech), create a project, copy the pooled connection string.
2. **Switch the schema** to `postgresql` as above and commit.
3. **Push the code** to GitHub.
4. **Import to Vercel** — root directory is `inventory-app`. Vercel auto-detects Next.js.
5. **Env vars in Vercel** — add `DATABASE_URL` (from Neon), `AUTH_SECRET` (random), `AUTH_TRUST_HOST=true`. Optionally add the seed admin vars.
6. **First deploy** runs `prisma generate` automatically. Apply migrations + seed locally against the Neon URL once:
   ```powershell
   $env:DATABASE_URL="<neon-url>"; npx prisma migrate deploy; npm run db:seed
   ```

---

## Installing as a mobile app (PWA)

Once deployed (HTTPS required):

- **iOS Safari** — open the site → Share → "Add to Home Screen"
- **Android Chrome** — open the site → tap the install icon in the address bar, or menu → "Install app"

The app runs full-screen with a chart-bar icon. No native build needed.

---

## Resetting the admin password

If you're locked out of the seeded admin, run:

```powershell
npx tsx -e "
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const hash = await bcrypt.hash('NewPassword123!', 10);
  await p.user.update({ where: { email: 'admin@example.com' }, data: { passwordHash: hash } });
  console.log('Reset.');
})().finally(() => p.$disconnect());
"
```

Or sign in as any other ADMIN user and use **Settings → Manage users → reset password**.

---

## Project layout

```
inventory-app/
├── prisma/
│   ├── schema.prisma      # 11 models — see SPEC §3
│   ├── migrations/
│   └── seed.ts            # admin + settings (+ sample data when SEED_SAMPLE_DATA=true)
├── public/
│   ├── icon.svg           # PWA icon
│   └── manifest.webmanifest
└── src/
    ├── auth.ts            # NextAuth credentials provider
    ├── auth.config.ts     # Edge-safe config for middleware
    ├── middleware.ts      # Protects all routes except /login
    ├── components/ui.tsx  # Button / Input / Card / Table primitives
    ├── lib/
    │   ├── prisma.ts
    │   ├── money.ts          # Decimal helpers + formatters
    │   ├── shipping.ts       # Allocation engine + landed cost
    │   ├── items.ts          # Stock summaries + FIFO consumption
    │   ├── analytics.ts      # Dashboard KPIs + monthly series
    │   ├── settings.ts       # Read company/VAT/FX settings
    │   ├── invoice-pdf.tsx   # @react-pdf/renderer invoice template
    │   ├── permissions.ts    # RBAC matrix + can() helper
    │   └── domain.ts         # Role/type/category constants
    └── app/
        ├── api/auth/[...nextauth]/    # NextAuth handlers (Node runtime)
        ├── login/                     # Sign-in page
        └── (app)/                     # Authenticated layout group
            ├── _components/           # AppShell + Sidebar
            ├── dashboard/             # KPIs, charts, activity
            ├── inventory/             # Items CRUD + stock history
            ├── shipments/             # Wizard + detail
            ├── customers/
            ├── sales/                 # FIFO + invoice PDF route
            ├── opex/
            ├── partners/              # ADMIN-edit, PARTNER-view
            └── settings/              # Company / VAT / FX / Users
```

---

## Operational notes

- **Money is stored as `Decimal`** — never floats. Display rounding happens at the formatters.
- **FX is locked per shipment** so historical landed costs are immune to later FX swings.
- **FIFO consumption** runs in a single DB transaction per sale; one `StockMovement` per FIFO slice for full audit.
- **VAT rate is snapshotted on `Sale`** at the moment of save, so changing the default in Settings won't alter historical invoices.
- **Shipments can't be edited or deleted in v1** — sales may have already consumed their FIFO layers. Use an adjustment movement if you need to correct stock.
- **OneDrive + node_modules** — exclude `node_modules` and `.next` from OneDrive sync; otherwise installs and builds get slow and occasionally corrupt.
