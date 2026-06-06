-- 2026-06-06 — Social-proof Phase 2: config table + click tracking + opt-out
--
-- WHAT THIS ADDS:
--   1. SocialProofConfig — single-row table holding the runtime
--      knobs the admin page controls. id is locked to 1; an
--      `INSERT … ON CONFLICT DO NOTHING` seeds the row.
--        enabled       BOOLEAN — master kill switch
--        sourceMode    TEXT    — 'real' | 'dummy' | 'both'
--        updatedAt     TIMESTAMPTZ
--   2. SocialProofShown.clicked BOOLEAN DEFAULT false — set true
--      when the visitor clicks through the popup. Powers CTR.
--   3. User.socialProofOptOut BOOLEAN DEFAULT false — per-user
--      preference, surfaced in the Edit Profile Privacy section.
--
-- All additive + idempotent (IF NOT EXISTS guards).

CREATE TABLE IF NOT EXISTS "SocialProofConfig" (
  "id"         INTEGER     PRIMARY KEY,
  "enabled"    BOOLEAN     NOT NULL DEFAULT true,
  "sourceMode" TEXT        NOT NULL DEFAULT 'both',
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO "SocialProofConfig" ("id", "enabled", "sourceMode")
VALUES (1, true, 'both')
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "SocialProofShown"
  ADD COLUMN IF NOT EXISTS "clicked" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "socialProofOptOut" BOOLEAN NOT NULL DEFAULT false;
