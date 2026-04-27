import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req) {
  try {
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
