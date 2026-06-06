/**
 * POST /api/social-proof/click
 *
 * Body: { userId }
 *
 * Fired when a visitor clicks a popup (sendBeacon, fire-and-forget).
 * Marks the matching SocialProofShown row as clicked=true so the
 * admin dashboard can compute CTR.
 */

import { NextResponse } from "next/server";
import { getVisitorIp, markClicked } from "@/lib/social-proof";

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
    await markClicked({ ip, userId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/social-proof/click] error:", err);
    return NextResponse.json({ ok: false });
  }
}
