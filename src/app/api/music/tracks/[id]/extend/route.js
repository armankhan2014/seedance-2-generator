// POST /api/music/tracks/[id]/extend
//
// Kicks off an extension of the caller's existing music track. The
// engine takes the original audio and continues it in the same style
// for another ~30-90s (controlled by the model — V5 typically adds
// up to a minute per call; chain multiple to go longer).
//
// Architectural decision: the extended track lands as a SEPARATE
// MusicTrack row, not as an in-place update. Why:
//   1. Suno's callback writes the FULL audio (original + new content)
//      to a new audioUrl. Overwriting the original would destroy
//      the audio file on R2 the user might still want.
//   2. Users get a side-by-side comparison in their library — the
//      original 60s track + the extended 2 min one.
//   3. We can keep extending: each generation becomes a fresh row,
//      no schema for chains needed (title "(extended)" suffix is
//      enough for UX).
//
// Cost: 8 credits flat (EXTEND_COST, see suno.js). Same
// debit-before-call + refund-on-any-failure pattern as
// /api/music/generate.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extendTrack, EXTEND_COST, scrubVendor } from "@/lib/suno";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  // ── Fetch + authorize source track ────────────────────────────────
  const source = await prisma.musicTrack.findFirst({
    where: { id, userId, deletedAt: null },
    select: {
      id: true,
      title: true,
      r2Url: true,
      audioUrl: true,
      streamUrl: true,
      genre: true,
      mood: true,
      isVocal: true,
      model: true,
      tempo: true,
      lyrics: true,
      prompt: true,
      durationReq: true,
      actualDuration: true,
      status: true,
    },
  });
  if (!source) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }
  if (source.status !== "completed") {
    return NextResponse.json(
      { error: "Wait for the track to finish rendering before extending it." },
      { status: 400 }
    );
  }
  // Pick the most durable URL — prefer R2 (15-year lifetime) over
  // Suno's audioUrl (15-day) over the stream URL (30-day). If none
  // exist, the track row is in a weird half-state.
  const uploadUrl = source.r2Url || source.audioUrl || source.streamUrl;
  if (!uploadUrl) {
    return NextResponse.json(
      { error: "This track has no playable audio yet — wait for it to finish." },
      { status: 400 }
    );
  }

  // ── Debit credits atomically ──────────────────────────────────────
  const debit = await prisma.user.updateMany({
    where: { id: userId, credits: { gte: EXTEND_COST } },
    data: { credits: { decrement: EXTEND_COST } },
  });
  if (debit.count !== 1) {
    return NextResponse.json(
      { error: "Insufficient credits", code: "NO_CREDITS", cost: EXTEND_COST },
      { status: 402 }
    );
  }

  // ── Build callback URL ────────────────────────────────────────────
  // Reuses the existing /api/music/callback — the upstream payload
  // shape is identical to a regular generation (callbackType, task_id,
  // data[].audio_url, etc.), so we don't need a separate handler.
  const origin =
    process.env.NEXTAUTH_URL ||
    `https://${req.headers.get("host") || "seedance.visualseffect.com"}`;
  const callbackSecret = process.env.WEBHOOK_SECRET;
  if (!callbackSecret) {
    await prisma.user.update({
      where: { id: userId },
      data: { credits: { increment: EXTEND_COST } },
    });
    console.error("[EXTEND] WEBHOOK_SECRET missing — refunded + aborted");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const callBackUrl = `${origin}/api/music/callback?secret=${encodeURIComponent(callbackSecret)}`;

  // ── Fire upstream call ────────────────────────────────────────────
  let taskId;
  try {
    const result = await extendTrack({
      uploadUrl,
      model: source.model || "V5",
      callBackUrl,
      // Default-mode (defaultParamFlag=false in the wrapper) inherits
      // the original audio's style automatically. We do NOT pass
      // explicit style/prompt because the engine sniffs them off the
      // upload — keeps the extension faithful to the original feel.
    });
    taskId = result.taskId;
    if (!taskId) throw new Error("Music service returned no task id");
  } catch (err) {
    await prisma.user.update({
      where: { id: userId },
      data: { credits: { increment: EXTEND_COST } },
    });
    console.error("[EXTEND] Upstream failed:", err?.message);
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    return NextResponse.json(
      { error: scrubVendor(err?.message) || "Music service unavailable", refunded: true },
      { status }
    );
  }

  // ── Persist a NEW track row ───────────────────────────────────────
  // Carry forward enough metadata that the new row reads cleanly in
  // the library (same genre/mood pill, recognisable title). We tag
  // the title with "(extended)" so it's visually distinct from the
  // original. durationReq is doubled-ish since the output will be
  // longer than the input — we don't know exactly, but this seeds the
  // credit display + sort order reasonably.
  const extendedTitle = source.title?.endsWith("(extended)")
    ? source.title
    : `${source.title || "Track"} (extended)`;
  const newDurationReq = Math.min(
    180,
    (source.actualDuration || source.durationReq || 60) + 60
  );
  try {
    const track = await prisma.musicTrack.create({
      data: {
        userId,
        taskId,
        title: extendedTitle,
        prompt: source.prompt,
        genre: source.genre,
        mood: source.mood,
        durationReq: newDurationReq,
        isVocal: source.isVocal,
        lyrics: source.lyrics,
        tempo: source.tempo,
        model: source.model || "V5",
        status: "processing",
        credits: EXTEND_COST,
      },
      select: { id: true, taskId: true, status: true, title: true, credits: true },
    });
    return NextResponse.json({ ok: true, track });
  } catch (err) {
    await prisma.user.update({
      where: { id: userId },
      data: { credits: { increment: EXTEND_COST } },
    });
    console.error("[EXTEND] DB write failed:", err?.message);
    return NextResponse.json({ error: "Server error", refunded: true }, { status: 500 });
  }
}
