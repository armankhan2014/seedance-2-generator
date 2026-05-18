// GET /api/music/studio/vocals-split/[taskId]?trackId=...
//
// Polls LALAL for a lead-vs-backing vocals split. On success,
// mirrors all available stems to R2 + persists the URL map:
//   { lead, backing, no_vocals, mix_no_lead }
// backing is optional — LALAL omits it when the engine can't find
// any harmonies in the source. lead is always present.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadAudioBuffer, isR2Configured } from "@/lib/storage";
import { checkTasks, isLalalConfigured, VOCALS_SPLIT_COST } from "@/lib/lalal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Label map: LALAL track label → our DB key. Some incoming labels
// (vocals@0, vocals@1) are translated to friendlier names (lead,
// backing) so the JSON payload stays clean.
const LABEL_MAP = {
  "vocals@0": "lead",
  "vocals@1": "backing",
  "no_vocals": "no_vocals",
  "mix_no_lead": "mix_no_lead",
};

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
      { error: "Vocals split isn't configured yet.", code: "NO_LALAL_KEY" },
      { status: 503 }
    );
  }

  const track = await prisma.musicTrack.findFirst({
    where: { id: trackId, userId, deletedAt: null },
    select: {
      id: true,
      userId: true,
      vocalsSplitTaskId: true,
      vocalsSplitStatus: true,
      vocalsSplit: true,
    },
  });
  if (!track) return NextResponse.json({ error: "Track not found" }, { status: 404 });
  if (track.vocalsSplitTaskId !== taskId) {
    return NextResponse.json({ error: "Task does not belong to this track" }, { status: 403 });
  }

  // Short-circuit if already complete (and no leftover _sourceId
  // sentinel from the in-flight state).
  if (track.vocalsSplitStatus === "completed" && track.vocalsSplit && !track.vocalsSplit._sourceId) {
    return NextResponse.json({
      ok: true,
      vocalsSplitStatus: "completed",
      vocalsSplit: track.vocalsSplit,
    });
  }

  let checkRes;
  try {
    checkRes = await checkTasks([taskId]);
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Vocals split service unavailable" },
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

  if (taskResult.status === "progress") {
    return NextResponse.json({
      ok: true,
      vocalsSplitStatus: "processing",
      progress: taskResult.progress || 0,
    });
  }

  if (taskResult.status === "error" || taskResult.status === "cancelled" || taskResult.status === "server_error") {
    const msg = typeof taskResult.error === "string"
      ? taskResult.error
      : taskResult.error?.detail || "Vocals split failed";
    await prisma.musicTrack.updateMany({
      where: { id: track.id, vocalsSplitStatus: "processing" },
      data: { vocalsSplitStatus: "failed", vocalsSplitError: msg },
    });
    await prisma.user
      .update({ where: { id: userId }, data: { credits: { increment: VOCALS_SPLIT_COST } } })
      .catch(() => {});
    return NextResponse.json({
      ok: true,
      vocalsSplitStatus: "failed",
      error: msg,
      refunded: true,
    });
  }

  if (taskResult.status === "success") {
    const tracks = taskResult.result?.tracks || [];
    // Build {ourLabel: upstreamUrl} map.
    const rawUrls = {};
    for (const t of tracks) {
      const ourLabel = LABEL_MAP[t?.label];
      if (ourLabel && t?.url) {
        rawUrls[ourLabel] = t.url;
      }
    }
    if (!rawUrls.lead) {
      // No lead means upstream returned nothing usable.
      await prisma.musicTrack.updateMany({
        where: { id: track.id, vocalsSplitStatus: "processing" },
        data: { vocalsSplitStatus: "failed", vocalsSplitError: "Upstream returned no lead vocal" },
      });
      await prisma.user
        .update({ where: { id: userId }, data: { credits: { increment: VOCALS_SPLIT_COST } } })
        .catch(() => {});
      return NextResponse.json({
        ok: true,
        vocalsSplitStatus: "failed",
        error: "Vocals split returned no lead vocal",
        refunded: true,
      });
    }
    // Mirror each track to R2 in parallel.
    const r2Ready = isR2Configured();
    const finalMap = {};
    const entries = Object.entries(rawUrls);
    const settled = await Promise.allSettled(
      entries.map(async ([label, url]) => {
        if (!r2Ready) return [label, url];
        try {
          const resp = await fetch(url, { signal: AbortSignal.timeout(60_000) });
          if (!resp.ok) throw new Error(`Mirror fetch ${resp.status}`);
          const buf = Buffer.from(await resp.arrayBuffer());
          const key = `vocals-split/${track.id}/${label}.mp3`;
          const r2Url = await uploadAudioBuffer(buf, key, "audio/mpeg");
          return [label, r2Url];
        } catch (e) {
          console.warn(`[VOCALS_SPLIT] mirror failed for ${label}:`, e?.message);
          return [label, url];
        }
      })
    );
    for (const r of settled) {
      if (r.status === "fulfilled") {
        const [label, url] = r.value;
        finalMap[label] = url;
      }
    }
    await prisma.musicTrack.updateMany({
      where: { id: track.id, vocalsSplitStatus: "processing" },
      data: {
        vocalsSplitStatus: "completed",
        vocalsSplit: finalMap,
        vocalsSplitError: null,
      },
    });
    return NextResponse.json({
      ok: true,
      vocalsSplitStatus: "completed",
      vocalsSplit: finalMap,
    });
  }

  return NextResponse.json({
    ok: true,
    vocalsSplitStatus: "processing",
    progress: 0,
  });
}
