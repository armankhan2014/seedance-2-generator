import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import MusicEmbed from "./MusicEmbed";

// Public, unauthenticated track page. The route ID is a CUID — random
// enough that listing is functionally infeasible — so users opt into
// public sharing by simply sharing the URL. Tracks with status !==
// "completed" are 404'd so half-rendered jobs can't leak.
//
// OG metadata is set per-track so shares to community, WhatsApp,
// Twitter etc. render with the track title + creator + duration as
// a rich preview card.

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadTrack(id) {
  try {
    return await prisma.musicTrack.findFirst({
      where: { id, status: "completed", deletedAt: null },
      select: {
        id: true,
        title: true,
        prompt: true,
        genre: true,
        mood: true,
        durationReq: true,
        actualDuration: true,
        isVocal: true,
        streamUrl: true,
        audioUrl: true,
        r2Url: true,
        imageUrl: true,
        createdAt: true,
        user: { select: { name: true, image: true } },
      },
    });
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const track = await loadTrack(id);
  if (!track) {
    return { title: "Track not found" };
  }
  const creator = track.user?.name || "a Seedance filmmaker";
  const tags = [track.genre, track.mood].filter(Boolean).join(" · ");
  const title = `${track.title} — by ${creator}`;
  const description = tags
    ? `${tags} · ${formatTime(track.actualDuration || track.durationReq)} · AI-generated soundtrack on Seedance Studio.`
    : `AI-generated soundtrack by ${creator} on Seedance Studio.`;
  // The first non-null of r2Url → audioUrl → streamUrl is what the
  // embed will play. We set og:audio so social previews can show the
  // play button inline (Twitter / Facebook / WhatsApp respect this).
  const audio = track.r2Url || track.audioUrl || track.streamUrl;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "music.song",
      audio: audio ? [{ url: audio, type: "audio/mpeg" }] : undefined,
      siteName: "Seedance Studio",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function PublicTrackPage({ params }) {
  const { id } = await params;
  const track = await loadTrack(id);
  if (!track) notFound();
  // Shape for the client component — convert dates and pick the
  // playable source (R2 first → Suno final → Suno preview stream).
  const shaped = {
    id: track.id,
    title: track.title,
    prompt: track.prompt,
    genre: track.genre,
    mood: track.mood,
    duration: track.actualDuration || track.durationReq,
    isVocal: track.isVocal,
    src: track.r2Url || track.audioUrl || track.streamUrl || null,
    imageUrl: track.imageUrl || null,
    creator: track.user?.name || "Filmmaker",
    creatorImage: track.user?.image || null,
    createdAt: track.createdAt.toISOString(),
  };
  return <MusicEmbed track={shaped} />;
}

function formatTime(s) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}
