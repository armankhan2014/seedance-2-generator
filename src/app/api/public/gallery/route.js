import { NextResponse } from "next/server";
import { getCachedPublicGallery } from "@/lib/cache";

// Revalidate every 60 seconds via ISR instead of hitting DB on every request
export const revalidate = 60;

export async function GET() {
  try {
    const videos = await getCachedPublicGallery();
    return NextResponse.json({ videos });
  } catch (err) {
    return NextResponse.json({ videos: [] });
  }
}
