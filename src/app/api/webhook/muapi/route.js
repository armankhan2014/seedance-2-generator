import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AIService } from "@/lib/services/ai";
import { sendCreationReadyPush, sendCreationFailedPush } from "@/lib/push";
import crypto from "crypto";

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
    const imageUrl = outputArr[0] || null;
    const hasError = data.error && data.error !== "" && data.error !== null;

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
      await prisma.creation.update({
        where: { id: creation.id },
        data: { status: "completed", imageUrl },
      });
      // "🎬 Your video is ready" push — fanout to all Studio-origin
      // subscriptions for this user. Same fire-and-forget pattern;
      // we don't block the webhook ACK on the push send.
      sendCreationReadyPush(creation.userId, creation).catch((e) =>
        console.warn("[MUAPI_WEBHOOK] push failed (ready):", e?.message)
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[MUAPI_WEBHOOK_ERROR]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
