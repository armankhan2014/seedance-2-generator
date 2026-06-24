import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// One-shot admin endpoint that tops up every existing user with fewer
// than 100 credits to 100. Idempotent — re-running after the first
// pass is a no-op because the WHERE clause filters out anyone already
// at or above the new floor. Paying users with > 100 credits are
// untouched, so no one ever loses balance.
//
// Auth: same REVIEWER_TOKEN env var that gates /api/auth/reviewer.
// No new secret to manage. Once you've run it once you can delete
// this file (or leave it — re-runs are harmless).
//
// Usage:
//   GET /api/admin/bump-credits?token=<REVIEWER_TOKEN>
//
// Response (200): { updated: <count>, alreadyAt100OrMore: <count> }
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NEW_FLOOR = 100;

export async function GET(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const expected = process.env.REVIEWER_TOKEN || "";

  if (!expected) {
    return NextResponse.json({ error: "Admin endpoint not configured." }, { status: 503 });
  }
  if (!constantTimeEqual(token, expected)) {
    return NextResponse.json({ error: "Invalid token." }, { status: 403 });
  }

  const before = await prisma.user.count({ where: { credits: { lt: NEW_FLOOR } } });
  const alreadyAt = await prisma.user.count({ where: { credits: { gte: NEW_FLOOR } } });

  const result = await prisma.user.updateMany({
    where: { credits: { lt: NEW_FLOOR } },
    data: { credits: NEW_FLOOR },
  });

  return NextResponse.json({
    eligible_before_run: before,
    updated: result.count,
    already_at_floor_or_above: alreadyAt,
    new_floor: NEW_FLOOR,
  });
}

function constantTimeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
