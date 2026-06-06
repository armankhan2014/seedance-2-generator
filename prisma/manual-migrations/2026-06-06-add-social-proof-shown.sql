-- 2026-06-06 — Social-proof popup tracking
--
-- WHY MANUAL AND NOT `prisma migrate`:
--   Shared Neon DB with community/music/edits; prisma migrate dev
--   would try to reset.
--
-- WHAT THIS ADDS:
--   SocialProofShown — append-only log of "this visitor saw a popup
--   for this user". The (visitorIp, shownUserId) pair is the no-
--   repeat key: once we've logged a row for a given IP + user, that
--   user never appears in a popup served to that IP again.
--
--   • visitorIp   TEXT  — first request IP captured server-side
--                          via x-vercel-ip-* / x-forwarded-for
--   • shownUserId TEXT  — FK to User.id (CASCADE on user delete so
--                          dummy cleanup doesn't orphan rows)
--   • shownAt     TIMESTAMPTZ DEFAULT NOW()
--
-- INDEXES:
--   • PRIMARY KEY (id)
--   • UNIQUE (visitorIp, shownUserId) — dedupe at write time;
--     ON CONFLICT DO NOTHING in the insert so concurrent shows
--     don't double-write.
--   • (visitorIp, shownAt DESC) — fast queue-fetch path:
--     "give me userIds NOT IN (already-shown set for this IP)".
--
-- HOW TO APPLY:
--   export DATABASE_URL=$(grep '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2- | tr -d '"')
--   npx prisma db execute --file prisma/manual-migrations/2026-06-06-add-social-proof-shown.sql

CREATE TABLE IF NOT EXISTS "SocialProofShown" (
  "id"          TEXT        PRIMARY KEY,
  "visitorIp"   TEXT        NOT NULL,
  "shownUserId" TEXT        NOT NULL,
  "shownAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SocialProofShown_userId_fkey"
    FOREIGN KEY ("shownUserId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SocialProofShown_ip_user_unique"
  ON "SocialProofShown" ("visitorIp", "shownUserId");

CREATE INDEX IF NOT EXISTS "SocialProofShown_ip_time_idx"
  ON "SocialProofShown" ("visitorIp", "shownAt" DESC);
