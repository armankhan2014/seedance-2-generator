import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Force this route to always fetch fresh data — never serve a cached response
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
        // emailVerified is set by NextAuth on first Google OAuth sign-in,
        // making it a reliable proxy for join date when createdAt is null.
        emailVerified: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Resolve the best available join date.
    // - createdAt: present if the field was added to the schema with a default
    // - emailVerified: always set by NextAuth on first Google sign-in, reliable fallback
    // Explicitly convert to ISO string so JSON serialization is never ambiguous.
    const joinDate =
      user.createdAt ?? user.emailVerified ?? null;

    return NextResponse.json(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        credits: user.credits,
        createdAt: joinDate ? joinDate.toISOString() : null,
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
