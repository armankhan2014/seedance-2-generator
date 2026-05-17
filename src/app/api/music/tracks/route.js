// GET    /api/music/tracks         — list the viewer's tracks
// DELETE /api/music/tracks?id=...  — soft-delete a track (30-day trash)
//
// Both endpoints are scoped to session.user.id so a leaked taskId
// from someone else's account can't be probed or deleted.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }
  try {
    const tracks = await prisma.musicTrack.findMany({
      where: { userId: session.user.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        taskId: true,
        title: true,
        prompt: true,
        genre: true,
        mood: true,
        durationReq: true,
        actualDuration: true,
        isVocal: true,
        // BPM — surfaced on each card so pro users see tempo at
        // a glance for DAW sync.
        tempo: true,
        model: true,
        status: true,
        error: true,
        streamUrl: true,
        audioUrl: true,
        imageUrl: true,
        r2Url: true,
        credits: true,
        plays: true,
        public: true,
        // Stem-split state — surfaced on each card so the UI can
        // show "Split stems" CTA / "Splitting…" indicator / vocal +
        // instrumental download chips depending on stemStatus.
        stemStatus: true,
        stemMode: true,
        vocalUrl: true,
        instrumentalUrl: true,
        // 12-stem Pro split URLs — populated only when stemMode="split".
        // Surfaced so the library card can show all download chips
        // when Pro split is done.
        backingVocalsUrl: true,
        drumsUrl: true,
        bassUrl: true,
        guitarUrl: true,
        keyboardUrl: true,
        stringsUrl: true,
        brassUrl: true,
        woodwindsUrl: true,
        percussionUrl: true,
        synthUrl: true,
        fxUrl: true,
        stemError: true,
        // A/B variations: non-null on the 2nd-take row pointing back
        // at the original. UI groups paired rows under one card.
        parentTrackId: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ ok: true, tracks });
  } catch (err) {
    // Table missing → schema not pushed yet. Return empty list so the
    // /music page renders cleanly while the migration is pending.
    if (/Unknown.*MusicTrack|relation.*does not exist/i.test(err?.message || "")) {
      return NextResponse.json({ ok: true, tracks: [], warning: "table_missing" });
    }
    console.error("[MUSIC_TRACKS_GET]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  // Soft-delete only if the row belongs to the caller. updateMany
  // count tells us whether we matched anything — 0 = not yours (or
  // already deleted) → 404.
  const result = await prisma.musicTrack.updateMany({
    where: { id, userId: session.user.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (result.count !== 1) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
