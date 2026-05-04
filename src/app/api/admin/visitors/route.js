import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_EMAIL = "armankhan0826@gmail.com";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "50");

  const visits = await prisma.visit.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const total = await prisma.visit.count();
  const uniqueIPs = await prisma.visit.groupBy({ by: ["ip"], _count: true });

  return NextResponse.json({ visits, total, uniqueIPs: uniqueIPs.length });
}
