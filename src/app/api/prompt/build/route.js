import { NextResponse } from "next/server";

const SYSTEM = `You are an elite Seedance 2.0 cinematographer and prompt engineer. Your job is to transform a user's simple idea into a rich, detailed, production-ready Seedance video generation prompt.

Output rules:
- Output ONLY the final prompt — no explanation, no preamble, no quotes, no labels.
- Length: 4–7 sentences. Be thorough and specific.
- Structure every prompt with ALL of these elements in order:
  1. SUBJECT & ACTION — who/what is doing what, with precise physical details
  2. SETTING & ENVIRONMENT — location, time of day, weather, world-building details
  3. LIGHTING — exact lighting setup (e.g. "golden-hour rim light", "harsh overhead neon", "soft diffused moonlight through fog")
  4. CAMERA WORK — opening shot type, then camera movement (e.g. "opens on a tight close-up then slowly pulls back in a cinematic dolly zoom", "sweeping drone aerial shot that descends into a tracking shot at eye level", "handheld close-up with shallow depth of field")
  5. MOOD & ATMOSPHERE — emotional tone, tension, energy
  6. VISUAL STYLE — film stock, colour grade, render quality (e.g. "photorealistic 8K, Kodak Vision3 500T colour grade", "anamorphic 35mm with lens flares", "hyper-detailed CGI with ray-traced reflections")
  7. MOTION DETAILS — how things move, speed, slow motion if relevant

Camera vocabulary to use freely: extreme close-up, close-up, medium shot, wide shot, establishing shot, over-the-shoulder, POV shot, Dutch angle, bird's-eye view, worm's-eye view, dolly zoom, whip pan, rack focus, crane shot, gimbal tracking shot, handheld, steadicam, cinematic drone shot, orbital shot, push-in, pull-back, parallax.

Lighting vocabulary: golden-hour, magic-hour, blue-hour, harsh midday sun, rim lighting, volumetric god rays, practical neon lighting, candlelight, moonlight, strobe, chiaroscuro, split lighting, motivated lighting, silhouette.

Always make creative, specific choices — never be vague. If the user gives a short idea, build a full cinematic world around it.`;

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
          max_tokens: 600,
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

    // ── Fallback: rich keyword-based template ────────────────────────────────
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
    [["epic", "dramatic", "powerful", "intense", "battle", "war"],  "epic, dramatic atmosphere with intense emotional weight"],
    [["dark", "mysterious", "shadow", "night", "noir"],             "dark, mysterious atmosphere thick with tension and shadow"],
    [["peaceful", "calm", "serene", "gentle", "quiet"],             "peaceful, serene atmosphere with a meditative stillness"],
    [["dreamy", "magical", "ethereal", "fantasy", "surreal"],       "dreamy, ethereal atmosphere with an otherworldly quality"],
    [["romantic", "warm", "sunset", "golden", "love"],              "warm, golden-hour atmosphere with a romantic, tender feeling"],
    [["action", "chase", "speed", "fast", "rush"],                  "high-octane, adrenaline-charged atmosphere"],
    [["sad", "lonely", "melancholy", "grief", "loss"],              "melancholic atmosphere heavy with emotion and solitude"],
  ];
  let mood = "cinematic atmosphere with rich emotional depth";
  for (const [keys, m] of moodMap) {
    if (keys.some(k => d.includes(k))) { mood = m; break; }
  }

  const styleMap = [
    [["anime", "cartoon", "illustrated", "animated"],   "vibrant anime aesthetic with fluid animation and bold colours"],
    [["realistic", "photorealistic", "real", "raw"],    "photorealistic 8K rendering, hyper-detailed textures, Kodak Vision3 colour grade"],
    [["vintage", "retro", "old", "film"],               "vintage 35mm film aesthetic with grain, vignette and faded colour palette"],
    [["neon", "cyber", "futuristic", "sci-fi", "tech"], "neon-lit cyberpunk aesthetic with glowing reflections on wet pavement"],
    [["painting", "art", "impressionist", "painterly"], "painterly impressionist style with visible brushwork and rich colour mixing"],
    [["horror", "scary", "dark", "creepy"],             "desaturated horror aesthetic, high contrast with deep shadow detail"],
  ];
  let style = "cinematic anamorphic 35mm film look with subtle grain and natural colour grading";
  for (const [keys, s] of styleMap) {
    if (keys.some(k => d.includes(k))) { style = s; break; }
  }

  const camMap = [
    [["face", "portrait", "emotion", "expression"],  "opens on an extreme close-up of the face with shallow depth of field, then slowly pulls back in a cinematic dolly shot"],
    [["wide", "landscape", "vast", "panorama", "mountain", "ocean"], "sweeping wide establishing drone shot descending gracefully into a low tracking shot at ground level"],
    [["drone", "aerial", "above", "bird", "sky"],   "dramatic drone aerial shot with a slow orbital rotation revealing the full scale of the scene"],
    [["chase", "run", "speed", "action", "fast"],   "intense handheld tracking shot that races alongside the subject, cutting to a whip-pan to reveal the environment"],
    [["slow", "motion", "gentle", "peaceful"],       "silky smooth gimbal shot with 120fps slow motion capturing every detail of the movement"],
    [["city", "urban", "street", "crowd"],           "ground-level tracking shot weaving through the environment, cutting to an overhead drone shot"],
  ];
  let camera = "smooth steadicam tracking shot that opens wide and slowly pushes in to a medium close-up";
  for (const [keys, c] of camMap) {
    if (keys.some(k => d.includes(k))) { camera = c; break; }
  }

  const lightMap = [
    [["night", "dark", "shadow"],    "dramatic chiaroscuro lighting with deep shadows and isolated practical light sources"],
    [["sunset", "golden", "warm"],   "stunning golden-hour rim lighting casting long warm shadows with volumetric haze"],
    [["rain", "storm", "wet"],       "moody overcast lighting with rain-soaked reflections and soft diffused grey tones"],
    [["neon", "city", "urban"],      "vibrant neon practical lighting with colourful reflections on wet surfaces"],
    [["sun", "day", "bright"],       "crisp natural daylight with soft volumetric god rays breaking through"],
    [["fog", "mist", "haze"],        "ethereal diffused lighting filtering through mist, creating a soft atmospheric glow"],
  ];
  let light = "cinematic golden-hour side lighting with warm volumetric rays";
  for (const [keys, l] of lightMap) {
    if (keys.some(k => d.includes(k))) { light = l; break; }
  }

  const cleanDesc = desc.charAt(0).toUpperCase() + desc.slice(1).replace(/[.!?]+$/, "");
  return `${cleanDesc}. The ${camera}. ${light}. The scene carries a ${mood}. Shot in ${style}, with careful attention to motion, texture and depth.`;
}
