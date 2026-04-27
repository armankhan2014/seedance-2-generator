import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
const ARMAN_EMAIL = "armankhan0826@gmail.com";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await prisma.user.findUnique({ where: { email: ARMAN_EMAIL } });
    if (!user) return NextResponse.json({ videos: [] });
    const creations = await prisma.creation.findMany({
      where: { userId: user.id, status: "completed", NOT: [{ imageUrl: null }, { imageUrl: "" }] },
      orderBy: { createdAt: "desc" }, take: 24,
      select: { id: true, imageUrl: true, prompt: true, aspectRatio: true, resolution: true, duration: true, createdAt: true },
    });
    return NextResponse.json({ videos: creations });
  } catch (err) { return NextResponse.json({ videos: [] }); }
}
