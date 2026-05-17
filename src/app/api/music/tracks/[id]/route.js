// GET /api/music/tracks/[id]
//
// Single-track read endpoint. The /music page polls this every ~3s
// after firing a generation so the user gets near-real-time status
// updates (status: processing → streamUrl available → completed)
// without needing a websocket.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const track = await prisma.musicTrack.findFirst({
    where: { id, userId: session.user.id, deletedAt: null },
    select: {
      id: true,
      title: true,
      genre: true,
      mood: true,
      durationReq: true,
      actualDuration: true,
      isVocal: true,
      status: true,
      error: true,
      streamUrl: true,
      audioUrl: true,
      imageUrl: true,
      r2Url: true,
      credits: true,
      plays: true,
      // Stem-split state — surfaced so the client polling loop can
      // flip the UI from "Splitting…" to download chips when the
      // upstream callback lands.
      stemStatus: true,
      vocalUrl: true,
      instrumentalUrl: true,
      stemError: true,
      createdAt: true,
    },
  });
  if (!track) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, track });
}
