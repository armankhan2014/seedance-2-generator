import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const OWNER_EMAIL = "armankhan0826@gmail.com";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (session.user.email !== OWNER_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.user.update({
    where: { email: OWNER_EMAIL },
    data: { verified: true },
  });

  return NextResponse.json({
    success: true,
    message: "✅ Verified badge enabled for " + OWNER_EMAIL,
  });
}
