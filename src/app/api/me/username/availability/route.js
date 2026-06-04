/**
 * GET /api/me/username/availability?username=foo
 *
 * Real-time check the Edit-drawer field calls on every (debounced)
 * keystroke. Returns:
 *
 *   { available: true }                                            // free to take
 *   { available: false, reason: "format",   message: "..." }       // failed format check
 *   { available: false, reason: "reserved", message: "..." }       // reserved word
 *   { available: false, reason: "taken",    message: "..." }       // someone else owns it
 *   { available: true,  current: true }                            // it's already your handle
 *
 * Reasons are stable strings so the client can branch on them.
 * Messages are human-readable.
 *
 * Cheap: a single indexed lookup (LOWER(username) UNIQUE INDEX) plus
 * the format checks. Safe to call on every keystroke as long as the
 * client debounces ~400 ms.
 *
 * Auth required so we can answer "is this YOUR current handle?"
 * (which surfaces a different UI state than "free to claim").
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { formatProblem } from "@/lib/username";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const raw = (url.searchParams.get("username") || "").trim().toLowerCase();

    const problem = formatProblem(raw);
    if (problem) {
      return NextResponse.json({ available: false, ...problem });
    }

    // Case-insensitive lookup. Hits the LOWER(username) functional
    // unique index we created in the migration.
    const owner = await prisma.user.findFirst({
      where:  { username: { equals: raw, mode: "insensitive" } },
      select: { id: true, email: true },
    });

    if (!owner) {
      return NextResponse.json({ available: true });
    }
    // Owner found — is it the requesting user themselves?
    if (owner.email && owner.email.toLowerCase() === session.user.email.toLowerCase()) {
      return NextResponse.json({ available: true, current: true });
    }
    return NextResponse.json({
      available: false,
      reason:    "taken",
      message:   "Someone else has this handle.",
    });
  } catch (err) {
    console.error("[/api/me/username/availability] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
