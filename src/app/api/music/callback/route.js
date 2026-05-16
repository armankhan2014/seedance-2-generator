// POST /api/music/callback?secret=...
//
// Suno fires this webhook 1–3× per generation:
//   "text"     — lyrics text generated (we ignore for now)
//   "first"    — stream URL ready (~30–40s in)   → set streamUrl
//   "complete" — final mix ready (~2–3 min in)   → set audioUrl,
//                                                  mirror to R2,
//                                                  flip status=completed
//
// On error / generation failure: refund credits + flip status=failed,
// same compare-and-swap pattern as MuAPI's failAndRefund so racing
// callbacks can't double-refund.
//
// Authentication: Suno doesn't sign payloads — we accept a shared
// `secret` query param that matches the WEBHOOK_SECRET env (the same
// one MuAPI uses). Constant-time compare to prevent timing attacks.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
    console.warn("[MUSIC_CALLBACK] Rejected — bad secret");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }
  console.log("[MUSIC_CALLBACK] received:", JSON.stringify(payload).slice(0, 600));

  // Suno's callback envelope: { code, msg, data: { callbackType, task_id, data: [...] } }
  const data = payload.data || payload;
  const callbackType = data.callbackType || data.type || payload.callbackType;
  const taskId = data.task_id || data.taskId || payload.taskId;
  if (!taskId) {
    return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
  }

  // Find the track. If the row is missing, the user must have cancelled
  // / been refunded already — log and accept so Suno doesn't retry.
  const track = await prisma.musicTrack.findUnique({ where: { taskId } });
  if (!track) {
    console.warn(`[MUSIC_CALLBACK] No track for taskId ${taskId} — ignoring`);
    return NextResponse.json({ ok: true });
  }

  // Failed generation — Suno returns code !== 200 OR data.code = error.
  const reportedCode = payload.code ?? data.code;
  const reportedMsg = payload.msg || data.msg;
  if (reportedCode && reportedCode !== 200) {
    return failAndRefund(track, reportedMsg || `Suno error ${reportedCode}`);
  }

  // Pull the first audio variant. Suno can return multiple; we keep
  // the first one (the only one we charged for at our pricing tier).
  const items = Array.isArray(data.data) ? data.data : Array.isArray(payload.data) ? payload.data : [];
  const item = items[0] || data || {};
  const audioId = item.audio_id || item.id;
  const audioUrl = item.audio_url || item.audioUrl;
  const streamUrl = item.stream_audio_url || item.streamAudioUrl || item.streamUrl;
  const imageUrl = item.image_url || item.imageUrl;
  const actualDuration = Number(item.duration) || null;

  // ── First-stage callback ("first") — stream URL ready ──────────────
  if (callbackType === "first" || (streamUrl && !audioUrl)) {
    await prisma.musicTrack.update({
      where: { id: track.id },
      data: {
        audioId: audioId || track.audioId,
        streamUrl: streamUrl || track.streamUrl,
        imageUrl: imageUrl || track.imageUrl,
      },
    });
    return NextResponse.json({ ok: true, phase: "first" });
  }

  // ── Final callback ("complete") — full mix downloadable ────────────
  if (callbackType === "complete" || audioUrl) {
    // Mirror to R2 in the background — don't block the webhook ack.
    // If the upload fails, the user's library still serves Suno's URL
    // (which works for the next 15 days). A nightly cron retries.
    let r2Url = null;
    try {
      r2Url = await mirrorToR2(track.id, audioUrl);
    } catch (err) {
      console.warn("[MUSIC_CALLBACK] R2 mirror failed:", err?.message);
    }
    await prisma.musicTrack.update({
      where: { id: track.id },
      data: {
        audioId: audioId || track.audioId,
        streamUrl: streamUrl || track.streamUrl,
        audioUrl: audioUrl || track.audioUrl,
        imageUrl: imageUrl || track.imageUrl,
        actualDuration: actualDuration || track.actualDuration,
        r2Url: r2Url || undefined,
        status: "completed",
      },
    });
    return NextResponse.json({ ok: true, phase: "complete", r2: !!r2Url });
  }

  // Unknown callback type — log and accept so Suno doesn't retry.
  console.warn(`[MUSIC_CALLBACK] Unknown callbackType "${callbackType}" — accepted`);
  return NextResponse.json({ ok: true });
}

// Compare-and-swap fail + refund. Mirrors AIService.failAndRefund's
// semantics so a duplicate webhook can't double-refund.
async function failAndRefund(track, errMsg) {
  const safeErr = (errMsg || "").toString().slice(0, 500) || "Generation failed";
  const updated = await prisma.musicTrack.updateMany({
    where: { id: track.id, status: "processing" },
    data: { status: "failed", error: safeErr },
  });
  if (updated.count === 1 && track.credits > 0) {
    try {
      await prisma.user.update({
        where: { id: track.userId },
        data: { credits: { increment: track.credits } },
      });
      console.log(
        `[MUSIC_REFUND] Refunded ${track.credits} credits to ${track.userId} for failed track ${track.taskId}`
      );
    } catch (refundErr) {
      console.error("[MUSIC_REFUND_FAILED]", refundErr?.message);
    }
  }
  return NextResponse.json({ ok: true, phase: "failed" });
}

// Best-effort: download the final mp3 from Suno and upload to our R2
// bucket so the track survives Suno's 15-day retention. Returns the
// public R2 URL, or null if anything fails — failure is non-fatal,
// the user can still stream from Suno's URL for 15 days.
async function mirrorToR2(trackId, sourceUrl) {
  if (!sourceUrl) return null;
  const region = process.env.R2_REGION || "auto";
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicHost = process.env.R2_PUBLIC_HOST;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicHost) {
    return null;
  }

  const audio = await fetch(sourceUrl);
  if (!audio.ok) throw new Error(`source fetch failed ${audio.status}`);
  const buf = Buffer.from(await audio.arrayBuffer());

  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  const key = `music/${trackId}.mp3`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buf,
      ContentType: "audio/mpeg",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  return `${publicHost.replace(/\/$/, "")}/${key}`;
}
