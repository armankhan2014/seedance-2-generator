-- 2026-06-04 — Profile v2 (Phase 3b.1) — public @handle support
--
-- WHY MANUAL AND NOT `prisma migrate`:
--   The Neon Postgres instance is shared with seedance-community,
--   seedance-music, and seedance-edits. `prisma migrate dev` would
--   try to reset the DB or drop columns the seedance schema doesn't
--   yet know about. Manual additive SQL with IF NOT EXISTS guards
--   lets each app's Prisma client catch up to canonical column
--   definitions without ever destroying data.
--
-- WHAT THIS ADDS:
--   • username             VARCHAR(30) UNIQUE NULL — public @handle.
--                          Stored lowercase; case-insensitive
--                          uniqueness via a functional UNIQUE INDEX
--                          on LOWER(username) (the column itself
--                          stores whatever case the user typed —
--                          for display — but the index ensures
--                          "Arman" and "arman" can't coexist).
--   • usernameChangedAt    TIMESTAMPTZ NULL — when the user last
--                          changed their @handle. NULL = never set
--                          one. Drives the 30-day cooldown logic
--                          enforced in /api/me PATCH.
--
-- WHY VARCHAR(30):
--   Pragmatic middle: short enough to fit on chips + URL bars
--   without truncation, long enough to host most personal handles
--   ("vincentcassel", "filmmaker_at_42" both fit). Matches X /
--   Instagram's 30-char ceiling.
--
-- HOW TO APPLY:
--   export DATABASE_URL=$(grep '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2- | tr -d '"')
--   export DIRECT_URL=$(grep '^DIRECT_URL='   .env.local | head -1 | cut -d= -f2- | tr -d '"')
--   npx prisma db execute --file prisma/manual-migrations/2026-06-04-add-username-and-cooldown.sql

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "username"          VARCHAR(30);

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "usernameChangedAt" TIMESTAMPTZ;

-- Case-insensitive uniqueness. Partial index (WHERE NOT NULL) so
-- the ~2,359 rows currently sitting at NULL don't compete for the
-- empty slot. The functional LOWER(...) means "Arman" and "arman"
-- can't both exist; the column itself preserves the user's chosen
-- casing for display.
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_lower_unique"
  ON "User" (LOWER("username"))
  WHERE "username" IS NOT NULL;

-- Index for the cooldown-check query path
-- (SELECT usernameChangedAt FROM User WHERE id = ?).
-- Already covered by the PK; nothing extra to add.
