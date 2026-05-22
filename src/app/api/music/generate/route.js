// POST /api/music/generate   { genre, mood, duration, isVocal, lyrics, prompt, tempo, model? }
//
// Authed endpoint that kicks off a music engine music generation. Flow:
//   1. Validate input + compute credit cost (creditsForTrack).
//   2. Atomically debit credits from the caller (compare-and-swap so
//      double-clicks can't double-charge).
//   3. Call music engine's POST /api/v1/generate, passing our public webhook
//      URL as the callBackUrl.
//   4. Persist a MusicTrack row in status="processing" with the
//      music engine taskId so the callback handler can find it later.
//   5. Return { trackId, taskId } to the client so it can poll
//      /api/music/tracks/[id] for status until streamUrl appears.
//
// On any failure between debit + music engine acknowledgement, we refund the
// credits immediately so the user isn't out of pocket for a render
// that never started.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  generateMusic,
  generateCover,
  addInstrumentalToVocal,
  buildStyleString,
  creditsForTrack,
  scrubVendor,
} from "@/lib/suno";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALLOWED_DURATIONS = new Set([30, 60, 120, 180]);
const ALLOWED_MODELS = new Set(["V4", "V4_5", "V4_5PLUS", "V4_5ALL", "V5", "V5_5"]);
const MAX_PROMPT = 5000;
const MAX_LYRICS = 5000;
const ALLOWED_REFERENCE_MODES = new Set(["cover", "add-instrumental"]);

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // ── Validate ────────────────────────────────────────────────────────
  const duration = Number(body.duration);
  if (!ALLOWED_DURATIONS.has(duration)) {
    return NextResponse.json({ error: "Invalid duration" }, { status: 400 });
  }
  // Note: isVocal may be forced true below when referenceMode is
  // "add-instrumental" — the user's uploaded vocals are always
  // preserved in that flow, so the output is by definition vocal.
  let isVocal = !!body.isVocal;
  const genre = typeof body.genre === "string" ? body.genre.slice(0, 32) : null;
  const mood = typeof body.mood === "string" ? body.mood.slice(0, 32) : null;
  const tempo = Number.isFinite(body.tempo) ? Math.max(60, Math.min(180, body.tempo)) : null;
  const promptRaw = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const lyricsRaw = typeof body.lyrics === "string" ? body.lyrics.trim() : "";
  if (promptRaw.length > MAX_PROMPT) {
    return NextResponse.json({ error: `Prompt too long (max ${MAX_PROMPT})` }, { status: 400 });
  }
  if (lyricsRaw.length > MAX_LYRICS) {
    return NextResponse.json({ error: `Lyrics too long (max ${MAX_LYRICS})` }, { status: 400 });
  }
  const model = ALLOWED_MODELS.has(body.model) ? body.model : "V5";
  const vocalGender = body.vocalGender === "f" || body.vocalGender === "m"
    ? body.vocalGender
    : undefined;
  // Optional free-text Style override — music engine's own "Style" field.
  // When non-empty, it REPLACES the genre-derived buildStyleString.
  // Capped at 1000 chars (music engine's V4.5+ limit).
  const customStyle = typeof body.customStyle === "string"
    ? body.customStyle.trim().slice(0, 1000)
    : "";
  // Optional comma-separated list of styles / instruments / moods
  // the engine should avoid. Capped at 300 chars (well under any
  // upstream limit).
  const negativeTags = typeof body.negativeTags === "string"
    ? body.negativeTags.trim().slice(0, 300)
    : "";
  // Reference mode (Phase A): the user uploaded a song to inspire
  // generation (cover) or their own vocals to be backed by instruments
  // (add-instrumental). referenceUrl is the R2 URL that the
  // /api/music/reference/{upload,url} routes returned. We validate
  // it points at our own R2 bucket so a malicious caller can't
  // redirect the engine at an arbitrary URL.
  const referenceMode = ALLOWED_REFERENCE_MODES.has(body.referenceMode)
    ? body.referenceMode
    : null;
  const rawRefUrl = typeof body.referenceUrl === "string" ? body.referenceUrl.trim() : "";
  const r2Base = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  const referenceUrl =
    referenceMode && rawRefUrl && r2Base && rawRefUrl.startsWith(r2Base + "/references/")
      ? rawRefUrl
      : null;
  if (referenceMode && !referenceUrl) {
    return NextResponse.json(
      { error: "Upload a reference audio file before choosing this mode." },
      { status: 400 }
    );
  }
  // The user's vocals get preserved in add-instrumental mode — the
  // output is always a vocal track regardless of what the form sent.
  // Force the flag so the credit calc (creditsForTrack uses isVocal)
  // matches reality + the title fallback below is consistent.
  if (referenceMode === "add-instrumental") {
    isVocal = true;
  }

  // ── Cost + credit debit (atomic CAS) ────────────────────────────────
  const cost = creditsForTrack({ duration, isVocal });
  const debit = await prisma.$transaction(async (tx) => {
    const r = await tx.user.updateMany({
      where: { id: userId, credits: { gte: cost } },
      data: { credits: { decrement: cost } },
    });
    if (r.count === 1) {
      await tx.creditTransaction.create({
        data: { userId, delta: -cost, reason: "music_generate", note: `${duration}s · ${isVocal ? "vocal" : "instrumental"}` },
      });
    }
    return r;
  });
  if (debit.count !== 1) {
    return NextResponse.json(
      { error: "Insufficient credits", code: "NO_CREDITS", cost },
      { status: 402 }
    );
  }

  // ── Build callback URL ──────────────────────────────────────────────
  // We append our own webhook secret as a query param so music engine's
  // callback can be verified server-side (music engine doesn't sign payloads).
  const origin =
    process.env.NEXTAUTH_URL ||
    `https://${req.headers.get("host") || "seedance.visualseffect.com"}`;
  const callbackSecret = process.env.WEBHOOK_SECRET;
  if (!callbackSecret) {
    // Refund + fail closed if config is missing.
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { credits: { increment: cost } } }),
      prisma.creditTransaction.create({ data: { userId, delta: cost, reason: "refund_music_generate", note: "WEBHOOK_SECRET missing" } }),
    ]);
    console.error("[MUSIC_GENERATE] WEBHOOK_SECRET missing — refunded and aborted");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const callBackUrl = `${origin}/api/music/callback?secret=${encodeURIComponent(callbackSecret)}`;

  // ── Translate UI selections → music engine API params ───────────────────────
  // customStyle (Pro-mode Style field) wins over the genre preset
  // when present. Otherwise we fall back to the canonical mapping
  // (genre → comma-separated descriptors + mood + tempo qualifier).
  const style = customStyle || buildStyleString({ genre, mood, tempo, isVocal });
  // Title — short, human-friendly. Falls back to "<Genre> · <Mood>".
  const niceGenre = genre ? genre[0].toUpperCase() + genre.slice(1) : "Cinematic";
  const fallbackTitle = `${niceGenre}${mood ? " · " + mood : ""}`;
  const title = (promptRaw.slice(0, 60) || fallbackTitle).trim();

  // ── Fire music engine gen ───────────────────────────────────────────────────
  // Three flows, picked by referenceMode:
  //   • null              → plain text-to-music (the original flow)
  //   • "cover"           → reference song → new music in same raag,
  //                          AI generates new vocals + instruments
  //   • "add-instrumental"→ user's vocal recording → AI adds instruments
  //                          around the preserved vocals
  let taskId;
  try {
    let result;
    if (referenceMode === "cover") {
      // For cover: user can still pick instrumental vs vocal output,
      // pick lyrics, etc. The reference contributes the melody/raag
      // skeleton; everything else is generated from the user's
      // prompt + style + lyrics just like a normal generation.
      result = await generateCover({
        uploadUrl: referenceUrl,
        prompt: promptRaw || style,
        style,
        title,
        instrumental: !isVocal,
        lyrics: isVocal ? (lyricsRaw || undefined) : undefined,
        model,
        vocalGender,
        // audioWeight tuned to "lean into the reference" but leave
        // room for new style. Higher = more like the reference.
        audioWeight: 0.65,
        styleWeight: 0.65,
        callBackUrl,
        negativeTags: negativeTags || undefined,
      });
    } else if (referenceMode === "add-instrumental") {
      // For add-instrumental: the user's vocals ARE the lyrics +
      // melody. We just hand the engine an instrumentation
      // descriptor. `tags` combines the genre-derived style with any
      // free-text style override + the prompt (which the user
      // typically uses to describe desired instruments like
      // "violin, flute, traditional Indian classical").
      const tags = [style, promptRaw].filter(Boolean).join(", ").slice(0, 800);
      result = await addInstrumentalToVocal({
        uploadUrl: referenceUrl,
        title,
        tags,
        negativeTags: negativeTags || undefined,
        vocalGender,
        // audioWeight=1.0 = preserve original vocals as strongly as
        // the engine allows. The point of this flow is the user
        // KEEPS their voice.
        audioWeight: 1.0,
        model,
        callBackUrl,
      });
    } else {
      result = await generateMusic({
        prompt: promptRaw || style,
        style,
        title,
        instrumental: !isVocal,
        lyrics: isVocal ? (lyricsRaw || undefined) : undefined,
        model,
        vocalGender,
        callBackUrl,
        negativeTags: negativeTags || undefined,
      });
    }
    taskId = result.taskId;
    if (!taskId) throw new Error("Music service returned no task id");
  } catch (err) {
    // Refund + bail. Surface a friendly error to the client.
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { credits: { increment: cost } } }),
      prisma.creditTransaction.create({ data: { userId, delta: cost, reason: "refund_music_generate", note: (err?.message || "upstream_failed").slice(0, 500) } }),
    ]);
    console.error("[MUSIC_GENERATE] Upstream call failed:", err?.message);
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    return NextResponse.json(
      // Scrub vendor strings so the user never sees "music engine…" in an
      // error toast. White-label hygiene.
      { error: scrubVendor(err?.message) || "Music service unavailable", refunded: true },
      { status }
    );
  }

  // ── Persist the track row ───────────────────────────────────────────
  try {
    const track = await prisma.musicTrack.create({
      data: {
        userId,
        taskId,
        title,
        prompt: promptRaw || null,
        genre,
        mood,
        durationReq: duration,
        isVocal,
        lyrics: isVocal && referenceMode !== "add-instrumental" ? (lyricsRaw || null) : null,
        tempo,
        model,
        status: "processing",
        credits: cost,
      },
      select: { id: true, taskId: true, status: true, title: true, credits: true },
    });
    return NextResponse.json({ ok: true, track });
  } catch (err) {
    // Race: music engine fired but DB write failed. The callback will fail to
    // find the row → the user wasted credits. Refund here to be safe.
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { credits: { increment: cost } } }),
      prisma.creditTransaction.create({ data: { userId, delta: cost, reason: "refund_music_generate", note: "track_row_insert_failed" } }),
    ]);
    console.error("[MUSIC_GENERATE] DB write failed:", err?.message);
    return NextResponse.json({ error: "Server error", refunded: true }, { status: 500 });
  }
}
