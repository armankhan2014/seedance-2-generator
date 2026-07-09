import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { AIService } from "@/lib/services/ai";
import { prisma } from "@/lib/prisma";
import config from "@/lib/config";

// Force-check MuAPI for a specific requestId and update DB
export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { requestId } = await req.json();
    if (!requestId) {
      return NextResponse.json({ error: "requestId required" }, { status: 400 });
    }

    const apiKey = config.ai.seedance.apiKey;
    const result = await AIService.pollMuAPI(requestId, apiKey);

    if (!result) {
      return NextResponse.json({ status: "polling_failed", message: "Could not reach MuAPI" });
    }

    const outputs = result?.outputs || result?.output || [];
    const outputArr = Array.isArray(outputs) ? outputs : (outputs ? [outputs] : []);
    const imageUrl = outputArr[0] || null;
    const statusStr = result?.status?.toLowerCase() || "";
    const isCompleted = outputArr.length > 0 || statusStr === "succeeded" || statusStr === "completed";

    if (isCompleted && imageUrl) {
      // Guard on status:"processing" — this route used to blind-write
      // completed over ANY status, which resurrected cron-swept rows
      // without reinstating the charge (Dinesh double-dip, 2026-07-08:
      // cron refunded a stuck job, video landed late, sync flipped it
      // back to completed → user kept refund + video). Late deliveries
      // for swept rows now go through completeLateDelivery, which
      // re-charges as it resurrects.
      const flipped = await prisma.creation.updateMany({
        where: { requestId, userId: session.user.id, status: "processing" },
        data: { status: "completed", imageUrl },
      });
      if (flipped.count === 0) {
        const creation = await prisma.creation.findFirst({
          where: { requestId, userId: session.user.id },
        });
        if (creation?.status === "failed") {
          const revived = await AIService.completeLateDelivery(creation, imageUrl);
          if (!revived) {
            // Real failure (content policy etc.) — don't overwrite it.
            return NextResponse.json({
              status: "failed",
              error: creation.error || "Generation failed.",
              raw: result,
            });
          }
        }
      }
      return NextResponse.json({ status: "completed", imageUrl, raw: result });
    }

    return NextResponse.json({ status: "processing", raw: result });
  } catch (error) {
    console.error("[SYNC_ERROR]", error);
    return NextResponse.json({ error: error.message, status: "error" }, { status: 500 });
  }
}
