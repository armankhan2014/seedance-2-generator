// POST /api/music/stems/callback?secret=...
//
// Webhook fired by Suno's vocal-removal endpoint when a stem split
// finishes (~30-90 seconds after we kick it off). Payload shape per
// the upstream docs (separate_vocal mode):
//
//   { code, msg, data: {
//       task_id,
//       vocal_removal_info: {
//         vocal_url:        "https://...",
//         instrumental_url: "https://...",
//         origin_url:       ""
//       }
//   }}
//
// Authoritative: this is the ONLY way stem URLs land on a MusicTrack
// row. We mirror both stems to our own R2 (Suno's hosted URLs only
// live 14 days; tracks should outlive that) and flip stemStatus to
// "completed" on success. On any error we flip to "failed" + refund
// the STEM_COST credits we charged at kickoff time.
//
// Auth: shared WEBHOOK_SECRET query param, constant-time compared —
// same pattern as /api/music/callback.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadAudioBuffer, isR2Configured } from "@/lib/storage";
import { scrubVendor, STEM_COST } from "@/lib/suno";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorize(req) {
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected) return false;
  const got = new URL(req.url).searchParams.get("secret") || "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req) {
  if (!authorize(req)) {
    console.warn("[STEMS_CALLBACK] Rejected — bad secret");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }
  console.log("[STEMS_CALLBACK] received:", JSON.stringify(payload).slice(0, 600));

  const data = payload.data || payload;
  const stemTaskId = data.task_id || data.taskId || payload.taskId;
  if (!stemTaskId) {
    return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
  }

  // Find the parent music track this stem job belongs to.
  const track = await prisma.musicTrack.findFirst({
    where: { stemTaskId },
    select: {
      id: true,
      userId: true,
      stemStatus: true,
    },
  });
  if (!track) {
    console.warn(`[STEMS_CALLBACK] No track for stemTaskId ${stemTaskId} — ignoring`);
    // Return 200 so Suno doesn't keep retrying.
    return NextResponse.json({ ok: true });
  }

  // Failed upstream — flip status + refund.
  const reportedCode = payload.code ?? data.code;
  const reportedMsg = payload.msg || data.msg;
  if (reportedCode && reportedCode !== 200) {
    return failAndRefund(track, reportedMsg || `Stem service error ${reportedCode}`);
  }

  // Pull the stems out of vocal_removal_info. Fall back to top-level
  // fields just in case Suno changes shape between docs and reality.
  const info = data.vocal_removal_info || data || {};
  const vocalSrc = info.vocal_url || info.vocalUrl || null;
  const instrSrc =
    info.instrumental_url || info.instrumentalUrl || info.no_vocal_url || null;

  if (!vocalSrc || !instrSrc) {
    console.warn("[STEMS_CALLBACK] missing stems in payload:", JSON.stringify(info).slice(0, 300));
    return failAndRefund(track, "Stem service returned no URLs");
  }

  // Mirror both stems to R2 so they outlive Suno's 14-day retention.
  // Failure to mirror is non-fatal — we fall back to Suno's URLs so
  // the user still gets the stems (just expiring sooner).
  let vocalUrl = vocalSrc;
  let instrumentalUrl = instrSrc;
  if (isR2Configured()) {
    try {
      vocalUrl = await mirrorStem(vocalSrc, `stems/${track.id}/vocal.mp3`);
    } catch (err) {
      console.warn("[STEMS_CALLBACK] vocal R2 mirror failed:", err?.message);
    }
    try {
      instrumentalUrl = await mirrorStem(instrSrc, `stems/${track.id}/instrumental.mp3`);
    } catch (err) {
      console.warn("[STEMS_CALLBACK] instrumental R2 mirror failed:", err?.message);
    }
  }

  // Compare-and-swap update — only completes if we were the FIRST
  // callback to land. Subsequent duplicate fires no-op.
  const updated = await prisma.musicTrack.updateMany({
    where: { id: track.id, stemStatus: "processing" },
    data: {
      vocalUrl,
      instrumentalUrl,
      stemStatus: "completed",
      stemError: null,
    },
  });

  return NextResponse.json({ ok: true, applied: updated.count === 1 });
}

// Download a stem from the upstream URL and persist to R2 under the
// given key. Returns the public R2 URL.
async function mirrorStem(sourceUrl, key) {
  const res = await fetch(sourceUrl, {
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`source fetch ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return await uploadAudioBuffer(buf, key, "audio/mpeg");
}

// Compare-and-swap fail + refund — mirrors the pattern in
// /api/music/callback. Idempotent so a duplicate failure webhook
// can't double-refund.
async function failAndRefund(track, errMsg) {
  const safeErr =
    scrubVendor((errMsg || "").toString().slice(0, 500)) ||
    "Stem split failed";
  const updated = await prisma.musicTrack.updateMany({
    where: { id: track.id, stemStatus: "processing" },
    data: { stemStatus: "failed", stemError: safeErr },
  });
  if (updated.count === 1) {
    try {
      await prisma.user.update({
        where: { id: track.userId },
        data: { credits: { increment: STEM_COST } },
      });
      console.log(
        `[STEMS_REFUND] Refunded ${STEM_COST} credits to ${track.userId} for failed stem ${track.id}`
      );
    } catch (refundErr) {
      console.error("[STEMS_REFUND_FAILED]", refundErr?.message);
    }
  }
  return NextResponse.json({ ok: true, phase: "failed" });
}
