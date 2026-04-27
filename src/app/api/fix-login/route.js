import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("secret") !== "seedance2024fix99") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const email = searchParams.get("email");
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email }, include: { accounts: true } });
  if (!user) return NextResponse.json({ found: false });

  await prisma.account.deleteMany({ where: { userId: user.id } });
  await prisma.session.deleteMany({ where: { userId: user.id } });

  return NextResponse.json({ success: true, creditsPreserved: user.credits, accountsRemoved: user.accounts.length });
}
