import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Force this route to always fetch fresh data — never serve a cached response
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Mirrors AIService.getCreditCost — kept in sync with src/lib/services/ai.js
function getCreditCost(mode, duration, quality, resolution) {
  const isReference = mode === "reference-to-video";
  const is1080p = resolution === "1080p";
  const is720p = resolution === "720p";
  let rate;
  if (isReference) {
    if (is1080p) rate = quality === "high" ? 80 : 56;
    else if (is720p) rate = quality === "high" ? 60 : 42;
    else rate = quality === "high" ? 48 : 36;
  } else {
    if (is1080p) rate = quality === "high" ? 70 : 45;
    else if (is720p) rate = quality === "high" ? 50 : 30;
    else rate = quality === "high" ? 30 : 24;
  }
  return Math.ceil((duration || 5) * rate);
}

// Infer generation mode from stored creation fields
function inferMode(creation) {
  if (creation.videoFiles?.length > 0 || creation.audioFiles?.length > 0) return "reference-to-video";
  if (creation.inputImages?.length > 0) return "image-to-video";
  return "text-to-video";
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        credits: true,
        createdAt: true,
        // emailVerified is always set by NextAuth on first Google sign-in —
        // used as a reliable join-date fallback when createdAt is null.
        emailVerified: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch only the fields needed to compute stats — no heavy data
    const creations = await prisma.creation.findMany({
      where: { userId: user.id },
      select: {
        status: true,
        duration: true,
        quality: true,
        resolution: true,
        videoFiles: true,
        audioFiles: true,
        inputImages: true,
      },
    });

    // Videos generated = completed jobs only (user received a video)
    const videosGenerated = creations.filter(c => c.status === "completed").length;

    // Credits spent = sum of cost for every submitted job
    // (credits are deducted at submission time, not on completion)
    const totalCreditsSpent = creations.reduce((sum, c) => {
      const mode = inferMode(c);
      return sum + getCreditCost(mode, c.duration || 5, c.quality || "basic", c.resolution || "720p");
    }, 0);

    // Resolve the best available join date — explicitly toISOString() for safe serialization
    const joinDate = user.createdAt ?? user.emailVerified ?? null;

    return NextResponse.json(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        credits: user.credits,
        createdAt: joinDate ? joinDate.toISOString() : null,
        videosGenerated,
        totalCreditsSpent,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Pragma": "no-cache",
        },
      }
    );
  } catch (err) {
    console.error("[PROFILE] Error:", err.message);
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
