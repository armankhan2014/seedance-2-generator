// POST /api/music/studio/stems/start    { trackId, stems? }
//
// Kicks off a LALAL.AI multistem split for a track in the caller's
// library. Async — actual stem URLs land in the row when the
// /check endpoint sees the LALAL task complete.
//
// Flow:
//   1. Auth + ownership check on the track.
//   2. Validate LALAL_API_KEY is configured (gracefully fail if not).
//   3. Atomically debit STUDIO_STEM_COST credits.
//   4. Fetch the track's audio from R2 (the proxy isn't needed
//      server-side — we can hit r2Url directly).
//   5. Upload the audio binary to LALAL → get source_id.
//   6. Start multistem split (default: vocals/drum/bass/piano).
//   7. Persist source_id + task_id + status="processing".
//   8. Return task_id so the client can poll /check.
//
// Refunds the user's credits on any failure between debit and a
// successful task start.
//
// Idempotency: if the track already has a successful Studio split
// AND the same stem set was used, return existing URLs without
// burning credits.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  uploadAudio,
  startMultistemSplit,
  startStemSeparator,
  isLalalConfigured,
  STUDIO_STEM_COST,
  STUDIO_PRO_STEM_COST,
  STUDIO_DEFAULT_STEMS,
  STUDIO_PRO_EXTRA_STEMS,
} from "@/lib/lalal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_STEMS = new Set([
  "vocals",
  "drum",
  "bass",
  "piano",
  "electric_guitar",
  "acoustic_guitar",
]);

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }
  const userId = session.user.id;

  if (!isLalalConfigured()) {
    return NextResponse.json(
      {
        error:
          "Studio stems aren't configured yet — admin: set LALAL_API_KEY in Vercel env.",
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
  // Caller can override the stem list; default to the 6-stem
  // sensible-for-most-songs set. Clamp to LALAL's allowed values +
  // 6-stem max.
  const rawStems = Array.isArray(body?.stems) ? body.stems : STUDIO_DEFAULT_STEMS;
  const stems = [...new Set(rawStems.filter((s) => ALLOWED_STEMS.has(s)))].slice(0, 6);
  if (!trackId) {
    return NextResponse.json({ error: "Missing trackId" }, { status: 400 });
  }
  if (stems.length === 0) {
    return NextResponse.json(
      { error: "Pick at least one valid stem", validStems: [...ALLOWED_STEMS] },
      { status: 400 }
    );
  }
  // Mode: "6stem" (default, just multistem) vs "9stem" (multistem +
  // 3 stem_separator calls for synth/strings/wind). Anything else
  // is treated as 6stem to preserve backward compat with old clients.
  const mode = body?.mode === "9stem" ? "9stem" : "6stem";
  const cost = mode === "9stem" ? STUDIO_PRO_STEM_COST : STUDIO_STEM_COST;

  const track = await prisma.musicTrack.findFirst({
    where: { id: trackId, userId, deletedAt: null },
    select: {
      id: true,
      title: true,
      r2Url: true,
      audioUrl: true,
      streamUrl: true,
      status: true,
      studioStemStatus: true,
      studioStems: true,
      studioStemTaskId: true,
    },
  });
  if (!track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }
  if (track.status !== "completed") {
    return NextResponse.json(
      { error: "Wait for the track to finish rendering before splitting stems." },
      { status: 400 }
    );
  }
  // Already done — return the existing stems, don't double-charge.
  if (track.studioStemStatus === "completed" && track.studioStems) {
    return NextResponse.json({
      ok: true,
      alreadyDone: true,
      studioStemStatus: "completed",
      studioStems: track.studioStems,
    });
  }
  // Already in flight — let the client poll.
  if (track.studioStemStatus === "processing" && track.studioStemTaskId) {
    return NextResponse.json({
      ok: true,
      alreadyDone: false,
      studioStemStatus: "processing",
      taskId: track.studioStemTaskId,
    });
  }
  const sourceUrl = track.r2Url || track.audioUrl || track.streamUrl;
  if (!sourceUrl) {
    return NextResponse.json(
      { error: "This track has no playable audio yet." },
      { status: 400 }
    );
  }

  // ── Debit credits ──────────────────────────────────────────────
  // Mode-aware: 6stem charges STUDIO_STEM_COST (30), 9stem charges
  // STUDIO_PRO_STEM_COST (50) for the extra 3 stem_separator calls.
  const debit = await prisma.$transaction(async (tx) => {
    const r = await tx.user.updateMany({
      where: { id: userId, credits: { gte: cost } },
      data: { credits: { decrement: cost } },
    });
    if (r.count === 1) {
      await tx.creditTransaction.create({
        data: { userId, delta: -cost, reason: "studio_stem_split", refType: "MusicTrack", refId: trackId, note: mode },
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

  async function refund(reason) {
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { credits: { increment: cost } } }),
      prisma.creditTransaction.create({ data: { userId, delta: cost, reason: "refund_studio_stem_split", refType: "MusicTrack", refId: trackId, note: reason.slice(0, 500) } }),
    ]).catch((e) => console.error("[STUDIO_STEMS] refund failed:", e?.message));
    console.warn(`[STUDIO_STEMS] refund — ${reason}`);
  }

  // ── Fetch + upload audio to LALAL ─────────────────────────────
  let audioBuf;
  try {
    const resp = await fetch(sourceUrl, { signal: AbortSignal.timeout(60_000) });
    if (!resp.ok) throw new Error(`Source fetch ${resp.status}`);
    audioBuf = Buffer.from(await resp.arrayBuffer());
  } catch (e) {
    await refund("source fetch failed");
    console.error("[STUDIO_STEMS] source fetch:", e?.message);
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
    console.error("[STUDIO_STEMS] upload:", e?.message);
    return NextResponse.json(
      { error: e?.message || "Stem service unavailable", refunded: true },
      { status: e.status || 502 }
    );
  }

  // Fire the multistem call (handles the 6 standard stems). For
  // 9stem mode we then fan out to 3 parallel stem_separator calls
  // for synth / strings / wind. The multistem one comes first so
  // we can fail fast on the most expensive call without orphaning
  // the others.
  let task;
  try {
    task = await startMultistemSplit({
      sourceId: upload.id,
      stems,
      extractionLevel: "deep_extraction",
    });
  } catch (e) {
    await refund("LALAL split-start failed");
    console.error("[STUDIO_STEMS] split start:", e?.message);
    return NextResponse.json(
      { error: e?.message || "Stem service couldn't start the job", refunded: true },
      { status: e.status || 502 }
    );
  }

  // 9-stem mode: fan out 3 stem_separator jobs in parallel. If any
  // one fails we refund + abort, but we leave the already-started
  // multistem task to expire on its own (LALAL has no cancel; it'll
  // just sit unread for 24h).
  const allTaskIds = [task.task_id];
  const allStems = [...stems];
  if (mode === "9stem") {
    let extraTasks;
    try {
      extraTasks = await Promise.all(
        STUDIO_PRO_EXTRA_STEMS.map((stem) =>
          startStemSeparator({ sourceId: upload.id, stem })
        )
      );
    } catch (e) {
      await refund("LALAL stem-separator start failed");
      console.error("[STUDIO_STEMS] stem-separator start:", e?.message);
      return NextResponse.json(
        { error: e?.message || "Pro stem service couldn't start the extra jobs", refunded: true },
        { status: e.status || 502 }
      );
    }
    for (const t of extraTasks) allTaskIds.push(t.task_id);
    for (const s of STUDIO_PRO_EXTRA_STEMS) allStems.push(s);
  }

  try {
    await prisma.musicTrack.update({
      where: { id: track.id },
      data: {
        // studioStemTaskId stays the multistem one — that's what the
        // check route's auth check matches against. studioStemTaskIds
        // holds ALL task IDs (1 for 6stem, 4 for 9stem) and is what
        // the check route actually polls.
        studioStemTaskId: task.task_id,
        studioStemTaskIds: allTaskIds,
        studioStemMode: mode,
        studioStemStatus: "processing",
        studioStemError: null,
        // Stash the source_id + stem list inside studioStems so the
        // check route can find them. Will be overwritten with the
        // actual stem URLs on completion.
        studioStems: {
          _sourceId: upload.id,
          _stems: allStems,
          _startedAt: Date.now(),
        },
      },
    });
  } catch (e) {
    await refund("DB write failed");
    console.error("[STUDIO_STEMS] DB write:", e?.message);
    return NextResponse.json(
      { error: "Server error", refunded: true },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    studioStemStatus: "processing",
    taskId: task.task_id,
    stems: allStems,
    mode,
    cost,
  });
}
