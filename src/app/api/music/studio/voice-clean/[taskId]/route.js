// GET /api/music/studio/voice-clean/[taskId]?trackId=...
//
// Polls LALAL.AI for the status of a voice-clean task. Three
// outcomes:
//   • "progress" → returns { status, progress }
//   • "success"  → mirrors the cleaned voice URL from LALAL CDN
//                  to R2, persists on MusicTrack.voiceCleanUrl,
//                  returns the final URL.
//   • "error" / "cancelled" → flips status to "failed", refunds
//                  VOICE_CLEAN_COST.
//
// Same polling cadence as the stem-split check (6s, 50 retries).

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadAudioBuffer, isR2Configured } from "@/lib/storage";
import { checkTasks, isLalalConfigured, VOICE_CLEAN_COST } from "@/lib/lalal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }
  const userId = session.user.id;
  const { taskId } = await params;
  const trackId = new URL(req.url).searchParams.get("trackId") || "";
  if (!taskId || !trackId) {
    return NextResponse.json({ error: "Missing taskId/trackId" }, { status: 400 });
  }
  if (!isLalalConfigured()) {
    return NextResponse.json(
      { error: "Voice cleaning isn't configured yet.", code: "NO_LALAL_KEY" },
      { status: 503 }
    );
  }

  const track = await prisma.musicTrack.findFirst({
    where: { id: trackId, userId, deletedAt: null },
    select: {
      id: true,
      userId: true,
      voiceCleanTaskId: true,
      voiceCleanStatus: true,
      voiceCleanUrl: true,
    },
  });
  if (!track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }
  if (track.voiceCleanTaskId !== taskId) {
    return NextResponse.json({ error: "Task does not belong to this track" }, { status: 403 });
  }

  // Already done.
  if (track.voiceCleanStatus === "completed" && track.voiceCleanUrl) {
    return NextResponse.json({
      ok: true,
      voiceCleanStatus: "completed",
      voiceCleanUrl: track.voiceCleanUrl,
    });
  }

  // Hit LALAL.
  let checkRes;
  try {
    checkRes = await checkTasks([taskId]);
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Voice clean service unavailable" },
      { status: e.status || 502 }
    );
  }
  const taskResult = checkRes?.result?.[taskId];
  if (!taskResult) {
    return NextResponse.json(
      { error: "Task not found upstream — may have expired (24h)." },
      { status: 404 }
    );
  }

  // Still running.
  if (taskResult.status === "progress") {
    return NextResponse.json({
      ok: true,
      voiceCleanStatus: "processing",
      progress: taskResult.progress || 0,
    });
  }

  // Failed.
  if (taskResult.status === "error" || taskResult.status === "cancelled" || taskResult.status === "server_error") {
    const msg = typeof taskResult.error === "string"
      ? taskResult.error
      : taskResult.error?.detail || "Voice clean service failed";
    await prisma.musicTrack.updateMany({
      where: { id: track.id, voiceCleanStatus: "processing" },
      data: { voiceCleanStatus: "failed", voiceCleanError: msg },
    });
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { credits: { increment: VOICE_CLEAN_COST } } }),
      prisma.creditTransaction.create({ data: { userId, delta: VOICE_CLEAN_COST, reason: "refund_voice_clean", refType: "MusicTrack", refId: track.id, note: msg.slice(0, 500) } }),
    ]).catch(() => {});
    return NextResponse.json({
      ok: true,
      voiceCleanStatus: "failed",
      error: msg,
      refunded: true,
    });
  }

  // Success — find the cleaned voice in the tracks array and mirror to R2.
  if (taskResult.status === "success") {
    const tracks = taskResult.result?.tracks || [];
    // LALAL's voice_clean returns: {type:"stem", label:"voice"} +
    // {type:"back", label:"no_voice"}. We want the "voice" stem.
    const voiceTrack = tracks.find((t) => t?.type === "stem" && (t?.label === "voice" || t?.label?.startsWith("voice")));
    const cleanedUrl = voiceTrack?.url;
    if (!cleanedUrl) {
      await prisma.musicTrack.updateMany({
        where: { id: track.id, voiceCleanStatus: "processing" },
        data: { voiceCleanStatus: "failed", voiceCleanError: "Upstream returned no voice track" },
      });
      await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { credits: { increment: VOICE_CLEAN_COST } } }),
        prisma.creditTransaction.create({ data: { userId, delta: VOICE_CLEAN_COST, reason: "refund_voice_clean", refType: "MusicTrack", refId: track.id, note: "no_voice_track" } }),
      ]).catch(() => {});
      return NextResponse.json({
        ok: true,
        voiceCleanStatus: "failed",
        error: "Voice clean returned no voice track",
        refunded: true,
      });
    }
    // Mirror to R2 (LALAL URLs expire in 24h).
    let finalUrl = cleanedUrl;
    if (isR2Configured()) {
      try {
        const resp = await fetch(cleanedUrl, { signal: AbortSignal.timeout(60_000) });
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer());
          const key = `voice-clean/${track.id}/voice.mp3`;
          finalUrl = await uploadAudioBuffer(buf, key, "audio/mpeg");
        }
      } catch (e) {
        console.warn("[VOICE_CLEAN_CHECK] R2 mirror failed:", e?.message);
      }
    }
    await prisma.musicTrack.updateMany({
      where: { id: track.id, voiceCleanStatus: "processing" },
      data: {
        voiceCleanStatus: "completed",
        voiceCleanUrl: finalUrl,
        voiceCleanError: null,
      },
    });
    return NextResponse.json({
      ok: true,
      voiceCleanStatus: "completed",
      voiceCleanUrl: finalUrl,
    });
  }

  return NextResponse.json({
    ok: true,
    voiceCleanStatus: "processing",
    progress: 0,
  });
}
