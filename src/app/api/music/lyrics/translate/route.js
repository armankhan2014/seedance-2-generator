// POST /api/music/lyrics/translate
//
// Translate any track's lyrics into another language while preserving
// rhyme + meter so the translation is actually singable to the same
// melody. Built for Arman's Bollywood/Hindi audience: write one Hindi
// song, release it in English + Spanish + Tamil + … for global reach.
//
// Two modes:
//   1. trackId   — caller owns this track; we look up its stored
//                  lyrics and translate them. The translated lyrics
//                  are returned as plain text (not saved to the track
//                  row — the user pastes them into a NEW generation
//                  via the lyrics textarea + the "Add instruments to
//                  my vocals" reference flow if they want to sing it
//                  themselves).
//   2. lyrics    — caller pastes raw lyrics; we translate them.
//                  Useful when the lyrics aren't stored on a track
//                  yet (or come from a third-party source).
//
// Either trackId OR lyrics must be provided. trackId wins if both are
// present.
//
// Cost: 1 credit (same as lyric generation — Claude Haiku is cheap
// enough that flat-rate pricing is comfortable at any common
// length). Same debit-before-call + refund-on-failure pattern as
// /api/music/lyrics/generate.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserService } from "@/lib/services/user";

export const dynamic = "force-dynamic";

const TRANSLATE_COST = 1;
const MAX_LYRICS_LEN = 6000;

// System prompt: hard-anchors Claude on the singability requirement.
// Naive translation gives you semantically-correct lyrics that
// DON'T fit the original melody (different syllable counts, broken
// rhyme schemes). For lyric translation to be useful, the output
// needs to roughly match the syllable count + stress pattern of the
// source line so a singer can sing it to the same tune.
const SYSTEM_PROMPT = `You are a world-class song lyric translator who specializes in SINGABLE translations — translations that preserve rhyme scheme, syllable count, and emotional meaning so the translated lyrics can be sung to the same melody as the original.

## YOUR JOB
Translate a set of lyrics into a target language while keeping the song singable to the original melody.

## RULES
1. Output ONLY the translated lyrics. No preamble, no commentary, no "Here is the translation:" intro.
2. Keep the structural tags (e.g. [Verse 1], [Chorus], [Bridge]) in ENGLISH even when translating into another language — the music engine reads these as structural cues. Translate everything between the tags.
3. Match the syllable count of each line as closely as possible to the original — within ±1 syllable per line. This is the difference between a singable translation and an unsingable one.
4. Preserve the rhyme scheme. If lines 1 and 3 rhyme in the original, lines 1 and 3 of the translation should rhyme too.
5. Preserve emotional tone. A romantic ballad stays romantic; an angry rap stays angry.
6. Write in the target language's native script (Devanagari for Hindi, Hangul for Korean, Arabic script for Arabic, Tamil script for Tamil, etc.) — NOT romanised/transliterated.
7. If a metaphor doesn't translate cleanly, ADAPT it to one that has the same emotional weight in the target culture rather than translating literally. E.g. an English "moon" metaphor might map to a "chand" reference in Hindi (where the moon has deep cultural meaning in love songs).
8. Don't try to translate proper nouns / brand names / iconic phrases — keep them as-is.
9. Match the original lyric's register (poetic vs colloquial). A street-style rap shouldn't become formal verse.

## OUTPUT FORMAT
The same [Section Tag] structure as the input, with the translated lyrics underneath each tag. Nothing else.`;

const ALLOWED_LANGUAGES = [
  "English", "Hindi", "Punjabi", "Tamil", "Telugu", "Bengali", "Marathi", "Gujarati",
  "Urdu", "Spanish", "French", "Portuguese", "Italian", "German", "Dutch", "Russian",
  "Korean", "Japanese", "Mandarin", "Cantonese", "Vietnamese", "Thai", "Indonesian",
  "Arabic", "Turkish", "Persian", "Hebrew", "Swahili", "Yoruba",
];

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const trackId = typeof body?.trackId === "string" ? body.trackId.trim() : "";
  const inlineLyrics = typeof body?.lyrics === "string" ? body.lyrics.trim() : "";
  const targetLanguage = typeof body?.targetLanguage === "string" ? body.targetLanguage.trim() : "";

  if (!targetLanguage) {
    return NextResponse.json({ error: "Pick a target language." }, { status: 400 });
  }
  if (!ALLOWED_LANGUAGES.includes(targetLanguage)) {
    return NextResponse.json(
      { error: `Language "${targetLanguage}" isn't supported yet.` },
      { status: 400 }
    );
  }

  // Resolve the source lyrics: prefer the track's stored lyrics if
  // trackId was supplied AND the caller owns it; fall back to inline
  // lyrics otherwise.
  let sourceLyrics = "";
  if (trackId) {
    const track = await prisma.musicTrack.findFirst({
      where: { id: trackId, userId: session.user.id, deletedAt: null },
      select: { lyrics: true },
    });
    if (!track) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }
    sourceLyrics = (track.lyrics || "").trim();
    if (!sourceLyrics) {
      return NextResponse.json(
        {
          error: "This track has no stored lyrics (auto-generated tracks don't save them server-side yet). Paste lyrics directly instead.",
        },
        { status: 400 }
      );
    }
  } else {
    sourceLyrics = inlineLyrics;
  }
  if (!sourceLyrics) {
    return NextResponse.json(
      { error: "Provide either a trackId or paste lyrics to translate." },
      { status: 400 }
    );
  }
  if (sourceLyrics.length > MAX_LYRICS_LEN) {
    return NextResponse.json(
      { error: `Lyrics are too long (max ${MAX_LYRICS_LEN} characters).` },
      { status: 400 }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Translation service not configured." }, { status: 500 });
  }

  // Debit before the call. Refund on every failure path.
  try {
    await UserService.deductCredits(session.user.id, TRANSLATE_COST);
  } catch (e) {
    if (e.message === "Insufficient credits") {
      return NextResponse.json(
        {
          error: "You need 1 credit to translate lyrics. Top up to unlock.",
          upgradeRequired: true,
        },
        { status: 403 }
      );
    }
    throw e;
  }

  const userPrompt = `Translate these lyrics into ${targetLanguage}. Preserve rhyme scheme + syllable count + emotional tone so the translation is singable to the original melody.

---
${sourceLyrics}
---

Output the translated lyrics in the same [Section Tag] structure. Native script for the target language.`;

  let r, d;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    d = await r.json();
  } catch (fetchErr) {
    await UserService.addCredits(session.user.id, TRANSLATE_COST).catch(() => {});
    console.error("[LYRIC_TRANSLATE] network error:", fetchErr);
    return NextResponse.json(
      { error: "Translation service unreachable. Try again." },
      { status: 502 }
    );
  }

  if (!r.ok) {
    await UserService.addCredits(session.user.id, TRANSLATE_COST).catch(() => {});
    console.error("[LYRIC_TRANSLATE] Anthropic error:", JSON.stringify(d));
    return NextResponse.json(
      { error: `Translation AI error: ${d?.error?.message || "Unknown error."}` },
      { status: 500 }
    );
  }

  const translated = d?.content?.[0]?.text?.trim();
  if (!translated) {
    await UserService.addCredits(session.user.id, TRANSLATE_COST).catch(() => {});
    return NextResponse.json(
      { error: "AI returned no translation. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    targetLanguage,
    translated,
    sourceLength: sourceLyrics.length,
    translatedLength: translated.length,
  });
}
