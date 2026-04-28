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

    // ~150KB limit (base64 overhead is ~33%, so 150KB base64 ≈ 112KB original)
    if (image.length > 200000) {
      return NextResponse.json({ error: "Image too large — try a smaller file." }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { email: session.user.email },
      data: { image },
      select: { image: true },
    });

    // Verify the save actually worked and the full image was persisted
    const verify = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { image: true },
    });

    if (!verify?.image?.startsWith("data:image/")) {
      // DB didn't save the base64 (likely a column type issue — fallback message)
      return NextResponse.json(
        { error: "Image saved but not persisted — contact support." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, image: verify.image },
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
