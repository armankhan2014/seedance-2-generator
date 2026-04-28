import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { image } = await req.json();

  if (!image || !image.startsWith("data:image/")) {
    return NextResponse.json({ error: "Invalid image format" }, { status: 400 });
  }

  // ~500KB limit (base64 ~700KB string)
  if (image.length > 800000) {
    return NextResponse.json({ error: "Image too large — please use an image under 500KB." }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { email: session.user.email },
    data: { image },
    select: { image: true },
  });

  return NextResponse.json({ image: user.image });
}
