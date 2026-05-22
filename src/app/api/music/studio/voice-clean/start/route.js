// POST /api/music/studio/voice-clean/start   { trackId, noiseLevel? }
//
// Kicks off a LALAL.AI voice-clean job — strips background noise
// (wind / hum / traffic / crowd) from a vocal recording. Distinct
// from the multistem split:
//   • Cheaper (6 credits vs 20)
//   • One result, not 4 — a single cleaned-voice mp3
//   • Use case: filmmaker uploads a noisy phone recording, gets
//     back a clean vocal ready for the timeline.
//
// Same upload → start → check flow as multistem. Same refund-on-
// failure pattern.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  uploadAudio,
  startVoiceClean,
  isLalalConfigured,
  VOICE_CLEAN_COST,
} from "@/lib/lalal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }
  const userId = session.user.id;

  if (!isLalalConfigured()) {
    return NextResponse.json(
      {
        error: "Voice cleaning isn't configured yet — admin: set LALAL_API_KEY in Vercel env.",
        code: "NO_LALAL_KEY",
      },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const trackId = typeof body?.trackId === "string" ? body.trackId : "";
  // Clamp noise level to LALAL's 0|1|2 range. Default 1 (medium)
  // which works for most phone / outdoor recordings.
  const rawLevel = Number.isFinite(body?.noiseLevel) ? Number(body.noiseLevel) : 1;
  const noiseLevel = Math.max(0, Math.min(2, Math.round(rawLevel)));
  if (!trackId) {
    return NextResponse.json({ error: "Missing trackId" }, { status: 400 });
  }

  const track = await prisma.musicTrack.findFirst({
    where: { id: trackId, userId, deletedAt: null },
    select: {
      id: true,
      title: true,
      r2Url: true,
      audioUrl: true,
      streamUrl: true,
      status: true,
      voiceCleanStatus: true,
      voiceCleanUrl: true,
      voiceCleanTaskId: true,
    },
  });
  if (!track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }
  if (track.status !== "completed") {
    return NextResponse.json(
      { error: "Wait for the track to finish before cleaning its voice." },
      { status: 400 }
    );
  }
  // Idempotent — already done.
  if (track.voiceCleanStatus === "completed" && track.voiceCleanUrl) {
    return NextResponse.json({
      ok: true,
      alreadyDone: true,
      voiceCleanStatus: "completed",
      voiceCleanUrl: track.voiceCleanUrl,
    });
  }
  if (track.voiceCleanStatus === "processing" && track.voiceCleanTaskId) {
    return NextResponse.json({
      ok: true,
      alreadyDone: false,
      voiceCleanStatus: "processing",
      taskId: track.voiceCleanTaskId,
    });
  }
  const sourceUrl = track.r2Url || track.audioUrl || track.streamUrl;
  if (!sourceUrl) {
    return NextResponse.json(
      { error: "This track has no playable audio yet." },
      { status: 400 }
    );
  }

  // Debit
  const debit = await prisma.$transaction(async (tx) => {
    const r = await tx.user.updateMany({
      where: { id: userId, credits: { gte: VOICE_CLEAN_COST } },
      data: { credits: { decrement: VOICE_CLEAN_COST } },
    });
    if (r.count === 1) {
      await tx.creditTransaction.create({
        data: { userId, delta: -VOICE_CLEAN_COST, reason: "voice_clean", refType: "MusicTrack", refId: trackId },
      });
    }
    return r;
  });
  if (debit.count !== 1) {
    return NextResponse.json(
      { error: "Insufficient credits", code: "NO_CREDITS", cost: VOICE_CLEAN_COST },
      { status: 402 }
    );
  }
  async function refund(reason) {
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { credits: { increment: VOICE_CLEAN_COST } } }),
      prisma.creditTransaction.create({ data: { userId, delta: VOICE_CLEAN_COST, reason: "refund_voice_clean", refType: "MusicTrack", refId: trackId, note: reason.slice(0, 500) } }),
    ]).catch((e) => console.error("[VOICE_CLEAN] refund failed:", e?.message));
    console.warn(`[VOICE_CLEAN] refund — ${reason}`);
  }

  // Fetch + upload to LALAL.
  let audioBuf;
  try {
    const resp = await fetch(sourceUrl, { signal: AbortSignal.timeout(60_000) });
    if (!resp.ok) throw new Error(`Source fetch ${resp.status}`);
    audioBuf = Buffer.from(await resp.arrayBuffer());
  } catch (e) {
    await refund("source fetch failed");
    return NextResponse.json(
      { error: "Couldn't fetch track audio. Try again.", refunded: true },
      { status: 502 }
    );
  }

  let upload;
  try {
    const filename = `${(track.title || "track").replace(/[^\w.\-]/g, "_")}.mp3`;
    upload = await uploadAudio(audioBuf, filename);
  } catch (e) {
    await refund("LALAL upload failed");
    return NextResponse.json(
      { error: e?.message || "Voice clean service unavailable", refunded: true },
      { status: e.status || 502 }
    );
  }

  let task;
  try {
    task = await startVoiceClean({ sourceId: upload.id, noiseLevel });
  } catch (e) {
    await refund("LALAL voice-clean-start failed");
    return NextResponse.json(
      { error: e?.message || "Voice clean service couldn't start", refunded: true },
      { status: e.status || 502 }
    );
  }

  try {
    await prisma.musicTrack.update({
      where: { id: track.id },
      data: {
        voiceCleanTaskId: task.task_id,
        voiceCleanStatus: "processing",
        voiceCleanError: null,
        voiceCleanUrl: null,
      },
    });
  } catch (e) {
    await refund("DB write failed");
    return NextResponse.json(
      { error: "Server error", refunded: true },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    voiceCleanStatus: "processing",
    taskId: task.task_id,
    cost: VOICE_CLEAN_COST,
  });
}
