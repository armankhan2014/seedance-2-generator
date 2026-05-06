import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";

const ADMIN_EMAIL = "armankhan0826@gmail.com";

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { email, verified } = body || {};
  if (typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }
  if (typeof verified !== "boolean") {
    return NextResponse.json({ error: "Missing 'verified' boolean" }, { status: 400 });
  }

  try {
    const updated = await prisma.user.update({
      where: { email: email.trim().toLowerCase() },
      data: { verified },
      select: { id: true, email: true, verified: true },
    });
    revalidateTag(`user-${updated.id}`);
    return NextResponse.json({ success: true, user: updated });
  } catch (err) {
    if (err.code === "P2025") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("[VERIFY_USER]", err.message);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
