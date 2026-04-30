import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_EMAIL = "armankhan0826@gmail.com";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const owner = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    if (!owner) return NextResponse.json({ videos: [] });
    const videos = await prisma.creation.findMany({
      where: { userId: owner.id, status: "completed", NOT: [{ imageUrl: null }, { imageUrl: "" }] },
      orderBy: { createdAt: "desc" },
      take: 48,
      select: { id: true, imageUrl: true, prompt: true, aspectRatio: true, resolution: true, duration: true, createdAt: true, featured: true },
    });
    return NextResponse.json({ videos });
  } catch (err) {
    return NextResponse.json({ videos: [] });
  }
}
