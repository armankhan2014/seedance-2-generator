import { NextResponse } from "next/server";

const SYSTEM = `You are a Seedance 2.0 video prompt engineer.
Your job: convert a user's plain-English idea into a single, optimised Seedance video generation prompt.

Rules:
- Output ONLY the prompt, nothing else — no explanation, no quotes, no preamble.
- The prompt should be 1-3 sentences max.
- Be vivid and specific: include subject, action, setting, lighting/mood, camera style, and visual style.
- Use cinematic language: "golden-hour light", "slow cinematic pan", "photorealistic 8K", "35mm film grain", etc.
- If the user's idea is vague, make reasonable creative decisions to fill in the gaps.
- Never add logos, text overlays, or watermarks.`;

export async function POST(req) {
  try {
    const { description } = await req.json();
    if (!description?.trim()) {
      return NextResponse.json({ error: "No description provided." }, { status: 400 });
    }

    // ── Try Anthropic Claude ─────────────────────────────────────────────────
    if (process.env.ANTHROPIC_API_KEY) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          system: SYSTEM,
          messages: [
            { role: "user", content: description.trim() },
          ],
        }),
      });
      const d = await r.json();
      const prompt = d.content?.[0]?.text?.trim();
      if (prompt) return NextResponse.json({ prompt });
    }

    // ── Fallback: smart keyword-based template ───────────────────────────────
    const prompt = buildFallbackPrompt(description.trim());
    return NextResponse.json({ prompt });

  } catch (err) {
    console.error("/api/prompt/build error:", err);
    return NextResponse.json({ error: "Failed to build prompt." }, { status: 500 });
  }
}

function buildFallbackPrompt(desc) {
  const d = desc.toLowerCase();

  const moodMap = [
    [["epic", "dramatic", "powerful", "intense"],   "epic and cinematic atmosphere"],
    [["dark", "mysterious", "shadow", "night"],      "dark, mysterious atmosphere"],
    [["peaceful", "calm", "serene", "gentle"],       "peaceful, serene atmosphere"],
    [["dreamy", "magical", "ethereal", "fantasy"],   "dreamy, ethereal atmosphere"],
    [["romantic", "warm", "sunset", "golden"],       "warm, golden-hour atmosphere"],
  ];
  let mood = "cinematic atmosphere";
  for (const [keys, m] of moodMap) {
    if (keys.some(k => d.includes(k))) { mood = m; break; }
  }

  const styleMap = [
    [["anime", "cartoon", "illustrated"],            "anime style, vibrant colours"],
    [["realistic", "photorealistic", "real"],        "photorealistic, 8K, hyper-detailed"],
    [["vintage", "retro", "old"],                    "vintage 35mm film aesthetic"],
    [["neon", "cyber", "futuristic", "sci-fi"],      "neon cyberpunk aesthetic"],
    [["painting", "art", "impressionist"],           "painterly impressionist style"],
  ];
  let style = "cinematic film look, 35mm grain";
  for (const [keys, s] of styleMap) {
    if (keys.some(k => d.includes(k))) { style = s; break; }
  }

  const camMap = [
    [["close", "face", "portrait"],                 "extreme close-up shot"],
    [["wide", "landscape", "vast", "panorama"],     "sweeping wide establishing shot"],
    [["drone", "aerial", "above", "bird"],          "cinematic drone aerial shot"],
    [["slow", "motion"],                            "slow motion, 240fps"],
  ];
  let camera = "smooth tracking shot";
  for (const [keys, c] of camMap) {
    if (keys.some(k => d.includes(k))) { camera = c; break; }
  }

  const cleanDesc = desc.charAt(0).toUpperCase() + desc.slice(1).replace(/[.!?]+$/, "");
  return `${cleanDesc}, ${camera}, ${mood}, ${style}.`;
}
