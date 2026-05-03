import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("secret") !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const email = searchParams.get("email") || "armankhan0826@gmail.com";
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, credits: true, name: true },
  });
  return NextResponse.json(user || { error: "User not found" });
}
