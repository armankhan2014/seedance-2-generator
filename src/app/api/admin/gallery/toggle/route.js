import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";

const ADMIN_EMAIL = "armankhan0826@gmail.com";

export async function POST(request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, featured } = await request.json();
  if (!id || typeof featured !== "boolean") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await prisma.creation.update({
    where: { id },
    data: { featured },
  });

  revalidateTag("public-gallery");
  revalidateTag("admin-gallery");

  return NextResponse.json({ success: true, id, featured });
}
