import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { UserService } from "@/lib/services/user";

// One-shot expansion endpoint for the in-textarea "✦ Expand my idea"
// button on /generate. Takes a SHORT (1–29 word) user idea + the
// currently-selected video duration and returns a 3–6 sentence
// cinematic prompt.
//
// Distinct from /api/prompt/build:
//   • /build  → big PromptBuilder modal, returns the full Gold-Standard
//               multi-section prompt (CHARACTER/ENVIRONMENT/timestamps/etc).
//   • /expand → inline textarea companion, returns a tight 3–6 sentence
//               prompt the user can read in place and edit before
//               generating.
//
// Both cost 1 credit and follow the same debit-before-call → refund-
// on-failure pattern so a single credit can't loop a paid API call.

const EXPAND_COST = 1;
const MAX_DESCRIPTION_LEN = 600; // tighter than /build — this is for short ideas
const ALLOWED_DURATIONS = new Set([5, 10, 15]);

const SYSTEM_TEMPLATE = `You are a cinematic video prompt writer for Seedance v2.0, an AI text-to-video engine.

The user gives you a short idea. Turn it into a detailed, vivid video prompt.

Rules:
- Write 3 to 6 sentences
- Describe the scene, character(s), movement, camera angle, lighting, and mood
- Stay true to the user's original idea — do not change the story
- Write in present tense, cinematic style
- Do NOT add scene numbers, labels, or explanations
- Output ONLY the final prompt — nothing else

Duration is {DURATION} seconds:
- 5 seconds  → one tight moment, one clear action
- 10 seconds → short scene with a start and end
- 15 seconds → full mini-scene with movement, multiple actions, rich environment`;

export async function POST(req) {
  try {
    // ── Auth check ──────────────────────────────────────────────────────────
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Sign in to expand your prompt." },
        { status: 401 }
      );
    }

    // ── Input ────────────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const duration = ALLOWED_DURATIONS.has(Number(body.duration)) ? Number(body.duration) : 5;

    if (!description) {
      return NextResponse.json({ error: "No description provided." }, { status: 400 });
    }
    if (description.length > MAX_DESCRIPTION_LEN) {
      return NextResponse.json(
        { error: `Description is too long (max ${MAX_DESCRIPTION_LEN} characters).` },
        { status: 400 }
      );
    }

    // ── API key check ────────────────────────────────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI service not configured." }, { status: 500 });
    }

    // ── Debit BEFORE the Anthropic call ──────────────────────────────────────
    // Refunds on infrastructure failure below. Same pattern as the
    // existing /api/prompt/build route — without this guard, a user
    // with 1 credit could hammer Claude indefinitely.
    try {
      await UserService.deductCredits(session.user.id, EXPAND_COST);
    } catch (e) {
      if (e.message === "Insufficient credits") {
        return NextResponse.json(
          {
            error: "You need credits to expand prompts. Buy credits to unlock.",
            upgradeRequired: true,
          },
          { status: 403 }
        );
      }
      throw e;
    }

    // ── Claude call ──────────────────────────────────────────────────────────
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
          // 3–6 sentence target — 800 tokens leaves headroom without
          // over-paying for the long descriptive Gold-Standard format
          // that /build returns.
          max_tokens: 800,
          system: SYSTEM_TEMPLATE.replace("{DURATION}", String(duration)),
          messages: [{ role: "user", content: description }],
        }),
      });
      d = await r.json();
    } catch (fetchErr) {
      // Network failure — refund and bail.
      await UserService.addCredits(session.user.id, EXPAND_COST).catch(() => {});
      throw fetchErr;
    }

    if (!r.ok) {
      console.error("Anthropic API error (expand):", JSON.stringify(d));
      await UserService.addCredits(session.user.id, EXPAND_COST).catch(() => {});
      return NextResponse.json(
        { error: `AI error: ${d.error?.message || "Unknown error."}` },
        { status: 500 }
      );
    }

    const prompt = d.content?.[0]?.text?.trim();
    if (!prompt) {
      await UserService.addCredits(session.user.id, EXPAND_COST).catch(() => {});
      return NextResponse.json(
        { error: "AI returned empty response. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ prompt });
  } catch (err) {
    console.error("Route error (expand):", err);
    return NextResponse.json(
      { error: "Failed to expand prompt: " + err.message },
      { status: 500 }
    );
  }
}
