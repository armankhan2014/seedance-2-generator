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
import { generateMusic, buildStyleString, creditsForTrack, scrubVendor } from "@/lib/suno";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALLOWED_DURATIONS = new Set([30, 60, 120, 180]);
const ALLOWED_MODELS = new Set(["V4", "V4_5", "V4_5PLUS", "V4_5ALL", "V5", "V5_5"]);
const MAX_PROMPT = 5000;
const MAX_LYRICS = 5000;

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
  const isVocal = !!body.isVocal;
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

  // ── Cost + credit debit (atomic CAS) ────────────────────────────────
  const cost = creditsForTrack({ duration, isVocal });
  const debit = await prisma.user.updateMany({
    where: { id: userId, credits: { gte: cost } },
    data: { credits: { decrement: cost } },
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
    await prisma.user.update({ where: { id: userId }, data: { credits: { increment: cost } } });
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
  let taskId;
  try {
    const result = await generateMusic({
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
    taskId = result.taskId;
    if (!taskId) throw new Error("Music service returned no task id");
  } catch (err) {
    // Refund + bail. Surface a friendly error to the client.
    await prisma.user.update({ where: { id: userId }, data: { credits: { increment: cost } } });
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
        lyrics: isVocal ? (lyricsRaw || null) : null,
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
    await prisma.user.update({ where: { id: userId }, data: { credits: { increment: cost } } });
    console.error("[MUSIC_GENERATE] DB write failed:", err?.message);
    return NextResponse.json({ error: "Server error", refunded: true }, { status: 500 });
  }
}
