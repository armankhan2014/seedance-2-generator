import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("secret") !== "seedance2024") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestId = searchParams.get("id");
  const videoUrl = searchParams.get("url");

  if (!requestId || !videoUrl) {
    return NextResponse.json({ error: "id and url params required" }, { status: 400 });
  }

  const result = await prisma.creation.updateMany({
    where: { requestId },
    data: { status: "completed", imageUrl: videoUrl },
  });

  return NextResponse.json({ updated: result.count, requestId, videoUrl });
}
