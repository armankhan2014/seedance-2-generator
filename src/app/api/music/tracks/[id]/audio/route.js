// GET /api/music/tracks/[id]/audio[?source=<kind>]
//
// Same-origin audio proxy used by the Studio Pro DAW
// (/music/studio). Web Audio API's decodeAudioData() needs a fetch()
// response WITHOUT CORS errors — but our R2 public URLs are
// cross-origin from seedance.visualseffect.com and (by default)
// don't send Access-Control-Allow-Origin headers, so the browser
// blocks the fetch with "Failed to fetch".
//
// Solution: route audio through this server endpoint. Same origin
// as the page → no CORS handshake required → decodeAudioData works.
//
// Sources (?source= query param):
//   • main            (default) — track.r2Url || audioUrl || streamUrl
//   • stem-<label>    — track.studioStems[<label>] (LALAL multistem result)
//                       e.g. stem-vocals, stem-drum, stem-bass, stem-piano
//   • voice-clean     — track.voiceCleanUrl (LALAL voice_clean result)
//
// Why one route with a switch instead of N separate routes:
// they all do the same thing — auth + ownership + look up some URL
// on the track row + stream it through. The only thing that varies
// is WHICH field on the row to read. A single route with a
// `source` switch keeps the surface area small + the cache key
// (URL) deterministic per source.
//
// Auth: caller must own the track.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// LALAL multistem labels we expose via the proxy. Keep in sync with
// STUDIO_DEFAULT_STEMS in src/lib/lalal.js — additions here without
// updates there would 404 silently for any new stem the engine
// returns.
const ALLOWED_STEM_LABELS = new Set([
  "vocals",
  "drum",
  "bass",
  "piano",
  "electric_guitar",
  "acoustic_guitar",
]);

export async function GET(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }
  const { id } = await params;
  const source = new URL(req.url).searchParams.get("source") || "main";

  // Pull a wide-enough column set in one query so the source switch
  // below doesn't need a second DB hit.
  const track = await prisma.musicTrack.findFirst({
    where: { id, userId: session.user.id, deletedAt: null },
    select: {
      r2Url: true,
      audioUrl: true,
      streamUrl: true,
      status: true,
      studioStems: true,
      voiceCleanUrl: true,
    },
  });
  if (!track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  // ── Resolve the upstream URL based on `source` ──────────────────
  let url = null;
  if (source === "main") {
    // Most durable URL first: R2 (forever) → engine final (15-day) →
    // stream (pre-mix preview).
    url = track.r2Url || track.audioUrl || track.streamUrl;
  } else if (source === "voice-clean") {
    url = track.voiceCleanUrl;
  } else if (source.startsWith("stem-")) {
    const label = source.slice("stem-".length);
    if (!ALLOWED_STEM_LABELS.has(label)) {
      return NextResponse.json({ error: "Unknown stem label" }, { status: 400 });
    }
    // studioStems is a JSON column { label → R2 url }. Reading
    // through optional chaining so a track with no Studio split
    // returns a clean 404 instead of crashing.
    url = track.studioStems?.[label] || null;
  } else {
    return NextResponse.json({ error: "Unknown source kind" }, { status: 400 });
  }

  if (!url) {
    return NextResponse.json(
      { error: `No audio available for source '${source}'` },
      { status: 404 }
    );
  }

  // ── Stream the upstream audio body through our origin ──────────
  let upstream;
  try {
    upstream = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  } catch (e) {
    console.error("[AUDIO_PROXY] fetch failed:", e?.message, "source:", source);
    return NextResponse.json({ error: "Couldn't fetch audio" }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Audio source returned ${upstream.status}` },
      { status: 502 }
    );
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") || "audio/mpeg");
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  // Cache modestly — same audio file is decoded repeatedly when
  // the user drops it on multiple lanes.
  headers.set("Cache-Control", "private, max-age=3600");
  // Belt-and-braces CORS for any future iframe/embed scenario.
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Accept-Ranges", "bytes");

  return new Response(upstream.body, { headers });
}
