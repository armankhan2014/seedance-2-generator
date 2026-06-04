-- 2026-06-04 — Profile v2 (Phase 2) — additive User columns
--
-- WHY MANUAL AND NOT `prisma migrate`:
--   The Neon Postgres instance is shared with seedance-community,
--   seedance-music, and seedance-edits. `prisma migrate dev` would
--   try to reset the DB or drop columns it doesn't recognise in its
--   own schema. Manual additive SQL with IF NOT EXISTS lets each
--   app's Prisma client catch up to canonical column definitions
--   without ever destroying data.
--
-- WHAT THIS ADDS:
--   • tagline    VARCHAR(120) NULL   — one-liner shown under display
--                                       name on /profile + cards.
--   • pronouns   VARCHAR(40)  NULL   — optional pronouns label.
--
-- WHAT ALREADY EXISTS (community wrote these columns; seedance
-- just hasn't taught its Prisma client about them yet):
--   • bio          TEXT     NULL
--   • coverImageUrl TEXT    NULL
--   • location     TEXT     NULL
--   • isPrivate    BOOLEAN  DEFAULT false
--   • UserSocialLink table (id, userId, platform, handle, url,
--     position, hidden, clicks, createdAt, updatedAt)
--
-- HOW TO APPLY (run from project root with .env.local DATABASE_URL):
--   DATABASE_URL=$(grep '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2- | tr -d '"') \
--     npx prisma db execute \
--     --file=prisma/manual-migrations/2026-06-04-add-profile-tagline-pronouns.sql \
--     --schema=prisma/schema.prisma

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "tagline"  VARCHAR(120);

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "pronouns" VARCHAR(40);
