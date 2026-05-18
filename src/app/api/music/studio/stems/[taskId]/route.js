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
//                  refunds the mode-aware cost (6stem = 30, 9stem = 50).
//
// Pro 9-stem mode: the row stores 4 task IDs in studioStemTaskIds
// (1 multistem + 3 stem_separator). We poll them all in ONE /check/
// batch and only flip to "completed" when every task has finished.
// Failure of any single task fails the whole job + refunds the full
// Pro cost — the user paid for the bundle.
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
  STUDIO_PRO_STEM_COST,
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
      studioStemTaskIds: true,
      studioStemMode: true,
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

  // Determine which task IDs to poll. New rows have studioStemTaskIds
  // (an array); older rows from before R6 only have the single
  // studioStemTaskId — fall back to that so legacy splits keep working.
  const taskIds = Array.isArray(track.studioStemTaskIds) && track.studioStemTaskIds.length > 0
    ? track.studioStemTaskIds
    : [track.studioStemTaskId];
  const mode = track.studioStemMode === "9stem" ? "9stem" : "6stem";
  const refundAmount = mode === "9stem" ? STUDIO_PRO_STEM_COST : STUDIO_STEM_COST;

  // Hit LALAL /check/ for all task IDs in one shot.
  let checkRes;
  try {
    checkRes = await checkTasks(taskIds);
  } catch (e) {
    console.error("[STUDIO_STEMS_CHECK] LALAL check failed:", e?.message);
    return NextResponse.json(
      { error: e?.message || "Stem service unavailable" },
      { status: e.status || 502 }
    );
  }
  const results = taskIds.map((id) => ({ id, r: checkRes?.result?.[id] }));
  // Treat a missing task as a service-side expiry — same failure
  // semantics as upstream "error".
  const missing = results.filter((x) => !x.r);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Task not found upstream — may have expired (24h)." },
      { status: 404 }
    );
  }

  // ── Failed (any single task failure fails the whole bundle) ──
  const failed = results.find(
    (x) => x.r.status === "error" || x.r.status === "cancelled" || x.r.status === "server_error"
  );
  if (failed) {
    const msg = typeof failed.r.error === "string"
      ? failed.r.error
      : failed.r.error?.detail || "Stem service failed";
    await prisma.musicTrack.updateMany({
      where: { id: track.id, studioStemStatus: "processing" },
      data: { studioStemStatus: "failed", studioStemError: msg },
    });
    await prisma.user
      .update({ where: { id: userId }, data: { credits: { increment: refundAmount } } })
      .catch(() => {});
    return NextResponse.json({
      ok: true,
      studioStemStatus: "failed",
      error: msg,
      refunded: true,
    });
  }

  // ── Still running (any task not yet successful) ──────────────
  const stillProgressing = results.filter((x) => x.r.status !== "success");
  if (stillProgressing.length > 0) {
    // Average upstream progress across all tasks for a smoother UI.
    const sum = results.reduce((acc, x) => {
      if (x.r.status === "success") return acc + 100;
      return acc + (x.r.progress || 0);
    }, 0);
    const avg = Math.round(sum / results.length);
    return NextResponse.json({
      ok: true,
      studioStemStatus: "processing",
      progress: avg,
    });
  }

  // ── All tasks succeeded — merge + mirror stems to R2 ─────────
  {
    // Build label → URL map by walking every task's tracks array.
    // For multistem this gives 6 stems; each stem_separator task
    // contributes 1 more. "back" entries (residuals) are skipped.
    const lalalUrls = {};
    for (const { r } of results) {
      const tracks = r.result?.tracks || [];
      for (const t of tracks) {
        if (t?.type === "stem" && t?.label && t?.url) {
          lalalUrls[t.label] = t.url;
        }
      }
    }
    if (Object.keys(lalalUrls).length === 0) {
      // Treat as failure.
      await prisma.musicTrack.updateMany({
        where: { id: track.id, studioStemStatus: "processing" },
        data: { studioStemStatus: "failed", studioStemError: "Upstream returned no stems" },
      });
      await prisma.user
        .update({ where: { id: userId }, data: { credits: { increment: refundAmount } } })
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
}
