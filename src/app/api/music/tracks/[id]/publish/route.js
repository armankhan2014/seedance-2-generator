// POST /api/music/tracks/[id]/publish    — flip the track public
// DELETE /api/music/tracks/[id]/publish  — unflip (remove from gallery)
//
// Idempotent: posting when already public is a no-op + 200; deleting
// when already private is also a no-op + 200. Caller scoped to
// session.user.id so you can only publish your OWN tracks.
//
// The /m/[id] permalink stays accessible to anyone with the URL
// regardless of this flag — `public` only controls whether the track
// is LISTED on /music/discover. Sharing via the share button is
// independent of publishing.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function setPublic(req, { params }, value) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  // Only the owner can flip — updateMany is the cheapest CAS that
  // also returns count=0 when the row isn't theirs or isn't
  // completed (you can't publish a half-rendered or failed track).
  const result = await prisma.musicTrack.updateMany({
    where: { id, userId: session.user.id, status: "completed", deletedAt: null },
    data: { public: value },
  });
  if (result.count !== 1) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, public: value });
}

export async function POST(req, ctx)   { return setPublic(req, ctx, true);  }
export async function DELETE(req, ctx) { return setPublic(req, ctx, false); }
