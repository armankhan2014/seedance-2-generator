// GET /api/music/tracks/[id]/audio
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
// The proxy also adds permissive CORS for any future client that
// needs it. Streams audio body through unchanged so we don't buffer
// large files in memory.
//
// Distinct from /api/music/tracks/[id]/stem/[stem]/route.js in two
// ways:
//   1. No Content-Disposition: attachment — the DAW needs audio to
//      play inline, not download.
//   2. Hits the track's MAIN audio (r2Url || audioUrl || streamUrl),
//      not the individual stem files.
//
// Auth: caller must own the track (we don't expose other users'
// audio through our origin, even if they made it public).

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }
  const { id } = await params;

  const track = await prisma.musicTrack.findFirst({
    where: { id, userId: session.user.id, deletedAt: null },
    select: { r2Url: true, audioUrl: true, streamUrl: true, status: true },
  });
  if (!track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }
  // Prefer the most durable URL: R2 (forever) → engine final
  // (15-day life) → engine stream (fastest available pre-mix).
  const url = track.r2Url || track.audioUrl || track.streamUrl;
  if (!url) {
    return NextResponse.json({ error: "No audio available yet" }, { status: 404 });
  }

  let upstream;
  try {
    upstream = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  } catch (e) {
    console.error("[AUDIO_PROXY] fetch failed:", e?.message);
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
  // Belt-and-braces: even though this is same-origin, expose CORS
  // headers in case the StudioClient is ever embedded into an
  // iframe or another origin in the future.
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Accept-Ranges", "bytes");

  return new Response(upstream.body, { headers });
}
