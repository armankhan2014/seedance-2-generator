import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { AIService } from "@/lib/services/ai";
import { prisma } from "@/lib/prisma";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { mode, prompt, aspect_ratio, resolution, duration, quality, model, images_list, musicTrackId: rawMusicTrackId } = body;

    // Phase 3 — soundtrack pairing. Verify the caller actually owns
    // the music track they're trying to attach (and that it's a
    // completed track, not a half-rendered or failed one). Anything
    // off falls through with musicTrackId=null instead of erroring,
    // so a stale ?soundtrack=… query param doesn't block generation.
    let musicTrackId = null;
    if (typeof rawMusicTrackId === "string" && rawMusicTrackId) {
      try {
        const t = await prisma.musicTrack.findFirst({
          where: { id: rawMusicTrackId, userId: session.user.id, status: "completed", deletedAt: null },
          select: { id: true },
        });
        if (t) musicTrackId = t.id;
      } catch (e) {
        console.warn("[AI_SEEDANCE] music ownership check failed:", e?.message);
      }
    }

    if (!prompt && mode === 'text-to-video') {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Cap prompt length so abusers can't spam huge payloads at MuAPI
    // on our dime. UI advertises a 20,000-word budget in the
    // character counter (GenerateClient.jsx) — server enforces the
    // same limit by word count using the identical split logic, plus
    // a hard char ceiling that catches single-token abuse (one
    // 50 MB string with no whitespace = 1 "word" but huge payload).
    const MAX_PROMPT_WORDS = 20_000;
    const MAX_PROMPT_CHARS = 200_000; // ~20K typical English words + headroom
    if (typeof prompt === "string") {
      if (prompt.length > MAX_PROMPT_CHARS) {
        return NextResponse.json(
          { error: `Prompt is too long (max ${MAX_PROMPT_WORDS.toLocaleString()} words).` },
          { status: 400 }
        );
      }
      const words = prompt.trim().split(/\s+/).filter(Boolean).length;
      if (words > MAX_PROMPT_WORDS) {
        return NextResponse.json(
          { error: `Prompt is too long (max ${MAX_PROMPT_WORDS.toLocaleString()} words).` },
          { status: 400 }
        );
      }
    }

    let result;
    if (mode === "reference-to-video") {
      result = await AIService.edit(session.user.id, {
        mode, prompt, images_list, aspect_ratio, resolution, duration, quality, model, musicTrackId
      });
    } else {
      result = await AIService.generate(session.user.id, {
        mode, prompt, aspect_ratio, resolution, duration, quality, model, images_list, musicTrackId
      });
    }

    return NextResponse.json({
      ...result,
      metadata: { prompt, aspect_ratio, resolution }
    });
  } catch (error) {
    if (error.message === "Insufficient credits") {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 403 });
    }
    console.error("[AI_SEEDANCE]", error);
    return NextResponse.json({ error: error.message || "Internal Error" }, { status: 500 });
  }
}
