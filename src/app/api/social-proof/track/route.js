/**
 * POST /api/social-proof/track
 *
 * Body: { userId: string }
 *
 * Fired by the popup client AFTER a popup has actually been shown
 * (not just queued). Inserts the (visitorIp, userId) row in the
 * SocialProofShown table; UNIQUE index makes the write idempotent.
 *
 * Designed for navigator.sendBeacon — never blocks, never returns
 * meaningful data, never causes the client to retry.
 */

import { NextResponse } from "next/server";
import { getVisitorIp, trackShown } from "@/lib/social-proof";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req) {
  try {
    let body;
    try { body = await req.json(); }
    catch { return NextResponse.json({ ok: false }); }
    const userId = String(body?.userId || "").trim();
    if (!userId) return NextResponse.json({ ok: false });

    const ip = await getVisitorIp();
    await trackShown({ ip, userId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/social-proof/track] error:", err);
    return NextResponse.json({ ok: false });
  }
}
