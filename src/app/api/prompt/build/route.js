import { NextResponse } from "next/server";

const SYSTEM = `You are a world-class Seedance 2.0 cinematic director and prompt engineer. Your job is to transform any user idea — no matter how simple or complex — into a DETAILED, PRODUCTION-READY Seedance video generation prompt that reads like a real film treatment.

## OUTPUT FORMAT — always structure your prompt exactly like this:

**SCENE OVERVIEW**
[1-2 sentences: genre, tone, overall feeling]

**COLOR PALETTE & VISUAL STYLE**
[Exact color palette — dominant tones, accent colors, film stock or render style, lighting quality]

**SETTING**
[Rich environment description — location, time of day, architecture, atmosphere, weather, crowd if any]

**CHARACTER(S)**
[Physical description, exact costume with colors and textures, what makes them visually distinctive]

**SHOT BREAKDOWN**

SHOT 1 (00:00–[timestamp]) — [Title]
• Camera: [exact shot type and movement]
• Speed: [e.g. "80% slow"]
• Action: [exactly what happens — be specific and vivid]
• Key visual: [the most important thing in this shot]

SHOT 2 ([timestamp]–[timestamp]) — [Title]
• Camera: [exact shot type and movement]
• Speed: [speed value]
• Action: [exactly what happens]
• Key visual: [most important visual]

[Continue for all shots covering the full duration]

**SIGNATURE EFFECTS**
[List 3-5 of the most visually striking moments]

## RULES:
- Output ONLY the prompt — no meta-commentary, no "here is your prompt"
- Be SPECIFIC with camera vocabulary: extreme close-up, dolly zoom, whip pan, rack focus, crane shot, steadicam, orbital, push-in, pull-back, handheld, POV, Dutch angle
- Be SPECIFIC with lighting: golden-hour rim light, volumetric god rays, chiaroscuro, practical neon, split lighting, silhouette, blue-hour
- Use exact speed ramp values: 30%, 40%, 60%, 80%, 100%, 120%, 150%
- Make creative decisions — if the user gives a short idea, build a full cinematic world around it
- Every shot needs a camera move, a speed, and a key visual moment
- Always end with a signature closing beat`;

export async function POST(req) {
  try {
    const { description } = await req.json();
    if (!description?.trim()) {
      return NextResponse.json({ error: "No description provided." }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      console.error("ANTHROPIC_API_KEY is not set");
      return NextResponse.json({ error: "AI service not configured. Please contact support." }, { status: 500 });
    }

    console.log("Calling Anthropic API...");

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{ role: "user", content: description.trim() }],
      }),
    });

    const d = await r.json();
    console.log("Anthropic response status:", r.status);
    console.log("Anthropic response type:", d.type);

    if (!r.ok) {
      console.error("Anthropic API error:", JSON.stringify(d));
      return NextResponse.json({ error: `AI error: ${d.error?.message || d.type || "Unknown error"}` }, { status: 500 });
    }

    const prompt = d.content?.[0]?.text?.trim();
    if (!prompt) {
      console.error("No content in response:", JSON.stringify(d));
      return NextResponse.json({ error: "AI returned empty response. Please try again." }, { status: 500 });
    }

    console.log("Success! Prompt length:", prompt.length);
    return NextResponse.json({ prompt });

  } catch (err) {
    console.error("Route error:", err);
    return NextResponse.json({ error: "Failed to build prompt: " + err.message }, { status: 500 });
  }
}
