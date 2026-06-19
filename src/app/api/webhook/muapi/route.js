import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AIService } from "@/lib/services/ai";
import { sendCreationReadyPush, sendCreationFailedPush } from "@/lib/push";
import { mirrorToR2IfExternal } from "@/lib/r2-mirror";
import crypto from "crypto";

// Max time we'll spend mirroring before falling back to the raw MuAPI
// URL. The webhook ACK has to be fast enough that MuAPI doesn't retry
// (they treat slow ACKs as 5xx and re-deliver), so we cap the mirror
// at 20s — typical 8-12 MB Seedance output downloads + uploads in
// 3-6s on the Vercel lambda. If R2 ever hiccups, the AbortSignal
// trips, we store the raw URL, and the user's video still works for
// ~30 days until MuAPI archives it. A future backfill cron can
// retry-mirror the surviving-but-raw rows.
const MIRROR_TIMEOUT_MS = 20_000;

export async function POST(req) {
  try {
    // Verify webhook secret to prevent fake webhook injection
    const url = new URL(req.url);
    const webhookSecret = url.searchParams.get("secret");
    const expectedSecret = process.env.WEBHOOK_SECRET;
    if (!expectedSecret || !webhookSecret) {
      console.warn("[MUAPI_WEBHOOK] Rejected — missing webhook secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // timingSafeEqual throws on length mismatch — pre-check to avoid the
    // crash when an attacker (or typo) sends a wrong-length secret.
    const a = Buffer.from(webhookSecret);
    const b = Buffer.from(expectedSecret);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      console.warn("[MUAPI_WEBHOOK] Rejected — invalid webhook secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await req.json();
    console.log("[MUAPI_WEBHOOK] received:", JSON.stringify(data).slice(0, 500));

    const requestId = data.id;
    if (!requestId) {
      return NextResponse.json({ error: "Missing request id" }, { status: 400 });
    }

    const creation = await prisma.creation.findUnique({ where: { requestId } });
    if (!creation) {
      console.warn(`[MUAPI_WEBHOOK] Creation ${requestId} not found — ignoring`);
      return NextResponse.json({ ok: true });
    }

    const outputs = data.outputs || data.output || [];
    const outputArr = Array.isArray(outputs) ? outputs : (outputs ? [outputs] : []);
    const rawImageUrl = outputArr[0] || null;
    const hasError = data.error && data.error !== "" && data.error !== null;

    // Mirror MuAPI's output URL into our R2 bucket BEFORE persisting
    // it to the Creation row. MuAPI's S3 has a "30daysoutputexpiry"
    // rule that archives outputs to DEEP_ARCHIVE after a month, which
    // makes the bytes unreachable (GET → 403 AccessDenied). Before
    // this mirror, every video older than 30 days started breaking
    // its share links, prompt-library entries, and OG cards. Caught
    // 2026-06-19 on three already-zombie prompt-library shares.
    //
    // The helper HEAD-checks first, caps at 80 MB, and returns null
    // on any failure so we fall back to the raw MuAPI URL — the user
    // still gets a working video for the first 30 days, and a
    // future backfill can retry.
    let imageUrl = rawImageUrl;
    if (!hasError && rawImageUrl) {
      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), MIRROR_TIMEOUT_MS);
        const mirrored = await mirrorToR2IfExternal(rawImageUrl, {
          prefix: `creations/${creation.userId}`,
          signal: ac.signal,
        });
        clearTimeout(timer);
        if (mirrored) imageUrl = mirrored;
      } catch (e) {
        console.warn(
          `[MUAPI_WEBHOOK] R2 mirror failed for ${creation.id}: ${e?.message || e} — falling back to raw URL`
        );
        // imageUrl already set to rawImageUrl above — no further action
      }
    }

    if (hasError) {
      // Atomic transition + refund. failAndRefund uses a conditional
      // updateMany so if the polling path raced us to mark this creation
      // failed, only one of us gets count===1 and refunds — never both.
      // This is what surfaces "Face detected" and similar content-policy
      // rejections to the user instead of leaving them stuck at
      // "processing" while keeping their credits. Arman flagged 2026-05-12.
      await AIService.failAndRefund(creation, data.error);
      // Fire-and-forget push so the user doesn't sit waiting on a
      // doomed render. Wrapped in catch so a push failure never
      // 500s the webhook — MuAPI will retry the webhook on 5xx.
      sendCreationFailedPush(creation.userId, creation, data.error).catch((e) =>
        console.warn("[MUAPI_WEBHOOK] push failed (failed-gen):", e?.message)
      );
    } else {
      // Conditional flip: only update if the row is STILL processing.
      // Guards against double-pay when the hourly stuck-creation cron
      // (see /api/cron/sweep-stuck-creations) has already auto-failed
      // + refunded a long-stuck row and MuAPI delivers a late success
      // afterwards. Without this filter the late success would
      // overwrite status: "failed" → "completed" and the user would
      // end up with BOTH the refund AND a working video.
      //
      // updateMany.count === 0 here = the cron (or the poll path)
      // already terminated the row; we silently drop the late delivery
      // and don't fire the ready-push.
      const result = await prisma.creation.updateMany({
        where: { id: creation.id, status: "processing" },
        data: { status: "completed", imageUrl },
      });
      if (result.count === 0) {
        console.log(`[MUAPI_WEBHOOK] late success for already-terminated creation ${creation.id} — ignored`);
      } else {
        // "🎬 Your video is ready" push — fanout to all Studio-origin
        // subscriptions for this user. Same fire-and-forget pattern;
        // we don't block the webhook ACK on the push send.
        sendCreationReadyPush(creation.userId, creation).catch((e) =>
          console.warn("[MUAPI_WEBHOOK] push failed (ready):", e?.message)
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[MUAPI_WEBHOOK_ERROR]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
