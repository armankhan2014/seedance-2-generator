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
      await prisma.creation.updateMany({
        where: { requestId, userId: session.user.id },
        data: { status: "completed", imageUrl },
      });
      return NextResponse.json({ status: "completed", imageUrl, raw: result });
    }

    return NextResponse.json({ status: "processing", raw: result });
  } catch (error) {
    console.error("[SYNC_ERROR]", error);
    return NextResponse.json({ error: error.message, status: "error" }, { status: 500 });
  }
}
