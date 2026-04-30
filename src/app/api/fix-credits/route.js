import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const secret  = searchParams.get("secret");
  const email   = searchParams.get("email");
  const credits = parseInt(searchParams.get("credits") || "3000");

  if (secret !== "seedance2024") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updated = await prisma.user.update({
      where: { email },
      data: { credits: { increment: credits } },
    });

    // ── Bust the cache for this user so next request gets fresh data ──
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
