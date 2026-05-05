import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
    const secretsMatch = crypto.timingSafeEqual(
      Buffer.from(webhookSecret),
      Buffer.from(expectedSecret)
    );
    if (!secretsMatch) {
      console.warn("[MUAPI_WEBHOOK] Rejected — invalid or missing webhook secret");
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
      await prisma.creation.update({
        where: { id: creation.id },
        data: { status: "failed", error: data.error },
      });
    } else {
      await prisma.creation.update({
        where: { id: creation.id },
        data: { status: "completed", imageUrl },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[MUAPI_WEBHOOK_ERROR]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
