// POST /api/music/tracks/[id]/stems   { mode?: "vocal" | "split" }
//
// Kicks off a stem split (vocal/instrumental separation OR 12-stem
// Pro split) for one of the caller's finished music tracks. Async —
// the actual stem URLs arrive via /api/music/stems/callback ~30-90s
// later.
//
// Two modes:
//   • mode="vocal" (default, 4 credits) — 2 stems: vocal + instrumental.
//     Filmmakers wanting the instrumental under dialogue, producers
//     wanting to remix vocals, etc.
//   • mode="split" (18 credits)         — 12 stems: lead vocal, backing
//     vocals, drums, bass, guitar, keyboard, strings, brass, woodwinds,
//     percussion, synth, FX/other. Pro sound designers + composers who
//     want individual stems for DAW mixing.
//
// Validation:
//   • Caller must own the track + track must be status="completed".
//   • Track must have an audioId (pre-Phase-1 rows that pre-date
//     audioId persistence return "regenerate first").
//   • Already-completed splits return existing URLs as a no-op.
//   • In-flight splits are also no-op — wait for the callback.
//   • You CAN re-split a track with a different mode (e.g. 2-stem
//     done, then user wants 12-stem). The new split overwrites the
//     stem URLs on the row.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { separateVocals, scrubVendor, STEM_COST, STEM_SPLIT_COST } from "@/lib/suno";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALLOWED_MODES = new Set(["vocal", "split"]);

export async function POST(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  // Parse mode. Default "vocal" preserves backward-compat with the
  // existing UI — clients that don't pass a body still get the
  // 2-stem split they expected.
  let mode = "vocal";
  try {
    const body = await req.json().catch(() => null);
    if (body && ALLOWED_MODES.has(body.mode)) mode = body.mode;
  } catch {}

  const cost = mode === "split" ? STEM_SPLIT_COST : STEM_COST;
  const upstreamType = mode === "split" ? "split_stem" : "separate_vocal";

  // ── Fetch + authorize ─────────────────────────────────────────────
  const track = await prisma.musicTrack.findFirst({
    where: { id, userId, deletedAt: null },
    select: {
      id: true,
      taskId: true,
      audioId: true,
      status: true,
      stemStatus: true,
      stemMode: true,
      // A/B variants — when this row IS an alt (parentTrackId set),
      // its taskId is synthetic ("<original>-v2") and is NOT a valid
      // upstream identifier. We need to look up the parent to get the
      // real taskId for the upstream vocal-removal call.
      parentTrackId: true,
      vocalUrl: true,
      instrumentalUrl: true,
      drumsUrl: true,
      bassUrl: true,
      guitarUrl: true,
      keyboardUrl: true,
      stringsUrl: true,
      brassUrl: true,
      woodwindsUrl: true,
      percussionUrl: true,
      synthUrl: true,
      fxUrl: true,
      backingVocalsUrl: true,
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
      { error: "This track is too old to split stems — re-generate it and try again." },
      { status: 400 }
    );
  }
  // Idempotent: already done in the SAME mode → return existing URLs.
  if (
    track.stemStatus === "completed" &&
    track.stemMode === mode &&
    track.vocalUrl &&
    track.instrumentalUrl
  ) {
    return NextResponse.json({
      ok: true,
      alreadyDone: true,
      stemStatus: "completed",
      stemMode: mode,
      vocalUrl: track.vocalUrl,
      instrumentalUrl: track.instrumentalUrl,
      // Echo all 12-stem URLs too for the Pro mode case.
      drumsUrl: track.drumsUrl,
      bassUrl: track.bassUrl,
      guitarUrl: track.guitarUrl,
      keyboardUrl: track.keyboardUrl,
      stringsUrl: track.stringsUrl,
      brassUrl: track.brassUrl,
      woodwindsUrl: track.woodwindsUrl,
      percussionUrl: track.percussionUrl,
      synthUrl: track.synthUrl,
      fxUrl: track.fxUrl,
      backingVocalsUrl: track.backingVocalsUrl,
    });
  }
  // Already in flight → tell the client to keep polling.
  if (track.stemStatus === "processing") {
    return NextResponse.json({
      ok: true,
      alreadyDone: false,
      stemStatus: "processing",
      stemMode: track.stemMode || mode,
    });
  }

  // ── Debit credits atomically ──────────────────────────────────────
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

  // ── Build callback URL ────────────────────────────────────────────
  const origin =
    process.env.NEXTAUTH_URL ||
    `https://${req.headers.get("host") || "seedance.visualseffect.com"}`;
  const callbackSecret = process.env.WEBHOOK_SECRET;
  if (!callbackSecret) {
    await prisma.user.update({
      where: { id: userId },
      data: { credits: { increment: cost } },
    });
    console.error("[STEMS] WEBHOOK_SECRET missing — refunded + aborted");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const callBackUrl = `${origin}/api/music/stems/callback?secret=${encodeURIComponent(callbackSecret)}`;

  // ── Resolve the upstream taskId ───────────────────────────────────
  // For A/B alt rows (parentTrackId != null), our DB taskId is
  // synthetic (`<original>-v2`) and would 404 upstream as
  // "record does not exist". Walk up to the parent row to get the
  // real engine-issued taskId. The audioId on the alt row is real
  // (items[1].audio_id from the original generation's callback) so
  // we keep that.
  let upstreamTaskId = track.taskId;
  if (track.parentTrackId) {
    const parent = await prisma.musicTrack.findFirst({
      where: { id: track.parentTrackId, userId },
      select: { taskId: true },
    });
    if (parent?.taskId) {
      upstreamTaskId = parent.taskId;
    }
  }

  // ── Fire upstream call ────────────────────────────────────────────
  let stemTaskId;
  try {
    const result = await separateVocals({
      taskId: upstreamTaskId,
      audioId: track.audioId,
      callBackUrl,
      type: upstreamType,
    });
    stemTaskId = result.stemTaskId;
    if (!stemTaskId) throw new Error("Stem service returned no task id");
  } catch (err) {
    await prisma.user.update({
      where: { id: userId },
      data: { credits: { increment: cost } },
    });
    // Log a rich error envelope so future "record does not exist"
    // reports have enough signal to root-cause without re-deploying
    // with logging tweaks.
    console.error("[STEMS] Upstream failed:", {
      trackId: track.id,
      isAlt: !!track.parentTrackId,
      upstreamTaskId,
      audioId: track.audioId,
      mode,
      upstreamMsg: err?.message,
      upstreamCode: err?.code,
      upstreamBody: err?.body,
    });
    const rawMsg = err?.message || "";
    // Friendlier mapping of common upstream errors so the user sees
    // an actionable message instead of raw engine vocabulary.
    let userMsg;
    if (/record does not exist|not found|invalid task/i.test(rawMsg)) {
      userMsg = mode === "split"
        ? "Pro split couldn't find this track upstream — it may be too old (engine retains source audio for ~14 days). Try regenerating the track, then split again."
        : "Couldn't find this track upstream — it may be too old (engine retains source audio for ~14 days). Try regenerating the track, then split again.";
    } else {
      userMsg = scrubVendor(rawMsg) || "Stem service unavailable";
    }
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    return NextResponse.json(
      { error: userMsg, refunded: true },
      { status }
    );
  }

  // ── Persist in-flight state ───────────────────────────────────────
  // Clear ALL stem URLs (both 2-stem and 12-stem columns) so a re-split
  // doesn't leave stale data from the previous mode on the row.
  try {
    await prisma.musicTrack.update({
      where: { id: track.id },
      data: {
        stemTaskId,
        stemStatus: "processing",
        stemMode: mode,
        stemError: null,
        vocalUrl: null,
        instrumentalUrl: null,
        backingVocalsUrl: null,
        drumsUrl: null,
        bassUrl: null,
        guitarUrl: null,
        keyboardUrl: null,
        stringsUrl: null,
        brassUrl: null,
        woodwindsUrl: null,
        percussionUrl: null,
        synthUrl: null,
        fxUrl: null,
      },
    });
  } catch (err) {
    await prisma.user.update({
      where: { id: userId },
      data: { credits: { increment: cost } },
    });
    console.error("[STEMS] DB write failed:", err?.message);
    return NextResponse.json({ error: "Server error", refunded: true }, { status: 500 });
  }

  return NextResponse.json({ ok: true, stemStatus: "processing", stemMode: mode, cost });
}
