-- Manual migration: 2026-06-02 — add signup geo + source fields to User
--
-- Why manual instead of `prisma migrate dev`:
--   The Neon Postgres DB is shared between seedance-2-generator (this repo)
--   and seedance-community. Both projects have their own Prisma schemas and
--   have each pushed columns directly. The two `prisma/schema.prisma` files
--   are out of sync with each other AND with the live DB — running
--   `prisma migrate dev` here would try to `migrate reset` the entire schema
--   to match this repo's view, dropping community's columns.
--
-- This migration is additive-only: 9 new columns + 4 indexes + 1 FK.
-- Existing rows get NULL for the new columns (no breaking changes).
-- New signups will get @default(now()) for createdAt.
--
-- Apply via:
--   export $(grep -E "^DATABASE_URL=" .env.local | xargs)
--   psql "$DATABASE_URL" -f prisma/manual-migrations/2026-06-02-add-signup-geo-and-source.sql
--   # or, without psql installed:
--   npx prisma db execute --file=prisma/manual-migrations/2026-06-02-add-signup-geo-and-source.sql
--
-- Rollback (if needed) — drop the 9 columns + 4 indexes + 1 FK:
--   ALTER TABLE "User"
--     DROP COLUMN "createdAt", DROP COLUMN "country", DROP COLUMN "region",
--     DROP COLUMN "city", DROP COLUMN "latitude", DROP COLUMN "longitude",
--     DROP COLUMN "ipAddress", DROP COLUMN "signupSource", DROP COLUMN "referredById";
--   DROP INDEX "User_createdAt_idx";
--   DROP INDEX "User_country_idx";
--   DROP INDEX "User_signupSource_idx";
--   DROP INDEX "User_referredById_idx";

-- IF NOT EXISTS guards mean this script is safely re-runnable.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "createdAt"    TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "country"      VARCHAR(2);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "region"       TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "city"         TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "latitude"     DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "longitude"    DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "ipAddress"    TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupSource" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referredById" TEXT;

-- Self-referential FK for referral attribution. ON DELETE SET NULL means
-- deleting a referrer doesn't cascade-delete their referrals; the
-- referredById field just becomes NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'User' AND constraint_name = 'User_referredById_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_referredById_fkey"
      FOREIGN KEY ("referredById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

-- Index strategy:
--   • createdAt DESC = primary admin dashboard query
--     ("most recent signups", "signups today", date-range filters)
--   • country       = filter by country in admin UI
--   • signupSource  = filter by source channel in admin UI
--   • referredById  = "users this user referred" lookup
CREATE INDEX IF NOT EXISTS "User_createdAt_idx"    ON "User" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "User_country_idx"      ON "User" ("country");
CREATE INDEX IF NOT EXISTS "User_signupSource_idx" ON "User" ("signupSource");
CREATE INDEX IF NOT EXISTS "User_referredById_idx" ON "User" ("referredById");
