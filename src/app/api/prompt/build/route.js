import { NextResponse } from "next/server";

const SYSTEM = `You are a world-class Seedance 2.0 cinematic director and prompt engineer. Your job is to transform any user idea — no matter how simple or complex — into a DETAILED, PRODUCTION-READY Seedance video generation prompt that reads like a real film treatment.

## OUTPUT FORMAT — always structure your prompt exactly like this:

**SCENE OVERVIEW**
[1-2 sentences: genre, tone, overall feeling — e.g. "Epic South Indian mass cinema meets Victorian London — Baahubali energy with Guy Ritchie grit — dramatic, fun, exaggerated."]

**COLOR PALETTE & VISUAL STYLE**
[Exact color palette — dominant tones, accent colors, film stock or render style, lighting quality — e.g. "Warm amber daylight washing aged stone. Desaturated earth tones: brown, tan, grey, weathered wood. Deep crimson sash POPS as the visual anchor. Painterly quality — golden dust motes in every sunbeam. Anamorphic 35mm with subtle lens flares."]

**SETTING**
[Rich environment description — location, time of day, architecture, atmosphere, what's in the background, foreground props, weather, crowd if any]

**CHARACTER(S)**
[Physical description, exact costume with colors and textures, how they carry themselves, what makes them visually distinctive]

**SHOT BREAKDOWN**

SHOT 1 (00:00–[timestamp]) — [Title]
• Camera: [exact shot type and movement — e.g. "Wide establishing drone shot descending into a low tracking shot"]
• Speed: [e.g. "80% slow — we absorb the setting"]
• Action: [exactly what happens — be specific and vivid]
• Key visual: [the most important thing in this shot]

SHOT 2 ([timestamp]–[timestamp]) — [Title]
[same format]

[Continue for all shots covering the full duration]

**SIGNATURE EFFECTS**
[List 3-5 of the most visually striking moments — the things that will make this video extraordinary — e.g. "Petal explosion from destroyed flower stall — hundreds of petals burst into golden sunlight", "Speed ramp: 40% on hero strikes, 150% on background chaos", "Final freeze frame fades to sepia vintage photograph"]

**CINEMATIC LANGUAGE RULES**
- Use exact camera vocabulary: extreme close-up, dolly zoom, whip pan, rack focus, crane shot, steadicam, orbital, push-in, pull-back, handheld, POV, Dutch angle, bird's-eye, worm's-eye, gimbal tracking
- Use exact lighting terms: golden-hour rim light, volumetric god rays, chiaroscuro, practical neon, split lighting, motivated key light, silhouette, blue-hour, magic-hour
- Use exact speed ramp values: 30%, 40%, 60%, 80%, 100%, 120%, 150% — vary them constantly
- Visual style options: photorealistic 8K, anamorphic 35mm with grain, Kodak Vision3 colour grade, IMAX format, hyper-detailed CGI, ray-traced reflections, painterly impressionist

## IMPORTANT RULES:
- Output ONLY the prompt itself — no meta-commentary, no "here is your prompt", no explanation
- Be SPECIFIC — never say "dramatic lighting" when you can say "harsh chiaroscuro side light cutting through fog"
- Be SPECIFIC — never say "he runs" when you can say "he launches from stillness to full sprint, his crimson sash streaming behind him, boots pounding cobblestones"
- Make creative decisions to fill any gaps — if the user gives a short idea, build a full cinematic world around it
- Every shot needs a camera move, a speed, and a key visual moment
- The COLOR ANCHOR rule: always identify the ONE color that will be the visual tracker through every shot (like the crimson sash)
- Always end with a signature closing beat — a freeze frame, a zoom out, a callback, a fade`;

export async function POST(req) {
  try {
    const { description } = await req.json();
    if (!description?.trim()) {
      return NextResponse.json({ error: "No description provided." }, { status: 400 });
    }

    if (process.env.ANTHROPIC_API_KEY) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
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

    const prompt = buildFallbackPrompt(description.trim());
    return NextResponse.json({ prompt });

  } catch (err) {
    console.error("/api/prompt/build error:", err);
    return NextResponse.json({ error: "Failed to build prompt." }, { status: 500 });
  }
}

function buildFallbackPrompt(desc) {
  const cleanDesc = desc.charAt(0).toUpperCase() + desc.slice(1).replace(/[.!?]+$/, "");
  return `**SCENE OVERVIEW**
${cleanDesc}. Epic cinematic tone with dramatic energy and rich visual storytelling.

**COLOR PALETTE & VISUAL STYLE**
Warm golden-hour light washing the environment. Deep, saturated hero colors popping against muted, desaturated backgrounds. Anamorphic 35mm with subtle grain, natural lens flares, and Kodak Vision3 colour grade. Golden dust motes float through every sunbeam.

**SETTING**
Rich, textured environment filled with period-accurate props and atmospheric detail. Dense crowd if applicable. Architecture and background elements that anchor the geography and give scale.

**CHARACTER**
Protagonist with distinctive, visually bold costume — one ANCHOR COLOR (deep crimson, royal blue, or gold) that tracks through every shot against a muted world. Strong physical presence, expressive face, calm confidence.

**SHOT BREAKDOWN**

SHOT 1 (00:00–00:03) — The Establish
• Camera: Sweeping wide drone shot descending into a low ground-level tracking shot
• Speed: 80% — we absorb the world
• Action: Environment revealed in full — protagonist visible as a bold color against the muted crowd
• Key visual: The anchor color catches the light — the visual hook is set

SHOT 2 (00:03–00:08) — The Action
• Camera: Steadicam tracking shot cutting to extreme close-up with shallow depth of field
• Speed: 150% on chaos, 40% on hero moments — constant speed ramp rhythm
• Action: The central dramatic action unfolds — exaggerated, cinematic, larger than life
• Key visual: Hero moving through chaos with absolute composure

SHOT 3 (00:08–00:12) — The Climax
• Camera: Orbital drone shot descending into a push-in close-up on the hero's face
• Speed: 30% — pure slow motion — every detail visible
• Action: The signature moment — the most visually striking beat of the entire sequence
• Key visual: Beauty from chaos — petals, light, debris — whatever the moment calls for

SHOT 4 (00:12–00:15) — The Icon
• Camera: Crane shot rising above the scene revealing full scale, then freeze frame
• Speed: 40% fading to freeze
• Action: Hero walks away through the aftermath — calm, unhurried, victorious
• Key visual: Crane wide reveals everything — hero is small against the large world — freeze frame to sepia fade

**SIGNATURE EFFECTS**
- Speed ramp cascade: 40% on every hero strike, 150% on every crowd reaction
- Anchor color tracker visible in every single shot
- Slow-motion particulate: dust, petals, debris — every impact has floating material
- Final crane wide + freeze frame + sepia fade to vintage photograph`;
}
