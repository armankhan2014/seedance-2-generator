import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAdminGalleryAll } from "@/lib/cache";

const ADMIN_EMAIL = "armankhan0826@gmail.com";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const videos = await getAdminGalleryAll();
    return NextResponse.json({ videos });
  } catch (err) {
    return NextResponse.json({ videos: [] });
  }
}
