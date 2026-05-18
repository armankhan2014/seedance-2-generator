// POST /api/music/studio/vocals-split/start   { trackId }
//
// Kicks off a LALAL lead-vs-backing vocals split. Distinct from
// the multistem split + voice clean in what it returns:
//   • lead         — isolated lead vocal
//   • backing      — isolated backing vocals (optional, may be empty
//                    if the engine couldn't find any harmonies)
//   • no_vocals    — instrumental (no lead, no backing)
//   • mix_no_lead  — instrumental + backing (everything except lead)
//
// Same upload → start → poll flow as the other LALAL features.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  uploadAudio,
  startVocalsSplit,
  isLalalConfigured,
  VOCALS_SPLIT_COST,
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
        error: "Vocals split isn't configured yet — admin: set LALAL_API_KEY.",
        code: "NO_LALAL_KEY",
      },
      { status: 503 }
    );
  }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const trackId = typeof body?.trackId === "string" ? body.trackId : "";
  if (!trackId) return NextResponse.json({ error: "Missing trackId" }, { status: 400 });

  const track = await prisma.musicTrack.findFirst({
    where: { id: trackId, userId, deletedAt: null },
    select: {
      id: true,
      title: true,
      r2Url: true,
      audioUrl: true,
      streamUrl: true,
      status: true,
      vocalsSplitStatus: true,
      vocalsSplit: true,
      vocalsSplitTaskId: true,
    },
  });
  if (!track) return NextResponse.json({ error: "Track not found" }, { status: 404 });
  if (track.status !== "completed") {
    return NextResponse.json({ error: "Wait for the track to finish before splitting vocals." }, { status: 400 });
  }
  if (track.vocalsSplitStatus === "completed" && track.vocalsSplit) {
    return NextResponse.json({
      ok: true,
      alreadyDone: true,
      vocalsSplitStatus: "completed",
      vocalsSplit: track.vocalsSplit,
    });
  }
  if (track.vocalsSplitStatus === "processing" && track.vocalsSplitTaskId) {
    return NextResponse.json({
      ok: true,
      alreadyDone: false,
      vocalsSplitStatus: "processing",
      taskId: track.vocalsSplitTaskId,
    });
  }
  const sourceUrl = track.r2Url || track.audioUrl || track.streamUrl;
  if (!sourceUrl) {
    return NextResponse.json({ error: "This track has no playable audio yet." }, { status: 400 });
  }

  // Debit
  const debit = await prisma.user.updateMany({
    where: { id: userId, credits: { gte: VOCALS_SPLIT_COST } },
    data: { credits: { decrement: VOCALS_SPLIT_COST } },
  });
  if (debit.count !== 1) {
    return NextResponse.json(
      { error: "Insufficient credits", code: "NO_CREDITS", cost: VOCALS_SPLIT_COST },
      { status: 402 }
    );
  }
  async function refund(reason) {
    await prisma.user
      .update({ where: { id: userId }, data: { credits: { increment: VOCALS_SPLIT_COST } } })
      .catch((e) => console.error("[VOCALS_SPLIT] refund failed:", e?.message));
    console.warn(`[VOCALS_SPLIT] refund — ${reason}`);
  }

  let audioBuf;
  try {
    const resp = await fetch(sourceUrl, { signal: AbortSignal.timeout(60_000) });
    if (!resp.ok) throw new Error(`Source fetch ${resp.status}`);
    audioBuf = Buffer.from(await resp.arrayBuffer());
  } catch (e) {
    await refund("source fetch failed");
    return NextResponse.json({ error: "Couldn't fetch track audio.", refunded: true }, { status: 502 });
  }

  let upload;
  try {
    const filename = `${(track.title || "track").replace(/[^\w.\-]/g, "_")}.mp3`;
    upload = await uploadAudio(audioBuf, filename);
  } catch (e) {
    await refund("LALAL upload failed");
    return NextResponse.json(
      { error: e?.message || "Vocals split service unavailable", refunded: true },
      { status: e.status || 502 }
    );
  }

  let task;
  try {
    task = await startVocalsSplit({ sourceId: upload.id });
  } catch (e) {
    await refund("LALAL vocals-split start failed");
    return NextResponse.json(
      { error: e?.message || "Vocals split couldn't start", refunded: true },
      { status: e.status || 502 }
    );
  }

  try {
    await prisma.musicTrack.update({
      where: { id: track.id },
      data: {
        vocalsSplitTaskId: task.task_id,
        vocalsSplitStatus: "processing",
        vocalsSplitError: null,
        vocalsSplit: { _sourceId: upload.id, _startedAt: Date.now() },
      },
    });
  } catch (e) {
    await refund("DB write failed");
    return NextResponse.json({ error: "Server error", refunded: true }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    vocalsSplitStatus: "processing",
    taskId: task.task_id,
    cost: VOCALS_SPLIT_COST,
  });
}
