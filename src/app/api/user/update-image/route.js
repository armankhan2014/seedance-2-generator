import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Force dynamic — never cache writes
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { image } = body;

    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    if (!image.startsWith("data:image/")) {
      return NextResponse.json({ error: "Invalid image format" }, { status: 400 });
    }

    // ~375KB limit (base64 overhead ~33%, so 500KB base64 ≈ 375KB original)
    if (image.length > 500000) {
      return NextResponse.json({ error: "Image too large — try a smaller file." }, { status: 400 });
    }

    console.log("[UPDATE-IMAGE] Saving image, length:", image.length, "for:", session.user.email);

    await prisma.user.update({
      where: { email: session.user.email },
      data: { image },
    });

    console.log("[UPDATE-IMAGE] Save successful for:", session.user.email);

    // Return the image we just saved — no need to re-read from DB
    return NextResponse.json(
      { ok: true, image },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err) {
    console.error("[UPDATE-IMAGE] Error:", err.message);
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
