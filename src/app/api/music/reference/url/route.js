// POST /api/music/reference/url   { url: "https://..." }
//
// Server-side audio fetch for the reference flow. The user pastes a
// direct URL to an audio file (MP3, WAV, M4A, etc. — anything served
// with `Content-Type: audio/*`); we download it, validate, and mirror
// to our R2 under references/<userId>/<uuid>.<ext>.
//
// Why not YouTube / SoundCloud? Two reasons:
//   1. yt-dlp / ytdl-core are an operational headache on Vercel
//      (TOS issues, frequent breakage, Python runtime weight).
//   2. We can't take responsibility for users downloading copyrighted
//      content from those platforms.
//
// Direct audio URLs (Dropbox public links, S3 buckets, personal
// hosting, a hosted MP3 someone shared) are the safe sweet spot.
// If a user wants YouTube specifically, they can run it through
// cobalt.tools or any other external converter first.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { uploadAudioBuffer, isR2Configured } from "@/lib/storage";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

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

// SSRF guard — never let server-side fetch hit internal services.
// Public URLs only.
const BLOCKED_HOSTS = new Set([
  "localhost", "127.0.0.1", "0.0.0.0",
  "metadata.google.internal", "169.254.169.254",
]);

function isUrlSafe(u) {
  try {
    const parsed = new URL(u);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(host)) return false;
    // Block obvious private ranges (best-effort string check; not a
    // full RFC1918 parser, just a basic guard against the dumbest
    // probes).
    if (/^10\./.test(host)) return false;
    if (/^192\.168\./.test(host)) return false;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return false;
    if (host.endsWith(".internal") || host.endsWith(".local")) return false;
    return true;
  } catch {
    return false;
  }
}

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

  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "Missing `url`" }, { status: 400 });
  }
  if (!isUrlSafe(url)) {
    return NextResponse.json(
      { error: "URL not allowed. Provide a public HTTPS link to an MP3/WAV/M4A file." },
      { status: 400 }
    );
  }

  // Friendly reject of platforms we know need a converter. Bigger
  // user-facing signal than a generic "Content-Type isn't audio/" error.
  const lowerUrl = url.toLowerCase();
  if (
    lowerUrl.includes("youtube.com") ||
    lowerUrl.includes("youtu.be") ||
    lowerUrl.includes("soundcloud.com") ||
    lowerUrl.includes("spotify.com")
  ) {
    return NextResponse.json(
      {
        error: "YouTube / SoundCloud / Spotify links aren't supported yet — convert to MP3 first (e.g. cobalt.tools) then paste the direct MP3 URL.",
      },
      { status: 400 }
    );
  }

  // ── Fetch the audio ──────────────────────────────────────────────
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Couldn't reach that URL: ${e?.message || "fetch failed"}` },
      { status: 502 }
    );
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) {
    return NextResponse.json(
      { error: `Source returned ${resp.status} — make sure the URL is publicly accessible.` },
      { status: 400 }
    );
  }

  // Validate content-type. Some servers serve audio as
  // application/octet-stream — we accept those if the URL has an audio
  // file extension.
  let contentType = (resp.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const ext = url.split(/[?#]/)[0].split(".").pop()?.toLowerCase() || "";
  if (!contentType.startsWith("audio/")) {
    if (EXT_TO_MIME[ext]) {
      contentType = EXT_TO_MIME[ext];
    } else {
      return NextResponse.json(
        {
          error: `The URL doesn't appear to be an audio file (got ${contentType || "no Content-Type"}). Paste a direct MP3/WAV link.`,
        },
        { status: 415 }
      );
    }
  }

  // Validate size — prefer Content-Length header if present.
  const declaredLen = Number(resp.headers.get("content-length") || 0);
  if (declaredLen > MAX_BYTES) {
    return NextResponse.json(
      { error: `Source file is too large (${Math.round(declaredLen / 1024 / 1024)} MB). Max 25 MB.` },
      { status: 413 }
    );
  }

  // Stream → Buffer, with a size cap during read so a lying
  // Content-Length can't blow the function's memory.
  let buffer;
  try {
    const arrBuf = await resp.arrayBuffer();
    if (arrBuf.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: `Source file is too large (${Math.round(arrBuf.byteLength / 1024 / 1024)} MB). Max 25 MB.` },
        { status: 413 }
      );
    }
    if (arrBuf.byteLength < 1024) {
      return NextResponse.json({ error: "Downloaded file looks empty." }, { status: 400 });
    }
    buffer = Buffer.from(arrBuf);
  } catch (e) {
    return NextResponse.json({ error: "Couldn't read source file." }, { status: 502 });
  }

  const safeExt = EXT_TO_MIME[ext] ? ext : "mp3";
  const key = `references/${session.user.id}/${randomUUID()}.${safeExt}`;

  let r2Url;
  try {
    r2Url = await uploadAudioBuffer(buffer, key, contentType);
  } catch (err) {
    console.error("[MUSIC_REF_URL]", err);
    return NextResponse.json({ error: "Mirror to storage failed — try again." }, { status: 500 });
  }

  // Build a friendly display name from the URL path.
  let name;
  try {
    name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "audio");
  } catch {
    name = "audio";
  }

  return NextResponse.json({
    ok: true,
    url: r2Url,
    key,
    name,
    size: buffer.length,
    contentType,
  });
}
