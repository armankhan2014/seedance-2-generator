import { prisma } from "@/lib/prisma";
import DiscoverClient from "./DiscoverClient";

export const metadata = {
  title: "Discover music — Seedance Studio",
  description:
    "Royalty-free AI-generated tracks shared by Seedance filmmakers. Cinematic, ambient, rock, orchestral, electronic, jazz, folk, mystery.",
};

// Server entry. Fetches the public gallery feed up front so the page
// renders with content already painted (no client-side spinner). The
// client component owns play state + scrolling pagination.

export const dynamic = "force-dynamic";
export const revalidate = 30; // refresh public feed every 30s

async function loadPublicTracks() {
  try {
    const rows = await prisma.musicTrack.findMany({
      where: { public: true, status: "completed", deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        title: true,
        prompt: true,
        genre: true,
        mood: true,
        actualDuration: true,
        durationReq: true,
        isVocal: true,
        r2Url: true,
        audioUrl: true,
        streamUrl: true,
        imageUrl: true,
        plays: true,
        createdAt: true,
        user: { select: { name: true, image: true, verified: true } },
      },
    });
    // Shape so the client doesn't need to negotiate the URL fallback
    // chain (R2 → Suno final → Suno stream).
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      prompt: r.prompt,
      genre: r.genre,
      mood: r.mood,
      duration: r.actualDuration || r.durationReq,
      isVocal: r.isVocal,
      src: r.r2Url || r.audioUrl || r.streamUrl || null,
      plays: r.plays,
      creator: r.user?.name || "Filmmaker",
      creatorImage: r.user?.image || null,
      creatorVerified: !!r.user?.verified,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

export default async function MusicDiscoverPage() {
  const tracks = await loadPublicTracks();
  return <DiscoverClient initialTracks={tracks} />;
}
