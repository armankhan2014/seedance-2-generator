// POST /api/music/stems/callback?secret=...
//
// Webhook fired by the engine's vocal-removal endpoint when a stem
// split finishes (~30-90s after kickoff). Handles BOTH split modes:
//
// separate_vocal (2-stem, 4-credit tier):
//   { code, msg, data: {
//       task_id,
//       vocal_removal_info: {
//         vocal_url, instrumental_url, origin_url
//       }
//   }}
//
// split_stem (12-stem, 18-credit Pro tier):
//   { code, msg, data: {
//       task_id,
//       vocal_removal_info: {
//         vocal_url, backing_vocals_url, drums_url, bass_url,
//         guitar_url, keyboard_url, strings_url, brass_url,
//         woodwinds_url, percussion_url, synth_url, fx_url,
//         origin_url
//       }
//   }}
//
// We mirror every present stem to R2 (engine URLs only live 14 days)
// and flip stemStatus to "completed" on success. On any error we
// flip to "failed" + refund the appropriate credit cost (4 or 18)
// based on the track's stemMode column set at kickoff time.
//
// Auth: shared WEBHOOK_SECRET query param, constant-time compared.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadAudioBuffer, isR2Configured } from "@/lib/storage";
import { scrubVendor, STEM_COST, STEM_SPLIT_COST } from "@/lib/suno";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Map of {payload field name → DB column name → R2 key suffix}. One
// entry per stem the engine can return. The 2-stem (separate_vocal)
// payload only fills vocal_url + instrumental_url; the 12-stem
// (split_stem) payload fills the rest. Missing stems are silently
// skipped — some tracks won't have e.g. brass/woodwinds isolated.
const STEM_MAP = [
  { payloadKey: "vocal_url",          col: "vocalUrl",          r2: "vocal" },
  { payloadKey: "instrumental_url",   col: "instrumentalUrl",   r2: "instrumental" },
  { payloadKey: "backing_vocals_url", col: "backingVocalsUrl",  r2: "backing-vocals" },
  { payloadKey: "drums_url",          col: "drumsUrl",          r2: "drums" },
  { payloadKey: "bass_url",           col: "bassUrl",           r2: "bass" },
  { payloadKey: "guitar_url",         col: "guitarUrl",         r2: "guitar" },
  { payloadKey: "keyboard_url",       col: "keyboardUrl",       r2: "keyboard" },
  { payloadKey: "strings_url",        col: "stringsUrl",        r2: "strings" },
  { payloadKey: "brass_url",          col: "brassUrl",          r2: "brass" },
  { payloadKey: "woodwinds_url",      col: "woodwindsUrl",      r2: "woodwinds" },
  { payloadKey: "percussion_url",     col: "percussionUrl",     r2: "percussion" },
  { payloadKey: "synth_url",          col: "synthUrl",          r2: "synth" },
  { payloadKey: "fx_url",             col: "fxUrl",             r2: "fx" },
];

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
  console.log("[STEMS_CALLBACK] received:", JSON.stringify(payload).slice(0, 800));

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
      stemMode: true,
    },
  });
  if (!track) {
    console.warn(`[STEMS_CALLBACK] No track for stemTaskId ${stemTaskId} — ignoring`);
    return NextResponse.json({ ok: true });
  }

  // Failed upstream — flip status + refund.
  const reportedCode = payload.code ?? data.code;
  const reportedMsg = payload.msg || data.msg;
  if (reportedCode && reportedCode !== 200) {
    return failAndRefund(track, reportedMsg || `Stem service error ${reportedCode}`);
  }

  // Pull stem URLs out of vocal_removal_info. Some payloads put them
  // at the top level — fall back to data itself.
  const info = data.vocal_removal_info || data || {};

  // For 2-stem mode we REQUIRE vocal + instrumental. For 12-stem mode
  // we require vocal at minimum (the engine doesn't always isolate
  // every instrument family — woodwinds on a synth track is rightly
  // absent — but vocal/drums/bass should be present).
  const hasVocal = !!(info.vocal_url || info.vocalUrl);
  const hasInstr = !!(info.instrumental_url || info.instrumentalUrl || info.no_vocal_url);
  if (track.stemMode === "vocal" && (!hasVocal || !hasInstr)) {
    console.warn("[STEMS_CALLBACK] missing 2-stem URLs:", JSON.stringify(info).slice(0, 300));
    return failAndRefund(track, "Stem service returned no URLs");
  }
  if (track.stemMode === "split" && !hasVocal) {
    console.warn("[STEMS_CALLBACK] missing vocal in 12-stem payload:", JSON.stringify(info).slice(0, 300));
    return failAndRefund(track, "Stem service returned no vocal URL");
  }

  // Walk the STEM_MAP, mirror every present URL to R2 in parallel.
  // Missing stems (e.g. no brass on this track) end up as null in
  // updateData — overwriting any stale prior value cleanly.
  const r2Ready = isR2Configured();
  const updateData = { stemStatus: "completed", stemError: null };
  const mirrorPromises = [];
  for (const { payloadKey, col, r2 } of STEM_MAP) {
    // Pick up either snake_case (docs) or camelCase (defensive) keys.
    const src = info[payloadKey] || info[payloadKey.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] || null;
    // For instrumental specifically, also try the legacy "no_vocal_url".
    const finalSrc = !src && col === "instrumentalUrl" ? (info.no_vocal_url || null) : src;
    if (!finalSrc) {
      // Explicitly null out any prior value so a re-split from
      // 12-stem → 2-stem doesn't leave stale drums/bass/etc URLs.
      updateData[col] = null;
      continue;
    }
    if (!r2Ready) {
      // R2 misconfigured — fall back to engine URLs (14-day life).
      updateData[col] = finalSrc;
      continue;
    }
    // Mirror in parallel. Each promise resolves to its own [col, url]
    // tuple so we can populate updateData after Promise.allSettled.
    mirrorPromises.push(
      mirrorStem(finalSrc, `stems/${track.id}/${r2}.mp3`)
        .then((u) => [col, u])
        .catch((err) => {
          // Mirror failure is non-fatal — fall back to engine URL.
          console.warn(`[STEMS_CALLBACK] R2 mirror failed for ${col}:`, err?.message);
          return [col, finalSrc];
        })
    );
  }
  const results = await Promise.allSettled(mirrorPromises);
  for (const r of results) {
    if (r.status === "fulfilled") {
      const [col, url] = r.value;
      updateData[col] = url;
    }
  }

  // Compare-and-swap — only the FIRST callback wins. Duplicate fires
  // (Suno occasionally retries on flaky network) become no-ops.
  const updated = await prisma.musicTrack.updateMany({
    where: { id: track.id, stemStatus: "processing" },
    data: updateData,
  });

  return NextResponse.json({
    ok: true,
    applied: updated.count === 1,
    stemMode: track.stemMode,
    stemsMirrored: Object.keys(updateData).filter((k) => updateData[k] && k !== "stemStatus").length,
  });
}

// Download a single stem and persist to R2.
async function mirrorStem(sourceUrl, key) {
  const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`source fetch ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return await uploadAudioBuffer(buf, key, "audio/mpeg");
}

// Compare-and-swap fail + refund. Refund amount depends on which
// mode the user chose at kickoff (stored on the row at the time).
async function failAndRefund(track, errMsg) {
  const safeErr =
    scrubVendor((errMsg || "").toString().slice(0, 500)) ||
    "Stem split failed";
  const updated = await prisma.musicTrack.updateMany({
    where: { id: track.id, stemStatus: "processing" },
    data: { stemStatus: "failed", stemError: safeErr },
  });
  if (updated.count === 1) {
    const refundAmount = track.stemMode === "split" ? STEM_SPLIT_COST : STEM_COST;
    try {
      await prisma.$transaction([
        prisma.user.update({ where: { id: track.userId }, data: { credits: { increment: refundAmount } } }),
        prisma.creditTransaction.create({ data: { userId: track.userId, delta: refundAmount, reason: "refund_stem_split", refType: "MusicTrack", refId: track.id, note: safeErr.slice(0, 500) } }),
      ]);
      console.log(
        `[STEMS_REFUND] Refunded ${refundAmount} credits to ${track.userId} for failed ${track.stemMode || "vocal"} stem ${track.id}`
      );
    } catch (refundErr) {
      console.error("[STEMS_REFUND_FAILED]", refundErr?.message);
    }
  }
  return NextResponse.json({ ok: true, phase: "failed" });
}
