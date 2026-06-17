#!/bin/sh
set -e

echo "→ Waiting for the database, then applying migrations…"
# migrate deploy is idempotent and safe to run on every boot.
npx prisma migrate deploy

echo "→ Seeding admin user + default settings (idempotent)…"
# The seed creates the admin + default settings if missing. Sample demo data
# is only added when SEED_SAMPLE_DATA=true.
npx prisma db seed || echo "Seed step skipped/failed (non-fatal): continuing."

echo "→ Starting the app…"
exec "$@"
