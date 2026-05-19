// GET /api/music/tracks/[id]/download[?filename=...]
//
// PUBLIC audio download endpoint. Mirrors the access rules of the
// /m/[id] share page: anyone with a track id for a completed,
// non-deleted track can download it.
//
// Why a separate route from /audio:
//   • /audio is auth-scoped (Studio uses it for proxied decode +
//     in-app playback).
//   • This one is anonymous and only ever serves the main mix as a
//     forced-download. iOS Safari ignores the HTML <a download>
//     attribute when the source is cross-origin (R2) + audio/*, so
//     mobile users get an in-tab player instead of a saved file.
//     This route sets Content-Disposition: attachment so the
//     browser always saves.
//
// Cross-tab safety: still scoped to status=completed + deletedAt=null
// so deleted / processing tracks 404 cleanly.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req, { params }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const url0 = new URL(req.url);
  const requested = url0.searchParams.get("filename") || "";

  const track = await prisma.musicTrack.findFirst({
    where: { id, status: "completed", deletedAt: null },
    select: { title: true, r2Url: true, audioUrl: true, streamUrl: true },
  });
  if (!track) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const upstreamUrl = track.r2Url || track.audioUrl || track.streamUrl;
  if (!upstreamUrl) {
    return NextResponse.json({ error: "No audio available" }, { status: 404 });
  }

  let upstream;
  try {
    upstream = await fetch(upstreamUrl, { signal: AbortSignal.timeout(60_000) });
  } catch (e) {
    console.error("[MUSIC_DOWNLOAD] fetch failed:", e?.message);
    return NextResponse.json({ error: "Couldn't fetch audio" }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: `Audio source returned ${upstream.status}` }, { status: 502 });
  }

  // Build a safe filename. Prefer the caller-provided one (encoded
  // by the link), otherwise fall back to the track title.
  const base = (requested || track.title || "track")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80) || "track";
  const filename = /\.mp3$/i.test(base) ? base : `${base}.mp3`;

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") || "audio/mpeg");
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Accept-Ranges", "bytes");

  return new Response(upstream.body, { headers });
}
