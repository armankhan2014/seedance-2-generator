// POST /api/music/lyrics/generate
//
// One-line song idea → full structured lyrics. Arman flagged 2026-05-16
// that newcomers landing on /music with zero songwriting experience
// shouldn't be locked out of the Pro "Write your own lyrics" workflow.
// This endpoint lets them describe a song in plain language (any
// language — "sad Bollywood film song in Hindi", "Hollywood epic in
// English", "Punjabi wedding banger") and Claude returns a usable
// draft with [Verse 1] / [Pre-Chorus] / [Chorus] / [Verse 2] /
// [Bridge] / [Final Chorus] tags that the music engine treats as
// structural cues.
//
// Cost: 1 credit per generation. Same debit-before-call →
// refund-on-any-failure pattern as /api/prompt/expand so a single
// credit can't be looped indefinitely on a paid Anthropic call.
//
// Output is plain text — NOT JSON — because the music engine's lyrics
// textarea consumes raw structured lyrics directly. Caller drops the
// returned string into the textarea.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { UserService } from "@/lib/services/user";

export const dynamic = "force-dynamic";

const LYRIC_COST = 1;
const MAX_IDEA_LEN = 600;

// System prompt — direct, opinionated, multi-language aware. Claude
// Haiku 4.5 is consistent at outputting structured lyrics if you give
// it a fixed skeleton, so we anchor the format hard.
const SYSTEM_PROMPT = `You are a world-class songwriter who writes hit lyrics across every genre and language — Hindi Bollywood ballads, English Hollywood epics, Punjabi wedding bangers, Spanish reggaeton, Korean K-pop, French chanson — anything. Given a one-line idea from a user with zero songwriting experience, you transform it into a complete, performable song draft.

## YOUR JOB
Output a full set of lyrics following this EXACT structure:

[Verse 1]
(4 lines)

[Pre-Chorus]
(2 lines)

[Chorus]
(4 lines — the hook, should be memorable and singable)

[Verse 2]
(4 lines — develop the story further)

[Pre-Chorus]
(2 lines — same or near-same as before)

[Chorus]
(4 lines — repeat the hook)

[Bridge]
(2-4 lines — emotional turn, key change moment)

[Final Chorus]
(4 lines — final hook, optionally with a slight twist)

## RULES
1. Output ONLY the lyrics. No preamble, no explanation, no "Here are the lyrics:" intro.
2. Keep the structural tags (e.g. [Verse 1], [Chorus]) in ENGLISH even when the lyrics themselves are in another language — the music engine reads these as structural cues.
3. If the user specifies a language (Hindi, Spanish, Punjabi, etc.) write the actual lyrics in that language using its native script (Devanagari for Hindi, Hangul for Korean, etc.). If the language is unclear, default to English.
4. Match the emotional tone of the idea. Sad = melancholic imagery. Triumphant = soaring metaphors. Romantic = intimate details.
5. The CHORUS line should be the strongest — repeatable, anthemic, the one a listener walks away humming.
6. Avoid clichés like "broken heart", "fire burning", "stars above" unless they genuinely fit. Reach for specific, concrete imagery.
7. Lines should feel like they SCAN — roughly even syllable counts within a section so they actually sing.
8. No profanity or explicit content unless the user clearly asks for it.
9. Total length: 20-28 lines of lyrics (excluding the structural tags).`;

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

  const idea = (body?.idea || "").trim();
  const language = (body?.language || "").trim();
  const genre = (body?.genre || "").trim();
  const mood = (body?.mood || "").trim();

  if (!idea) {
    return NextResponse.json({ error: "Describe your song idea first." }, { status: 400 });
  }
  if (idea.length > MAX_IDEA_LEN) {
    return NextResponse.json(
      { error: `Idea is too long (max ${MAX_IDEA_LEN} characters).` },
      { status: 400 }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Lyric service not configured." }, { status: 500 });
  }

  // Debit before the Claude call. Refund on every downstream failure
  // path below — see /api/prompt/expand for the parent pattern.
  try {
    await UserService.deductCredits(session.user.id, LYRIC_COST);
  } catch (e) {
    if (e.message === "Insufficient credits") {
      return NextResponse.json(
        {
          error: "You need 1 credit to write lyrics. Top up to unlock.",
          upgradeRequired: true,
        },
        { status: 403 }
      );
    }
    throw e;
  }

  // Compose the user message. We collapse the idea + optional
  // language / genre / mood hints into a single instruction block so
  // Claude has all the context it needs in one pass.
  const hintLines = [];
  if (language) hintLines.push(`Language: ${language}`);
  if (genre) hintLines.push(`Genre: ${genre}`);
  if (mood) hintLines.push(`Mood: ${mood}`);
  const userPrompt = hintLines.length
    ? `Song idea: ${idea}\n\n${hintLines.join("\n")}\n\nWrite the full lyrics now.`
    : `Song idea: ${idea}\n\nWrite the full lyrics now.`;

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
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    d = await r.json();
  } catch (fetchErr) {
    await UserService.addCredits(session.user.id, LYRIC_COST).catch(() => {});
    console.error("[MUSIC_LYRICS] network error:", fetchErr);
    return NextResponse.json(
      { error: "Lyric service unreachable. Try again." },
      { status: 502 }
    );
  }

  if (!r.ok) {
    await UserService.addCredits(session.user.id, LYRIC_COST).catch(() => {});
    console.error("[MUSIC_LYRICS] Anthropic error:", JSON.stringify(d));
    return NextResponse.json(
      { error: `Lyric AI error: ${d?.error?.message || "Unknown error."}` },
      { status: 500 }
    );
  }

  const lyrics = d?.content?.[0]?.text?.trim();
  if (!lyrics) {
    await UserService.addCredits(session.user.id, LYRIC_COST).catch(() => {});
    return NextResponse.json(
      { error: "AI returned no lyrics. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, lyrics });
}
