// GET /api/music/tracks/[id]/stem/[stem]
//
// Server-side proxy that forces audio downloads instead of inline
// playback. The browser's <a download> attribute is silently
// ignored on CROSS-ORIGIN urls (our R2 bucket is a different origin
// than seedance.visualseffect.com), so the previous direct-link
// chips just opened the stems in a new tab + auto-played them.
//
// By proxying through this same-origin route and setting
// Content-Disposition: attachment + an informative filename, the
// browser triggers a real file save. Filename is derived from the
// track title + stem name + BPM so users get useful names like
// "midnight-rain-drums-120BPM.mp3" landing in their Downloads
// folder, ready to drop into a DAW.
//
// Auth: caller must own the track.
//
// Performance: streams r2Res.body straight back to the client via
// the Web Streams API — no buffer-the-whole-file-in-memory step,
// so large stems work without blowing the function's 50 MB
// invocation memory cap.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Map URL-friendly stem keys to (DB column, human label) tuples.
// The label is used to build the download filename.
const STEM_KEYS = {
  vocal:           { col: "vocalUrl",          label: "vocal" },
  instrumental:    { col: "instrumentalUrl",   label: "instrumental" },
  drums:           { col: "drumsUrl",          label: "drums" },
  bass:            { col: "bassUrl",           label: "bass" },
  guitar:          { col: "guitarUrl",         label: "guitar" },
  keyboard:        { col: "keyboardUrl",       label: "keyboard" },
  strings:         { col: "stringsUrl",        label: "strings" },
  brass:           { col: "brassUrl",          label: "brass" },
  woodwinds:       { col: "woodwindsUrl",      label: "woodwinds" },
  percussion:      { col: "percussionUrl",     label: "percussion" },
  synth:           { col: "synthUrl",          label: "synth" },
  fx:              { col: "fxUrl",             label: "fx" },
  "backing-vocals": { col: "backingVocalsUrl", label: "backing-vocals" },
};

// File-safe slug from arbitrary text. Strips quotes / slashes /
// emoji / anything that filesystem managers tend to mangle. Keeps
// alphanumerics + dash + underscore. Lowercase.
function safeSlug(s) {
  return (s || "track")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    || "track";
}

export async function GET(_req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }

  const { id, stem } = await params;
  const mapping = STEM_KEYS[stem];
  if (!mapping) {
    return NextResponse.json({ error: "Unknown stem" }, { status: 400 });
  }

  const track = await prisma.musicTrack.findFirst({
    where: { id, userId: session.user.id, deletedAt: null },
    select: {
      title: true,
      tempo: true,
      [mapping.col]: true,
    },
  });
  if (!track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const url = track[mapping.col];
  if (!url) {
    return NextResponse.json(
      { error: `This track doesn't have a ${mapping.label} stem.` },
      { status: 404 }
    );
  }

  // Build a useful filename. Falls back to "track" if the title
  // sanitizes down to nothing.
  const titleSlug = safeSlug(track.title);
  const bpmSuffix = track.tempo ? `-${track.tempo}BPM` : "";
  const filename = `${titleSlug}-${mapping.label}${bpmSuffix}.mp3`;

  // Stream the audio from R2 through us, with Content-Disposition
  // forcing a real download instead of inline playback.
  let upstream;
  try {
    upstream = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  } catch (e) {
    console.error("[STEM_DOWNLOAD] fetch failed:", e?.message);
    return NextResponse.json({ error: "Couldn't fetch stem" }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Stem source returned ${upstream.status}` },
      { status: 502 }
    );
  }

  // Mirror useful headers; force the disposition. Content-Length
  // from R2 lets the browser show a progress bar; Content-Type from
  // R2 keeps mime accurate (defaults to audio/mpeg for our stems).
  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") || "audio/mpeg");
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  // RFC 5987 filename* covers non-ASCII chars (Hindi titles, etc.)
  // alongside a plain ASCII fallback for older clients.
  const asciiSafe = filename.replace(/[^\x20-\x7E]/g, "_");
  headers.set(
    "Content-Disposition",
    `attachment; filename="${asciiSafe}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  headers.set("Cache-Control", "private, max-age=3600");

  return new Response(upstream.body, { headers });
}
