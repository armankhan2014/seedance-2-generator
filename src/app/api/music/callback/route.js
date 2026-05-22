// POST /api/music/callback?secret=...
//
// music engine fires this webhook 1–3× per generation:
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
// Authentication: music engine doesn't sign payloads — we accept a shared
// `secret` query param that matches the WEBHOOK_SECRET env (the same
// one MuAPI uses). Constant-time compare to prevent timing attacks.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scrubVendor } from "@/lib/suno";
import { uploadAudioBuffer, isR2Configured } from "@/lib/storage";
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

  // music engine's callback envelope: { code, msg, data: { callbackType, task_id, data: [...] } }
  const data = payload.data || payload;
  const callbackType = data.callbackType || data.type || payload.callbackType;
  const taskId = data.task_id || data.taskId || payload.taskId;
  if (!taskId) {
    return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
  }

  // Find the track. If the row is missing, the user must have cancelled
  // / been refunded already — log and accept so music engine doesn't retry.
  const track = await prisma.musicTrack.findUnique({ where: { taskId } });
  if (!track) {
    console.warn(`[MUSIC_CALLBACK] No track for taskId ${taskId} — ignoring`);
    return NextResponse.json({ ok: true });
  }

  // Failed generation — music engine returns code !== 200 OR data.code = error.
  const reportedCode = payload.code ?? data.code;
  const reportedMsg = payload.msg || data.msg;
  if (reportedCode && reportedCode !== 200) {
    return failAndRefund(track, reportedMsg || `Music engine error ${reportedCode}`);
  }

  // Pull both audio variants. The music engine returns up to 2 per
  // generation call — we used to discard the second. Now we keep it
  // and persist it as a sibling "alt" row so users get A/B compare
  // for free on every generation (Phase 4 feature 3).
  const items = Array.isArray(data.data) ? data.data : Array.isArray(payload.data) ? payload.data : [];
  const item = items[0] || data || {};
  const altItem = items[1] || null;
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
    // If the upload fails, the user's library still serves music engine's URL
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

    // ── Persist the 2nd variant as an "alt" sibling row ─────────────
    // The music engine returns 2 takes per generation; we used to
    // discard the second. Now we save it as its own MusicTrack row
    // linked back to the original via parentTrackId. Same metadata
    // (genre/mood/lyrics/etc) so the library card style stays
    // consistent. Title gets " (alt)" suffix so it's visually
    // distinct in the library. Best-effort R2 mirror — fall back to
    // the music-engine URL if the mirror fails.
    //
    // Only fire on extensions / generations / covers — NOT on
    // already-extended tracks (parentTrackId already set on those)
    // and NOT when the variant has no audio (incomplete second take).
    if (altItem && !track.parentTrackId) {
      const altAudioUrl = altItem.audio_url || altItem.audioUrl;
      const altStreamUrl = altItem.stream_audio_url || altItem.streamAudioUrl || altItem.streamUrl;
      if (altAudioUrl) {
        try {
          // Reload the original track to copy all metadata into the
          // alt row — the partial `track` we have above only has the
          // columns we queried earlier.
          const original = await prisma.musicTrack.findUnique({
            where: { id: track.id },
            select: {
              userId: true,
              title: true,
              prompt: true,
              genre: true,
              mood: true,
              durationReq: true,
              isVocal: true,
              lyrics: true,
              tempo: true,
              model: true,
            },
          });
          if (original) {
            let altR2Url = null;
            try {
              altR2Url = await mirrorAltToR2(track.id, altAudioUrl);
            } catch (err) {
              console.warn("[MUSIC_CALLBACK] alt R2 mirror failed:", err?.message);
            }
            const altTitle = original.title?.endsWith("(alt)")
              ? original.title
              : `${original.title || "Track"} (alt)`;
            await prisma.musicTrack.create({
              data: {
                userId: original.userId,
                // Suno gives both variants the same taskId; we
                // synthesise a unique-per-variant id so the @unique
                // constraint holds without clashing with future
                // callback lookups (we look up by taskId === <original>,
                // never the "-v2" suffix).
                taskId: `${taskId}-v2`,
                audioId: altItem.audio_id || altItem.id || null,
                title: altTitle,
                prompt: original.prompt,
                genre: original.genre,
                mood: original.mood,
                durationReq: original.durationReq,
                isVocal: original.isVocal,
                lyrics: original.lyrics,
                tempo: original.tempo,
                model: original.model,
                streamUrl: altStreamUrl || null,
                audioUrl: altAudioUrl,
                imageUrl: item.image_url || altItem.image_url || null,
                actualDuration: Number(altItem.duration) || actualDuration,
                r2Url: altR2Url,
                status: "completed",
                credits: 0, // already paid via the original; no
                            // double-charge for the free 2nd take
                parentTrackId: track.id,
              },
            });
          }
        } catch (altErr) {
          // Non-fatal — main track is already done, we just lose the
          // alt take. Log + move on so we don't block the webhook ack.
          console.warn("[MUSIC_CALLBACK] alt row create failed:", altErr?.message);
        }
      }
    }

    return NextResponse.json({ ok: true, phase: "complete", r2: !!r2Url });
  }

  // Unknown callback type — log and accept so music engine doesn't retry.
  console.warn(`[MUSIC_CALLBACK] Unknown callbackType "${callbackType}" — accepted`);
  return NextResponse.json({ ok: true });
}

// Compare-and-swap fail + refund. Mirrors AIService.failAndRefund's
// semantics so a duplicate webhook can't double-refund.
async function failAndRefund(track, errMsg) {
  // Scrub vendor strings before persisting — the value is shown back
  // to the user as the failed-track tooltip in their library.
  const safeErr = scrubVendor((errMsg || "").toString().slice(0, 500)) || "Generation failed";
  const updated = await prisma.musicTrack.updateMany({
    where: { id: track.id, status: "processing" },
    data: { status: "failed", error: safeErr },
  });
  if (updated.count === 1 && track.credits > 0) {
    try {
      await prisma.$transaction([
        prisma.user.update({ where: { id: track.userId }, data: { credits: { increment: track.credits } } }),
        prisma.creditTransaction.create({ data: { userId: track.userId, delta: track.credits, reason: "refund_music_generate", refType: "MusicTrack", refId: track.id, note: safeErr.slice(0, 500) } }),
      ]);
      console.log(
        `[MUSIC_REFUND] Refunded ${track.credits} credits to ${track.userId} for failed track ${track.taskId}`
      );
    } catch (refundErr) {
      console.error("[MUSIC_REFUND_FAILED]", refundErr?.message);
    }
  }
  return NextResponse.json({ ok: true, phase: "failed" });
}

// Mirror the alt variant to R2 using the modern storage.js helpers
// (the legacy mirrorToR2 below uses outdated env var names — R2_BUCKET
// instead of R2_BUCKET_NAME, etc. — so it silently no-ops on the
// current Vercel env). New code paths should go through this helper.
async function mirrorAltToR2(originalTrackId, sourceUrl) {
  if (!isR2Configured()) return null;
  const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`source fetch ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const key = `music/${originalTrackId}-alt.mp3`;
  return await uploadAudioBuffer(buf, key, "audio/mpeg");
}

// Best-effort: download the final mp3 from music engine and upload
// to our R2 bucket so the track survives music engine's 15-day
// retention. Returns the public R2 URL, or null if anything fails —
// failure is non-fatal, the user can still stream from music engine's
// URL for 15 days.
//
// Migrated 2026-05-17 to use the storage.js helper instead of an
// inline S3Client. The old implementation referenced R2_BUCKET +
// R2_ENDPOINT + R2_PUBLIC_HOST env vars that don't exist in
// production (we use R2_BUCKET_NAME / R2_PUBLIC_URL / R2_ACCOUNT_ID),
// so it was silently no-op'ing on every track — meaning no track
// had ever been mirrored to R2 and every track went stale after 15
// days. Switching to uploadAudioBuffer() picks up the right vars.
async function mirrorToR2(trackId, sourceUrl) {
  if (!sourceUrl) return null;
  if (!isR2Configured()) return null;
  const audio = await fetch(sourceUrl);
  if (!audio.ok) throw new Error(`source fetch failed ${audio.status}`);
  const buf = Buffer.from(await audio.arrayBuffer());
  const key = `music/${trackId}.mp3`;
  return await uploadAudioBuffer(buf, key, "audio/mpeg");
}
