# Hourly Cloud Backups — Setup Guide

This repo runs an **hourly Postgres backup** automatically via GitHub
Actions. Once set up, it runs on its own forever — no servers, no
maintenance, no cost on the GitHub free tier.

---

## What gets backed up

| Item | How | Where it lives | Frequency |
|---|---|---|---|
| **Source code** | Every git push | GitHub (`armankhan2014/seedance-2-generator`) | Every push |
| **Postgres database** (users, creations, payments, visits) | This GitHub Action | R2 bucket under `db-backups/` | **Every hour** |
| **R2 storage** (videos, images) | Cloudflare's own durability (11 nines) | Cloudflare R2 | Continuous |
| **Vercel project config** (env vars, domain) | Manual `vercel env pull` | Wherever you save the file | When you change env vars |

Note: R2 files don't change once uploaded (write-once), so re-copying
them every hour would waste bandwidth for zero benefit. Cloudflare
itself is the backup for that data.

---

## One-time setup (5 minutes)

### Step 1 — Add 5 secrets to GitHub

1. Open the repo on GitHub:
   <https://github.com/armankhan2014/seedance-2-generator>
2. Click **Settings** → **Secrets and variables** → **Actions**.
3. Click **New repository secret** and add each of these one by one:

| Name | Where to get it |
|---|---|
| `DATABASE_URL` | Vercel → Project → Settings → Environment Variables → copy `DATABASE_URL` |
| `R2_ACCOUNT_ID` | Vercel → same page → copy `R2_ACCOUNT_ID` |
| `R2_ACCESS_KEY_ID` | Vercel → same page → copy `R2_ACCESS_KEY_ID` |
| `R2_SECRET_ACCESS_KEY` | Vercel → same page → copy `R2_SECRET_ACCESS_KEY` |
| `R2_BUCKET_NAME` | Vercel → same page → copy `R2_BUCKET_NAME` (e.g. `seedance-videos`) |

You're reusing the production R2 credentials. Backups go into the
**same bucket** under a `db-backups/` prefix, separate from your
production videos.

### Step 2 — Verify it works

1. In GitHub, click the **Actions** tab.
2. Click **Hourly DB Backup** in the left sidebar.
3. Click **Run workflow** → **Run workflow** (manual trigger).
4. Wait 1–2 minutes. The run should turn green.
5. In Cloudflare R2 dashboard → your bucket → `db-backups/`, you
   should see a file like `db-2026-05-07-1100.sql.gz`.

That's it — it'll now run every hour automatically.

---

## Retention policy

Old dumps are auto-deleted on each run. You'll always have:

- **Last 48 hourly dumps** (last 2 days, hour by hour)
- **Last 30 daily dumps** (the 00:00 UTC dump from each of the last 30 days)
- **Last 12 monthly dumps** (the 1st-of-month, 00:00 UTC dump from the last year)

Total: ~90 dumps at peak. Each is a few MB gzipped, so storage cost
is well under $0.10/month.

---

## How to restore the database

### Scenario A — restore to the same Neon database

1. Download the dump you want from R2:
   - Cloudflare dashboard → R2 → your bucket → `db-backups/`
   - Click the file → Download
2. Decompress: `gunzip db-2026-05-07-1100.sql.gz`
3. Pull your DATABASE_URL: `vercel env pull .env.local`
4. Run the restore (this replaces all data — be sure):
   ```
   psql "$DATABASE_URL" < db-2026-05-07-1100.sql
   ```
5. Reload the live site — data is back.

### Scenario B — restore to a fresh Neon database

Same steps, but in step 3 use the connection string for a brand-new
Neon project. Then update `DATABASE_URL` on Vercel to point at the new
DB and redeploy.

### Scenario C — point-in-time recovery

If you need a moment that ISN'T at the top of an hour, use Neon's
own built-in point-in-time recovery first (console.neon.tech →
project → **Backups**). Neon retains 7 days of branch history on the
free plan, 30 days on paid. Our R2 dumps are the *long-term*
fallback if Neon's history doesn't cover what you need.

---

## How to monitor

- GitHub will email you if a run fails (default behavior on free tier).
- The Actions tab shows the last 90 days of runs at a glance.
- Each successful run leaves a notice with the file path it wrote.

---

## How much does it cost?

**$0/month** on standard usage:
- GitHub Actions: 720 runs/month × ~1 minute = 720 minutes. Free tier
  for private repos is 2,000 min/mo — plenty of margin.
- R2 storage: ~90 dumps × <5 MB each ≈ 450 MB. R2 storage is
  $0.015/GB/month → ~$0.007/month.
- R2 egress (download): R2 has free egress, so restore costs $0.

---

## What's NOT covered (and what to do)

- **Environment variables** — they live on Vercel and on this guide.
  Once a quarter, run `vercel env pull .env.production.backup` and
  store the file in 1Password / a password manager.
- **R2 bucket itself** — Cloudflare's durability is excellent. If you
  want a paranoid copy in another cloud, use `rclone sync r2:your-bucket
  ~/r2-mirror/` weekly. Optional.
- **Vercel project settings** (custom domain, build commands) — these
  are easy to recreate from memory. If you want a snapshot, a
  screenshot of Settings → General + Settings → Domains is enough.
