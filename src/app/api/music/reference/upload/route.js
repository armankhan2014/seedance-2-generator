// POST /api/music/reference/upload
//
// Multipart audio upload for the "Inspire from a song" / "Add
// instruments to my vocals" flows on /music. Body is a single FormData
// entry named `file` containing the user's audio (recorded vocals,
// reference track, etc.).
//
// We validate, persist to R2 under `references/<userId>/<uuid>.<ext>`,
// and return the public CDN URL so the client can pass it back to
// /api/music/generate. The music engine downloads the audio from that
// URL during its `upload-cover` / `add-instrumental` calls — Suno
// requires a publicly accessible URL, hence the R2 round-trip.
//
// Limits:
//   • Audio MIME types only (audio/*).
//   • 25 MB max body — enforced both client-side and here. Most vocal
//     recordings (5-7 min MP3 @ 128kbps) come in well under.
//   • Auth required — anonymous uploads would let strangers blow up
//     our R2 bucket.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { uploadAudioBuffer, isR2Configured } from "@/lib/storage";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // R2 upload of a 25 MB file can take 10-20s on poor links

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ["audio/"];
// Common audio extensions → fallback Content-Type when the browser
// fails to attach one (some iOS / Safari uploads come through as
// application/octet-stream).
const EXT_TO_MIME = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  flac: "audio/flac",
  opus: "audio/opus",
  webm: "audio/webm",
};

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Audio uploads are temporarily disabled (R2 not configured)." },
      { status: 503 }
    );
  }

  let form;
  try {
    form = await req.formData();
  } catch (e) {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Missing `file` field" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `File is too large (${Math.round(file.size / 1024 / 1024)} MB). Max 25 MB — try compressing first.`,
      },
      { status: 413 }
    );
  }
  if (file.size < 1024) {
    return NextResponse.json({ error: "File looks empty" }, { status: 400 });
  }

  // Resolve MIME — prefer the browser-provided type, fall back to the
  // extension map when the browser sends application/octet-stream
  // (common on iOS WebKit uploads).
  const filename = (file.name || "upload").trim();
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  let contentType = (file.type || "").toLowerCase();
  if (!contentType || !ALLOWED_MIME_PREFIXES.some((p) => contentType.startsWith(p))) {
    if (EXT_TO_MIME[ext]) {
      contentType = EXT_TO_MIME[ext];
    } else {
      return NextResponse.json(
        { error: "Only audio files (MP3, WAV, M4A, OGG, FLAC, AAC) are supported." },
        { status: 415 }
      );
    }
  }

  // Stream → Buffer. For 25 MB files this fits comfortably in memory.
  const buffer = Buffer.from(await file.arrayBuffer());

  // Object key: scoped per user so even if R2 ACLs ever leak, the path
  // structure self-documents ownership. UUID prevents collisions on
  // simultaneous uploads.
  const safeExt = EXT_TO_MIME[ext] ? ext : "mp3";
  const key = `references/${session.user.id}/${randomUUID()}.${safeExt}`;

  let url;
  try {
    url = await uploadAudioBuffer(buffer, key, contentType);
  } catch (err) {
    console.error("[MUSIC_REF_UPLOAD]", err);
    return NextResponse.json({ error: "Upload failed — try again." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    url,
    key,
    name: filename,
    size: file.size,
    contentType,
  });
}
