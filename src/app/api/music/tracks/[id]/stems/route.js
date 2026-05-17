// POST /api/music/tracks/[id]/stems
//
// Kicks off a stem split (vocal + instrumental separation) for one of
// the caller's finished music tracks. Async — the actual stem URLs
// arrive via /api/music/stems/callback ~30-90 seconds later.
//
// Validation:
//   • Caller must own the track (session.user.id === track.userId).
//   • Track must be in status="completed" — half-rendered tracks have
//     no audioId yet, so the upstream call would fail anyway.
//   • Track must have an audioId (set during the original generation's
//     callback). Pre-Phase-1 rows that pre-date audioId persistence
//     return a friendly "regenerate first" error.
//   • If stems are already split (stemStatus === "completed"), we
//     return the existing URLs as a no-op so a double-click doesn't
//     trigger a second paid call.
//   • If a split is in flight (stemStatus === "processing"), same
//     no-op behaviour — wait for the callback.
//
// Credit cost: 4 credits. Comfortable margin over the upstream
// wholesale price (~10 of Suno's credits). Same atomic CAS debit +
// refund-on-any-failure pattern as /api/music/generate.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
// STEM_COST imported from suno.js so the callback handler shares the
// same constant. Centralised so a price change only touches one file.
import { separateVocals, scrubVendor, STEM_COST } from "@/lib/suno";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  // ── Fetch + authorize ─────────────────────────────────────────────
  const track = await prisma.musicTrack.findFirst({
    where: { id, userId, deletedAt: null },
    select: {
      id: true,
      taskId: true,
      audioId: true,
      status: true,
      stemStatus: true,
      vocalUrl: true,
      instrumentalUrl: true,
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
  if (!track.audioId) {
    return NextResponse.json(
      {
        error: "This track is too old to split stems — re-generate it and try again.",
      },
      { status: 400 }
    );
  }
  // Idempotent: already done → return existing URLs.
  if (track.stemStatus === "completed" && track.vocalUrl && track.instrumentalUrl) {
    return NextResponse.json({
      ok: true,
      alreadyDone: true,
      stemStatus: "completed",
      vocalUrl: track.vocalUrl,
      instrumentalUrl: track.instrumentalUrl,
    });
  }
  // Already in flight → tell the client to keep polling.
  if (track.stemStatus === "processing") {
    return NextResponse.json({
      ok: true,
      alreadyDone: false,
      stemStatus: "processing",
    });
  }

  // ── Debit credits atomically ──────────────────────────────────────
  const debit = await prisma.user.updateMany({
    where: { id: userId, credits: { gte: STEM_COST } },
    data: { credits: { decrement: STEM_COST } },
  });
  if (debit.count !== 1) {
    return NextResponse.json(
      { error: "Insufficient credits", code: "NO_CREDITS", cost: STEM_COST },
      { status: 402 }
    );
  }

  // ── Build callback URL ────────────────────────────────────────────
  const origin =
    process.env.NEXTAUTH_URL ||
    `https://${req.headers.get("host") || "seedance.visualseffect.com"}`;
  const callbackSecret = process.env.WEBHOOK_SECRET;
  if (!callbackSecret) {
    await prisma.user.update({
      where: { id: userId },
      data: { credits: { increment: STEM_COST } },
    });
    console.error("[STEMS] WEBHOOK_SECRET missing — refunded + aborted");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const callBackUrl = `${origin}/api/music/stems/callback?secret=${encodeURIComponent(callbackSecret)}`;

  // ── Fire upstream call ────────────────────────────────────────────
  let stemTaskId;
  try {
    const result = await separateVocals({
      taskId: track.taskId,
      audioId: track.audioId,
      callBackUrl,
      type: "separate_vocal",
    });
    stemTaskId = result.stemTaskId;
    if (!stemTaskId) throw new Error("Stem service returned no task id");
  } catch (err) {
    await prisma.user.update({
      where: { id: userId },
      data: { credits: { increment: STEM_COST } },
    });
    console.error("[STEMS] Upstream failed:", err?.message);
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    return NextResponse.json(
      { error: scrubVendor(err?.message) || "Stem service unavailable", refunded: true },
      { status }
    );
  }

  // ── Persist in-flight state ───────────────────────────────────────
  // We also stash the upstream credit charge on the track row so the
  // callback handler knows how much to refund if Suno reports a
  // failure during the stem job. We reuse the existing `credits`
  // column? No — that's the original gen credits. We just track in
  // memory by re-reading STEM_COST in the callback below.
  try {
    await prisma.musicTrack.update({
      where: { id: track.id },
      data: {
        stemTaskId,
        stemStatus: "processing",
        stemError: null,
        vocalUrl: null,
        instrumentalUrl: null,
      },
    });
  } catch (err) {
    await prisma.user.update({
      where: { id: userId },
      data: { credits: { increment: STEM_COST } },
    });
    console.error("[STEMS] DB write failed:", err?.message);
    return NextResponse.json({ error: "Server error", refunded: true }, { status: 500 });
  }

  return NextResponse.json({ ok: true, stemStatus: "processing", cost: STEM_COST });
}
