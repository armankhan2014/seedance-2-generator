import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";

// Simple in-memory rate limiter — max 10 requests per minute per IP
const rateLimitMap = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const max = 10;
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > windowMs) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return false;
  }
  if (entry.count >= max) return true;
  entry.count++;
  rateLimitMap.set(ip, entry);
  return false;
}

export async function GET(request) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const secret  = searchParams.get("secret");
  const email   = searchParams.get("email");
  const credits = parseInt(searchParams.get("credits") || "0");

  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }
  if (credits <= 0 || credits > 100000) {
    return NextResponse.json({ error: "Credits must be between 1 and 100,000" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const updated = await prisma.user.update({
      where: { email },
      data: { credits: { increment: credits } },
    });

    revalidateTag(`user-${user.id}`);
    revalidateTag("credits");

    return NextResponse.json({
      success: true,
      email: updated.email,
      creditsAdded: credits,
      newTotal: updated.credits,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
