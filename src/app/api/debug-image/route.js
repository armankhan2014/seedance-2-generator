import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = { timestamp: new Date().toISOString(), steps: [] };

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      result.steps.push({ step: "session", ok: false, error: "No session — user not logged in" });
      return NextResponse.json(result);
    }
    result.steps.push({ step: "session", ok: true, email: session.user.email });

    try {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, credits: true },
      });
      result.steps.push({ step: "db_read", ok: !!user, userId: user?.id, credits: user?.credits });

      try {
        const tiny = "data:image/png;base64,PING_" + Date.now();
        const prev = (await prisma.user.findUnique({ where: { email: session.user.email }, select: { image: true } }))?.image;
        await prisma.user.update({ where: { email: session.user.email }, data: { image: tiny } });
        await prisma.user.update({ where: { email: session.user.email }, data: { image: prev } });
        result.steps.push({ step: "db_write", ok: true });
      } catch (e) {
        result.steps.push({ step: "db_write", ok: false, error: e.message });
      }
    } catch (e) {
      result.steps.push({ step: "db_read", ok: false, error: e.message });
    }
  } catch (e) {
    result.steps.push({ step: "session", ok: false, error: e.message });
  }

  result.overall = result.steps.every(s => s.ok) ? "ALL OK" : "ISSUE FOUND";
  return NextResponse.json(result);
}
