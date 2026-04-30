import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const ADMIN_EMAIL = "armankhan0826@gmail.com";

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Featured column not yet in DB — return success placeholder
  const { id, featured } = await request.json();
  return NextResponse.json({ success: true, id, featured });
}
