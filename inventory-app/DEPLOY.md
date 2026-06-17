# Deploying to Serverspace UAE + a custom domain

This guide takes the app live on a **Serverspace** VPS in the **UAE (Dubai)** region with
**HTTPS** and your own domain. The stack runs as three Docker containers managed by Docker Compose:

```
Internet ──▶ Caddy (TLS, ports 80/443) ──▶ app (Next.js :3000) ──▶ db (Postgres)
                auto Let's Encrypt cert         migrate + seed        in-region volume
```

Everything (app + database) stays on **your** UAE server — data never leaves the region.

Estimated time: ~30–40 minutes. You need a card for the VPS (~$5–8/mo) and the domain (~$10–15/yr).

---

## What you do vs what's automated

| Step | Who |
|---|---|
| Create Serverspace account + VPS | **You** (account + payment) |
| Register the domain | **You** (account + payment) |
| Point DNS A record at the server | **You** (paste one record) |
| Install Docker, copy files, set secrets, launch | Commands below — copy/paste |
| Build image, run DB migrations, get TLS cert, seed admin | **Automated** on first `docker compose up` |

---

## 1. Provision the VPS (Serverspace)

1. Sign up at **https://serverspace.io** and create a new server:
   - **Location:** United Arab Emirates (Dubai)
   - **OS:** Ubuntu 24.04 LTS
   - **Size:** 2 vCPU / 4 GB RAM / 40+ GB SSD is comfortable (1 vCPU / 2 GB works for light use)
   - Add your SSH key (recommended) or use the root password they email you.
2. Note the server's **public IPv4 address** — call it `SERVER_IP`.

SSH in:
```bash
ssh root@SERVER_IP
```

## 2. Install Docker

```bash
# Ubuntu 24.04 — official Docker install
apt-get update -y
apt-get install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
docker --version && docker compose version
```

## 3. Get the code onto the server

Pick **one**:

**Option A — Git (recommended).** Push this project to a private GitHub repo from your PC, then:
```bash
cd /opt
git clone https://github.com/<you>/<repo>.git inventory-app
cd inventory-app/inventory-app    # the Next.js app lives in this subfolder
```

**Option B — Copy directly with scp** (run on your Windows PC, in PowerShell):
```powershell
scp -r "C:\Users\Hp\OneDrive\Inventory App\inventory-app" root@SERVER_IP:/opt/inventory-app
```
then on the server: `cd /opt/inventory-app`

> The folder you run `docker compose` from must contain `docker-compose.yml`, `Dockerfile`,
> and `Caddyfile` (that's the `inventory-app` app folder).

## 4. Register your domain + point DNS at the server

1. Register a domain at any registrar (Namecheap, Cloudflare, GoDaddy, etc.).
2. In the registrar's DNS settings, add these records (replace `SERVER_IP`):

   | Type | Name / Host | Value | TTL |
   |---|---|---|---|
   | A | `@` | `SERVER_IP` | Auto / 300 |
   | A | `www` | `SERVER_IP` | Auto / 300 |

3. Wait for DNS to propagate (usually minutes, up to ~1 hour). Check from the server:
   ```bash
   apt-get install -y dnsutils
   dig +short yourdomain.com    # should print SERVER_IP
   ```

> TLS will only succeed once `yourdomain.com` resolves to `SERVER_IP`, so do this **before** launch.

## 5. Configure secrets

```bash
cp .env.production.example .env
nano .env
```

Fill every value. Generate strong secrets:
```bash
# AUTH_SECRET
openssl rand -base64 32
# POSTGRES_PASSWORD
openssl rand -base64 24
```

Minimum to set: `DOMAIN`, `ACME_EMAIL`, `POSTGRES_PASSWORD`, `AUTH_SECRET`,
`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`. Leave `SEED_SAMPLE_DATA=false` for real use.

## 6. Open the firewall (if enabled)

```bash
# If ufw is active, allow web + SSH:
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
```
Also make sure Serverspace's cloud firewall (in their panel) allows inbound 80, 443, 22.

## 7. Launch 🚀

```bash
docker compose up -d --build
```

First run will: build the image, start Postgres, **apply migrations**, **seed the admin user
+ default settings**, start the app, and Caddy will **fetch a Let's Encrypt certificate**.

Watch it come up:
```bash
docker compose logs -f
# look for: "Starting the app…", then Caddy "certificate obtained"
```

Visit **https://yourdomain.com** — you should see the sign-in page with a valid padlock.

## 8. First login & hardening

1. Log in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
2. Go to **Settings → Manage users**, open your admin user, and **change the password**.
3. Fill in **Settings → Company info / VAT / FX** so invoices and defaults are correct.
4. Add your partners and real data.

---

## Day-2 operations

**Update to a new version** (after pulling new code):
```bash
cd /opt/inventory-app/inventory-app
git pull          # or re-scp the folder
docker compose up -d --build
```
Migrations apply automatically on restart.

**Back up the database** (run on a schedule, e.g. cron):
```bash
docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "backup-$(date +%F).sql.gz"
```

**Restore a backup:**
```bash
gunzip -c backup-YYYY-MM-DD.sql.gz | docker compose exec -T db psql -U "$POSTGRES_USER" "$POSTGRES_DB"
```

**Stop / start:**
```bash
docker compose down      # stop (data is kept in the db_data volume)
docker compose up -d      # start again
```

**View logs:**
```bash
docker compose logs -f app
docker compose logs -f caddy   # TLS / cert issues show here
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Browser shows "not secure" / no cert | DNS A record isn't pointing at `SERVER_IP` yet, or ports 80/443 are blocked. Check `dig +short yourdomain.com` and the cloud firewall. Caddy retries automatically. |
| `app` keeps restarting | `docker compose logs app` — usually a bad `DATABASE_URL` or missing `AUTH_SECRET` in `.env`. |
| Can't log in | Confirm the seed ran: `docker compose logs app | grep -i admin`. Re-seed: `docker compose exec app npx prisma db seed`. |
| Migrations didn't apply | `docker compose exec app npx prisma migrate deploy` |
| Need a shell in the DB | `docker compose exec db psql -U "$POSTGRES_USER" "$POSTGRES_DB"` |

---

## Notes

- **Data residency:** Postgres runs in a Docker volume on the UAE server; nothing leaves the region.
- **Secrets:** `.env` is git-ignored. Never commit it. Keep a copy of `AUTH_SECRET` — rotating it logs everyone out.
- **Scaling later:** if you outgrow one box, move Postgres to a managed UAE Postgres and point `DATABASE_URL` at it; the app containers stay stateless.
- **Email/domain at one provider:** if you also want email on the domain, set MX records separately — they don't affect this app.
