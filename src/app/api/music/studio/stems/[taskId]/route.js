// GET /api/music/studio/stems/[taskId]?trackId=...
//
// Polls LALAL.AI for the status of a Studio stem-split task. Three
// possible flows:
//
//   • "progress" → returns { status, progress } so the client can
//                  update its progress UI.
//   • "success"  → mirrors each stem URL from LALAL CDN to R2
//                  (LALAL URLs expire 24h), persists the resulting
//                  R2 URLs on MusicTrack.studioStems, refunds nothing
//                  (paid + delivered), returns the final stem map.
//   • "error" / "cancelled" → flips studioStemStatus to "failed" and
//                  refunds STUDIO_STEM_COST credits.
//
// Designed for the client to call every ~5-8 seconds. LALAL rate
// limits /check/ at 30/min — well above our cadence.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadAudioBuffer, isR2Configured } from "@/lib/storage";
import {
  checkTasks,
  deleteSource,
  isLalalConfigured,
  STUDIO_STEM_COST,
} from "@/lib/lalal";

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
  if (!taskId) {
    return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
  }
  if (!trackId) {
    return NextResponse.json({ error: "Missing trackId" }, { status: 400 });
  }
  if (!isLalalConfigured()) {
    return NextResponse.json(
      { error: "Studio stems aren't configured yet.", code: "NO_LALAL_KEY" },
      { status: 503 }
    );
  }

  // Lookup the track — auth + verify the taskId belongs to this row.
  const track = await prisma.musicTrack.findFirst({
    where: { id: trackId, userId, deletedAt: null },
    select: {
      id: true,
      userId: true,
      studioStemTaskId: true,
      studioStemStatus: true,
      studioStems: true,
    },
  });
  if (!track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }
  if (track.studioStemTaskId !== taskId) {
    return NextResponse.json({ error: "Task does not belong to this track" }, { status: 403 });
  }

  // Short-circuit if we've already persisted the completed state.
  if (track.studioStemStatus === "completed" && track.studioStems && !track.studioStems._sourceId) {
    return NextResponse.json({
      ok: true,
      studioStemStatus: "completed",
      studioStems: track.studioStems,
    });
  }

  // Hit LALAL /check/.
  let checkRes;
  try {
    checkRes = await checkTasks([taskId]);
  } catch (e) {
    console.error("[STUDIO_STEMS_CHECK] LALAL check failed:", e?.message);
    return NextResponse.json(
      { error: e?.message || "Stem service unavailable" },
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

  // ── Still running ────────────────────────────────────────────
  if (taskResult.status === "progress") {
    return NextResponse.json({
      ok: true,
      studioStemStatus: "processing",
      progress: taskResult.progress || 0,
    });
  }

  // ── Failed ────────────────────────────────────────────────────
  if (taskResult.status === "error" || taskResult.status === "cancelled" || taskResult.status === "server_error") {
    const msg = typeof taskResult.error === "string"
      ? taskResult.error
      : taskResult.error?.detail || "Stem service failed";
    await prisma.musicTrack.updateMany({
      where: { id: track.id, studioStemStatus: "processing" },
      data: { studioStemStatus: "failed", studioStemError: msg },
    });
    // Refund.
    await prisma.user
      .update({ where: { id: userId }, data: { credits: { increment: STUDIO_STEM_COST } } })
      .catch(() => {});
    return NextResponse.json({
      ok: true,
      studioStemStatus: "failed",
      error: msg,
      refunded: true,
    });
  }

  // ── Success — mirror stems to R2 ─────────────────────────────
  if (taskResult.status === "success") {
    const tracks = taskResult.result?.tracks || [];
    // Build label → URL map from the upstream tracks array. We keep
    // only "stem" type entries (the "back" entries are the
    // everything-but-this-stem residuals; useful only for QA, skip
    // for v0).
    const lalalUrls = {};
    for (const t of tracks) {
      if (t?.type === "stem" && t?.label && t?.url) {
        lalalUrls[t.label] = t.url;
      }
    }
    if (Object.keys(lalalUrls).length === 0) {
      // Treat as failure.
      await prisma.musicTrack.updateMany({
        where: { id: track.id, studioStemStatus: "processing" },
        data: { studioStemStatus: "failed", studioStemError: "Upstream returned no stems" },
      });
      await prisma.user
        .update({ where: { id: userId }, data: { credits: { increment: STUDIO_STEM_COST } } })
        .catch(() => {});
      return NextResponse.json({
        ok: true,
        studioStemStatus: "failed",
        error: "Stem service returned no stems",
        refunded: true,
      });
    }

    // Parallel-mirror each stem to R2 (LALAL URLs expire in ~24h;
    // R2 lives forever). On any single-stem mirror failure, fall
    // back to the upstream URL so the UI still works for the next
    // 24h — the user can re-split if they need durability.
    const r2Ready = isR2Configured();
    const studioStems = {};
    const entries = Object.entries(lalalUrls);
    const settled = await Promise.allSettled(
      entries.map(async ([label, url]) => {
        if (!r2Ready) return [label, url];
        try {
          const resp = await fetch(url, { signal: AbortSignal.timeout(60_000) });
          if (!resp.ok) throw new Error(`Mirror fetch ${resp.status}`);
          const buf = Buffer.from(await resp.arrayBuffer());
          const key = `studio-stems/${track.id}/${label}.mp3`;
          const r2Url = await uploadAudioBuffer(buf, key, "audio/mpeg");
          return [label, r2Url];
        } catch (e) {
          console.warn(`[STUDIO_STEMS_CHECK] R2 mirror failed for ${label}:`, e?.message);
          return [label, url];
        }
      })
    );
    for (const r of settled) {
      if (r.status === "fulfilled") {
        const [label, finalUrl] = r.value;
        studioStems[label] = finalUrl;
      }
    }

    // Compare-and-swap update so duplicate /check fires don't
    // double-write or double-process. Only the first call wins.
    await prisma.musicTrack.updateMany({
      where: { id: track.id, studioStemStatus: "processing" },
      data: {
        studioStemStatus: "completed",
        studioStems,
        studioStemError: null,
      },
    });

    // Best-effort: clean up the LALAL source so it doesn't sit in
    // their storage for 24h. Don't block the response on this.
    const sourceId = track.studioStems?._sourceId;
    if (sourceId) {
      deleteSource(sourceId).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      studioStemStatus: "completed",
      studioStems,
    });
  }

  // Unknown status — log and keep client polling.
  console.warn("[STUDIO_STEMS_CHECK] Unknown status:", taskResult.status);
  return NextResponse.json({
    ok: true,
    studioStemStatus: "processing",
    progress: 0,
  });
}
