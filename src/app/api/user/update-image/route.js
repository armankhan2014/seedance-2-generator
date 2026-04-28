import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { image } = await req.json();

  if (!image || !image.startsWith("data:image/")) {
    return NextResponse.json({ error: "Invalid image format" }, { status: 400 });
  }

  // ~200KB limit after client compression (400x400 JPEG ~20-50KB base64)
  if (image.length > 300000) {
    return NextResponse.json({ error: "Image too large after compression." }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { email: session.user.email },
      data: { image },
      select: { image: true },
    });
    return NextResponse.json({ image: user.image });
  } catch (err) {
    console.error("[UPDATE-IMAGE] Prisma error:", err.message);
    return NextResponse.json({ error: "Database error: " + err.message }, { status: 500 });
  }
}
