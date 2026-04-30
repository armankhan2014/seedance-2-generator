import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getCachedUserCredits } from "@/lib/cache";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getCachedUserCredits(session.user.id);
  return NextResponse.json({ credits: user?.credits ?? 0 });
}
