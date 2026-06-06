/**
 * GET /api/social-proof/queue
 *
 * Returns the next ~15 popup-shape user rows for the visitor.
 * Excludes every user already shown to this IP (server dedupe).
 * Excludes the signed-in user themselves so they never see their
 * own popup.
 *
 * Client adds another filter step against its localStorage list,
 * so even if the IP layer has a gap (mobile rotation), the device
 * layer catches it.
 *
 * No body — IP comes from request headers, signed-in user comes
 * from session.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getVisitorIp, getPopupQueue } from "@/lib/social-proof";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const [ip, session] = await Promise.all([
      getVisitorIp(),
      getServerSession(authOptions),
    ]);
    const queue = await getPopupQueue({
      ip,
      selfUserId: session?.user?.id || null,
      limit: 15,
    });
    return NextResponse.json({ queue });
  } catch (err) {
    console.error("[/api/social-proof/queue] error:", err);
    return NextResponse.json({ queue: [] });
  }
}
