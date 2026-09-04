-- 2026-09-04 — Music Library v2: starred tracks + playlists
--
-- Requested by Arman: "playlist of your best music... give them a star".
-- Consumed by music.visualseffect.com (seedance-music repo). Schema
-- still lives here because seedance-2-generator owns it — the music
-- repo only ever runs `prisma generate`.
--
-- WHAT THIS ADDS:
--   1. MusicTrack.starred BOOLEAN DEFAULT false — one-tap favourite.
--      Deliberately a boolean, not a 1-5 rating: Arman picked the
--      simple toggle so the library gets a "Starred" filter without
--      asking users to rank anything.
--      Paired index (userId, starred, createdAt DESC) serves the
--      "my starred tracks, newest first" read, which is the only
--      query that touches the column.
--
--   2. Playlist — user-owned collections. `public` + `slug` ship now
--      but stay unused: Arman chose "private now, shareable later",
--      and having the columns present means enabling /playlist/[slug]
--      later needs no second migration. slug is UNIQUE but nullable —
--      Postgres permits many NULLs in a unique index, so every private
--      playlist can leave it NULL.
--
--   3. PlaylistTrack — ordered join. `position` drives manual reorder.
--      UNIQUE (playlistId, trackId) makes "add to playlist" idempotent,
--      so a double-tap can't duplicate a row.
--
-- Both FKs CASCADE: deleting a user removes their playlists, and
-- deleting a track removes it from every playlist it sat in. Note
-- MusicTrack deletion in-app is SOFT (deletedAt), so this cascade only
-- fires on a genuine hard delete.
--
-- All additive + idempotent (IF NOT EXISTS guards). No drops, no
-- rewrites of existing rows — safe to re-run.

-- ── 1. Starred ───────────────────────────────────────────────────
ALTER TABLE "MusicTrack"
  ADD COLUMN IF NOT EXISTS "starred" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "MusicTrack_userId_starred_createdAt_idx"
  ON "MusicTrack" ("userId", "starred", "createdAt" DESC);

-- ── 2. Playlist ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Playlist" (
  "id"          TEXT        NOT NULL,
  "userId"      TEXT        NOT NULL,
  "name"        TEXT        NOT NULL,
  "description" TEXT,
  "public"      BOOLEAN     NOT NULL DEFAULT false,
  "slug"        TEXT,
  "coverUrl"    TEXT,
  "deletedAt"   TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Playlist_userId_fkey'
  ) THEN
    ALTER TABLE "Playlist"
      ADD CONSTRAINT "Playlist_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Playlist_slug_key"
  ON "Playlist" ("slug");
CREATE INDEX IF NOT EXISTS "Playlist_userId_createdAt_idx"
  ON "Playlist" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Playlist_public_createdAt_idx"
  ON "Playlist" ("public", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Playlist_deletedAt_idx"
  ON "Playlist" ("deletedAt");

-- ── 3. PlaylistTrack ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PlaylistTrack" (
  "id"         TEXT        NOT NULL,
  "playlistId" TEXT        NOT NULL,
  "trackId"    TEXT        NOT NULL,
  "position"   INTEGER     NOT NULL DEFAULT 0,
  "addedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlaylistTrack_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlaylistTrack_playlistId_fkey'
  ) THEN
    ALTER TABLE "PlaylistTrack"
      ADD CONSTRAINT "PlaylistTrack_playlistId_fkey"
      FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlaylistTrack_trackId_fkey'
  ) THEN
    ALTER TABLE "PlaylistTrack"
      ADD CONSTRAINT "PlaylistTrack_trackId_fkey"
      FOREIGN KEY ("trackId") REFERENCES "MusicTrack"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "PlaylistTrack_playlistId_trackId_key"
  ON "PlaylistTrack" ("playlistId", "trackId");
CREATE INDEX IF NOT EXISTS "PlaylistTrack_playlistId_position_idx"
  ON "PlaylistTrack" ("playlistId", "position");
CREATE INDEX IF NOT EXISTS "PlaylistTrack_trackId_idx"
  ON "PlaylistTrack" ("trackId");
