/**
 * POST /api/social-link/click
 *
 * Phase 3c.5 — outbound click tracking. The /profile and /u/[handle]
 * pages call this with a `linkId` when the user clicks a social chip.
 * Body: { linkId: string }
 *
 * Why a POST instead of redirect-through:
 *   • Keeps the chip's <a href> the canonical destination URL, so
 *     middle-click / open-in-new-tab still work, browsers can
 *     prefetch, SEO sees the real link, and there's no redirect
 *     delay on the outbound nav.
 *   • The click is fire-and-forget via navigator.sendBeacon on the
 *     client, so users never wait for it to complete.
 *
 * Trade-off vs. redirect-through: clicks open in a new tab still
 * fire on Cmd+click but NOT on middle-click (no JS runs). That's
 * an acceptable miss for a profile analytics signal.
 *
 * Privacy: we never store referer or any per-click metadata. Just
 * an aggregate counter on UserSocialLink.clicks. No IP, no user-
 * agent, no timestamp series.
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req) {
  try {
    let body;
    try { body = await req.json(); }
    catch { return NextResponse.json({ ok: false, error: "bad body" }, { status: 400 }); }

    const linkId = String(body?.linkId || "").trim();
    if (!linkId) return NextResponse.json({ ok: false, error: "missing linkId" }, { status: 400 });

    // Single indexed UPDATE — won't block any other path even if
    // a celebrity's link gets thousands of clicks per minute.
    // Postgres atomic increment, no read-modify-write race.
    await prisma.userSocialLink.update({
      where: { id: linkId },
      data:  { clicks: { increment: 1 } },
    }).catch(() => { /* link deleted; silently drop */ });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/social-link/click] error:", err);
    return NextResponse.json({ ok: false, error: "server error" }, { status: 500 });
  }
}
