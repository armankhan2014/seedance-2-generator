import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";

const ADMIN_EMAIL = "armankhan0826@gmail.com";

export async function POST(req) {
  // Session-based: must be logged in as owner — no secret in URL
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email, credits } = await req.json();
  if (!email || !credits || parseInt(credits) <= 0) {
    return NextResponse.json({ error: "email and credits required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const amount = parseInt(credits);
  const [, updated] = await prisma.$transaction([
    prisma.creditTransaction.create({
      data: { userId: user.id, delta: amount, reason: "admin_grant", note: `granted by ${session.user.email}` },
    }),
    prisma.user.update({
      where: { email },
      data: { credits: { increment: amount } },
    }),
  ]);

  revalidateTag(`user-${user.id}`);
  return NextResponse.json({ success: true, email, creditsAdded: amount, newTotal: updated.credits });
}
