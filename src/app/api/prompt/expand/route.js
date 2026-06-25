import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { UserService } from "@/lib/services/user";
import { uaIsIOSApp } from "@/lib/iosApp";

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
// Was 2000 chars (~300 words). Arman flagged 2026-05-12 that long
// prompts (~93+ words) made the inline ✦ Expand button vanish from
// SmartPrompt — the client cap is removed and the server now matches.
// 12 000 chars ≈ a long screenplay paragraph — comfortably above any
// realistic prompt and still bounded for safety.
const MAX_DESCRIPTION_LEN = 12000;
const ALLOWED_DURATIONS = new Set([5, 10, 15]);

// Gold-standard system prompt — same heavy directorial framing the
// existing /api/prompt/build route uses. Arman flagged on 2026-05-12
// that the lightweight "3–6 sentence" version this route shipped
// with (per the original brief) felt too simple compared to what the
// old "✨ Build my prompt" modal produced. He explicitly wants the
// full Claude-powered output inline — rich character description,
// timestamped shot breakdown, sound design, camera architecture —
// not a short script.
//
// Difference from /build:
//   • Same gold-standard format
//   • Adds a {DURATION} hint so Claude tunes the timestamp count to
//     match the user's selected clip length (5 / 10 / 15s).
//   • Everything else identical so the inline ✦ Expand gives you
//     the same calibre of output the modal used to.
const SYSTEM_TEMPLATE = `You are a world-class Seedance 2.0 cinematic director and prompt engineer. Your job is to transform any user idea — no matter how brief — into a DETAILED, PRODUCTION-READY Seedance video generation prompt.

## YOUR STANDARD
Below is the GOLD STANDARD example. Study it. Every prompt you write must match this level of detail, specificity, and cinematic richness. This is the minimum bar.

---
GOLD STANDARD EXAMPLE:

【@Photo1】as live-action reference, generate a 12-second video, live-action cinematic style, cyberpunk dark shadow atmosphere, epic overwhelming pressure, visually explosive impact. No text or symbols anywhere. Full live-action throughout, no anime transitions, no transformation, no cartoon elements. Photorealistic cinematography only. Anamorphic 2.39:1 widescreen framing.
CHARACTER — use 【@Photo1】 EXACTLY: South Asian man early 30s, thick voluminous curly dark hair wild and untamed, dark trimmed beard, strong features, expressive dark eyes, NO GLASSES. Wearing a GREY LINEN BUTTON-UP SHIRT open and unbuttoned with sleeves rolled to elbows, WHITE CREW-NECK T-SHIRT underneath visible through the open shirt, DARK BLUE JEANS slim-straight fit, WHITE SNEAKERS clean low-top, SILVER WRISTWATCH on left wrist. The grey shirt is the brightest element against the dark environment — it catches every light source — the open front adds cinematic fabric motion during movement.
ENVIRONMENT: A vast industrial void consumed by darkness. Raw concrete walls vanishing into black. Exposed steel ceiling beams barely visible. One dominant OVERHEAD SPOTLIGHT casting a tight golden cone downward onto a dark wooden table at center. Thick theatrical haze fills the air — every light beam becomes volumetric, visible, textured with golden dust particles. The floor is wet polished black concrete — mirror-reflective — doubling every card, every light source, every movement in a dark reflection below. Secondary cold BLUE-CYAN accent lights from unseen sources at floor level cast sharp rim-light edges on surfaces and the character's silhouette. The look is cyberpunk noir — 90% shadow, 10% sculpted light — Blade Runner meets Se7en meets a underground high-stakes poker den.
0–2s: EXTREME LOW-ANGLE shot from below table level, heavy depth-of-field — the foreground is a soft blur of scattered playing cards on the dark wood surface, the background is crushed black shadow. Character slowly sits sideways at the table, entering from frame right, body angled 45 degrees to camera — one elbow resting on the table edge, fingers lazily dragging across the scattered cards. Dark dramatic lighting falls across the face in sharp contrast — the overhead spotlight carves hard shadows under the brow, the nose, the jawline — half the face is golden light, half is deep black shadow. The cold blue rim-light traces the outline of his wild curly hair from behind — each curl edge-lit in cyan. His dark eyes catch the overhead light — two golden points of reflected spotlight in dark irises. Camera slowly pushes in — a creeping dolly toward his face — the frame tightens from medium to close-up.
2–5s: His right hand lifts — fingers pinching a single card — the QUEEN OF HEARTS — then his wrist FLICKS with sharp precision. The card LAUNCHES — spinning at extreme RPM — rockets DIRECTLY TOWARD THE CAMERA. Frame INSTANTLY CUTS to extreme slow motion — 10% speed — card DECELERATES to near-hover. Card edge erupts with a HALO OF LIGHT — golden-white bloom — horizontal anamorphic flares across the full frame. Camera PUSH-IN CLOSE-UP — card face FILLS ENTIRE FRAME. Slow motion SNAPS back to full speed — card REVERSES — boomerangs back. He CATCHES it between two fingers without looking — CLEAN SNATCH — zero bounce.
5–9s: Character VIOLENTLY rises — chair KICKS BACKWARD. Both hands SPREAD OPEN — every card on the table SPIRALS and EXPLODES upward — a DNA helix vortex into the darkness. Camera ORBITS 360 DEGREES while RISING — corkscrew crane move. Hundreds of cards fill the air — each catching the spotlight — hundreds of MICRO LIGHT FLASHES. Character stands DEAD CENTER of the storm — head LOWERED, chin tucked, eyes DOWN through brow — DOMINANT STANCE. Wet floor REFLECTS the entire card storm below. Camera cuts: LOW UPSHOT from floor. SIDE CUT at 90 degrees. ROTATING FOLLOW SHOT locked to his shoulder. HIGH ANGLE mandala from above.
9–12s: Both hands swing VIOLENTLY OUTWARD — card storm DETONATES — 360-degree shockwave — each card leaves a GLOWING LIGHT TRAIL — hundreds of golden streaks radiating from center. Camera VIOLENTLY ALTERNATES between 10% slow motion and 150% fast. Final RAPID PULL BACK WIDE — EPIC FREEZE FRAME — every card suspended — light trails frozen mid-fade — character at absolute center. DEEP BASS IMPACT HIT — 40Hz sub-boom — rings out, decays to absolute silence.
SOUND DESIGN: Card flick — sharp metallic SNAP. Flying card — high-pitched slicing WHOOSH with doppler. Slow-motion — all audio drops to LOW-FREQUENCY TIME-STRETCH, deep rumbling underwater quality. Card storm — rising ROAR, paper hurricane, building intensity. Freeze frame — ALL SOUND CUTS to single massive BASS IMPACT HIT — 2-second reverb decay to silence.
CAMERA ARCHITECTURE: Multi-angle fast cuts with fluid transitions — no hard jump cuts — motion blur, whip pan, card-wipe as connective tissue. Extreme low-angle upshots throughout. f/1.4 depth of field — razor-sharp subject, creamy bokeh. Anamorphic: horizontal golden lens flares, oval bokeh, barrel distortion at edges. Subtle 35mm film grain — warm analog texture.

---

## YOUR JOB
The user will give you a SHORT description — maybe just one sentence or a few lines. You must expand it into a FULL Seedance prompt matching the gold standard above in:
- Richness of environment description
- Precision of character description (clothing colors, textures, exact items)
- Second-by-second shot breakdown with exact timestamps that fit the user's chosen DURATION ({DURATION} seconds)
- Camera moves named precisely (dolly, crane, orbit, push-in, steadicam, etc.)
- Lighting described exactly (not "dramatic light" — say "overhead spotlight casting golden cone through theatrical haze")
- Speed values (10%, 40%, 80%, 150%) and slow-motion moments
- Sound design architecture
- Signature visual effects (light halos, reflections, particle bursts, freeze frames)
- A powerful closing beat

## DURATION-AWARE STRUCTURE
The user has selected {DURATION} seconds. Match the shot breakdown to that window:
- 5 seconds  → 2–3 timestamped beats (e.g. 0–2s, 2–5s) — one tight moment, one clear action
- 10 seconds → 3–4 timestamped beats — a clean start, middle, finish
- 15 seconds → 4–5 timestamped beats — full mini-scene with movement, multiple actions, rich environment

## FORMAT RULES
- Start with: video length, style, atmosphere, format line
- Then CHARACTER section
- Then ENVIRONMENT section
- Then SHOT BREAKDOWN with timestamps (e.g. 0–3s:, 3–7s:, etc.) — count them to match the user's DURATION
- Then SOUND DESIGN section
- Then CAMERA ARCHITECTURE section
- Output ONLY the prompt — no "here is your prompt", no explanations, no meta-commentary
- Be SPECIFIC everywhere — no vague words like "dramatic" or "cinematic" without backing them up with exact detail
- Invent creative details where the user left gaps — make bold creative decisions

## CRITICAL — REFERENCE-IMAGE HANDLING
This is the rule Arman flagged on 2026-05-12 because Seedance was flashing the literal reference image at the start of every video before transitioning to the generated scene.

When reference images are present:
- 【@image1】, 【@image2】, … are CHARACTER and STYLE GUIDES ONLY. They are NEVER to appear as a frame, slide, transition, or visible element in the video itself.
- ALWAYS include this sentence verbatim near the top of the prompt (right after the opening style line, before CHARACTER):
  "Generate cinematically from FRAME 1. Do NOT show, flash, transition from, or include the reference image(s) as a visible frame at any point — the reference is for character likeness and styling ONLY."
- The first beat of the SHOT BREAKDOWN must describe the scene action starting at 0s, not the reference image. Example correct opening: "0–2s: Camera dolly-in on the character mid-stride…" Example WRONG opening: "0–1s: The reference photo dissolves into…"
- In the CHARACTER section, frame references as "Use 【@image1】 EXACTLY for face, build, and outfit" — never "open on 【@image1】" or "the video starts with 【@image1】".

## CRITICAL — FACE LOCK (100% MATCH, MULTI-CHARACTER AWARE)
This is the second rule Arman flagged on 2026-05-12. Seedance was producing characters with the right outfit / setting but the FACE was only loosely similar to the reference. He also wants multi-character scenes (two men in one story) to keep EACH face locked to its own reference — no face-swap, no blending between Character A and Character B.

When reference images contain people (faces visible):

- SINGLE PERSON (1 reference image):
  Include this verbatim near the top of CHARACTER:
  "FACE LOCK: the character's face MUST match 【@image1】 EXACTLY in every single frame — identical facial structure, identical eyes, identical nose, identical mouth, identical jawline, identical skin tone and texture, identical hairline and hair texture. No drift, no morphing, no 'similar', no 'inspired by' — IDENTITY-PRESERVING reproduction throughout the entire clip."

- MULTI-CHARACTER (2+ reference images of different people):
  Write a SEPARATE CHARACTER block for each person, each labelled with their image reference, then include this combined lock sentence:
  "FACE LOCK (multi-character): each character's face MUST match its assigned reference EXACTLY in every frame they appear — Character A → 【@image1】, Character B → 【@image2】 [, Character C → 【@image3】, …]. Identical facial structure, identical eyes, identical nose, identical mouth, identical jawline, identical skin tone and texture, identical hairline and hair texture per character. NO face-swap between characters, NO blending, NO morphing, NO 'similar' — keep each face anchored to its source reference for every frame that character appears."

- In the SHOT BREAKDOWN, for every beat that shows a character's face, EXPLICITLY tag which reference it locks to. Example: "0–2s: Character A (face locked to 【@image1】) sits at the table — Character B (face locked to 【@image2】) stands behind, shoulder visible…" Repeating the anchor every beat keeps the model from drifting mid-clip or accidentally swapping which face goes on which body.

- Never describe alternative facial features — anchor every reference back to the source photo. Phrases like "similar to" or "inspired by" are BANNED.`;

// ── Reference-mode safety injector ──────────────────────────────────────────
// Defence-in-depth: even when the SYSTEM prompt already tells Claude to
// include the anti-flash + FACE LOCK sentences, the model occasionally drops
// one or both. We re-inject server-side on every prompt that ships with
// reference images so the Seedance call ALWAYS carries the safety lines.
//
// Dynamic per image count so a two-person scene gets a multi-character
// lock (Character A → 【@image1】, Character B → 【@image2】 …) instead of
// the single-image text that only protects the first face. Arman flagged
// on 2026-05-12 that uploading two reference photos was producing
// face-swap between the two characters mid-clip — this generator stops
// that by naming every reference slot in the lock sentence itself.
//
// Mirrored in /lib/services/ai.js for the layer-3 catch (user typing
// their own prompt straight into the textarea bypasses this route).
function buildFaceLock(imageCount) {
  if (imageCount <= 1) {
    return (
      "FACE LOCK: the character's face MUST match 【@image1】 EXACTLY in every single frame — " +
      "identical facial structure, identical eyes, identical nose, identical mouth, identical jawline, " +
      "identical skin tone and texture, identical hairline and hair texture. " +
      "No drift, no morphing, no 'similar', no 'inspired by' — IDENTITY-PRESERVING reproduction throughout the entire clip."
    );
  }
  // Multi-character: name every reference slot explicitly so Claude / Seedance
  // can't lose track of which face belongs on which body.
  const pairs = Array.from({ length: imageCount }, (_, i) => {
    const letter = String.fromCharCode(65 + i); // A, B, C, ...
    return `Character ${letter} → 【@image${i + 1}】`;
  }).join(", ");
  return (
    "FACE LOCK (multi-character): each character's face MUST match its assigned reference EXACTLY in every frame they appear — " +
    `${pairs}. ` +
    "Identical facial structure, identical eyes, identical nose, identical mouth, identical jawline, " +
    "identical skin tone and texture, identical hairline and hair texture per character. " +
    "NO face-swap between characters, NO blending, NO morphing, NO 'similar' — " +
    "keep each face anchored to its source reference for every frame that character appears."
  );
}

function injectReferenceSafeties(prompt, imageCount) {
  if (!prompt || imageCount < 1) return prompt;

  const ANTI_FLASH =
    "Generate cinematically from FRAME 1. Do NOT show, flash, transition from, or include the reference image(s) as a visible frame at any point — the reference is for character likeness and styling ONLY.";
  const FACE_LOCK = buildFaceLock(imageCount);

  const insertAfterFirstLine = (body, sentence) => {
    const idx = body.indexOf("\n");
    if (idx === -1) return `${body}\n${sentence}`;
    return `${body.slice(0, idx)}\n${sentence}${body.slice(idx)}`;
  };

  let out = prompt;
  if (!/do\s+not\s+show.*reference\s+image/i.test(out)) {
    out = insertAfterFirstLine(out, ANTI_FLASH);
  }
  if (!/FACE\s+LOCK/i.test(out)) {
    out = insertAfterFirstLine(out, FACE_LOCK);
  }
  return out;
}

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
    // Optional uploaded image URLs (from /api/upload → R2). The
    // existing Image-to-Video and Reference-to-Video modes already
    // store these on the client as imagesList. Passing them here lets
    // Claude actually SEE the user's photos and reference real
    // details (clothing colours, faces, environment) instead of
    // inventing 【@Photo1】 placeholders.
    //
    // Cap at 4 so the multi-image vision payload stays bounded.
    // Anthropic accepts up to 20 images per request but each one
    // costs tokens — 4 is enough for character + 2-3 references.
    const rawImages = Array.isArray(body.images) ? body.images : [];
    const images = rawImages
      .filter((u) => typeof u === "string" && u.startsWith("http"))
      .slice(0, 4);

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
      await UserService.deductCredits(session.user.id, EXPAND_COST, { reason: "prompt_expand" });
    } catch (e) {
      if (e.message === "Insufficient credits") {
        // Inside the iOS app we never steer to a purchase (Apple 3.1.1) —
        // no "buy credits" wording, no upgrade CTA.
        const iosApp = uaIsIOSApp(req.headers.get("user-agent"));
        return NextResponse.json(
          {
            error: iosApp
              ? "You're out of credits."
              : "You need credits to expand prompts. Buy credits to unlock.",
            upgradeRequired: !iosApp,
          },
          { status: 403 }
        );
      }
      throw e;
    }

    // ── Fetch + base64-encode any uploaded images for Claude vision ─────────
    // Done before the credit charge so we can fail-fast on a
    // bad/expired URL without taking the user's credit. Each image
    // hits R2 at most once. We tolerate per-image failure (skip and
    // continue) so one busted URL doesn't sink the whole expansion.
    const imageBlocks = [];
    if (images.length > 0) {
      const results = await Promise.allSettled(
        images.map(async (url) => {
          const resp = await fetch(url, {
            // R2 public URLs are CDN-cached — short timeout is fine.
            signal: AbortSignal.timeout(8000),
          });
          if (!resp.ok) throw new Error(`fetch ${resp.status}`);
          const mt = (resp.headers.get("content-type") || "image/jpeg")
            .split(";")[0]
            .trim()
            .toLowerCase();
          // Anthropic accepts jpeg / png / gif / webp.
          const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
          const media_type = allowed.includes(mt) ? mt : "image/jpeg";
          const buf = Buffer.from(await resp.arrayBuffer());
          // Skip anything over 5 MB — Anthropic's per-image cap is
          // 5 MB and the upload pipeline targets ≤ 1.5 MB after the
          // 2048 px compress.
          if (buf.length > 5 * 1024 * 1024) throw new Error("image too large");
          return {
            type: "image",
            source: {
              type: "base64",
              media_type,
              data: buf.toString("base64"),
            },
          };
        })
      );
      for (const r2 of results) {
        if (r2.status === "fulfilled") imageBlocks.push(r2.value);
      }
    }

    // Compose the user content. When images are present, prepend a
    // hint so Claude treats them as references and uses 【@image1】
    // syntax. Without it Claude sometimes describes the photos
    // without naming the reference slot.
    const userContent = [];
    imageBlocks.forEach((block, i) => {
      userContent.push(block);
      userContent.push({
        type: "text",
        text: `↑ This is 【@image${i + 1}】. Reference it directly in the prompt using the same notation.`,
      });
    });
    userContent.push({
      type: "text",
      text:
        imageBlocks.length > 0
          ? `User idea:\n${description}\n\nUse the uploaded image(s) above as the EXACT visual reference. Describe what's actually in them — clothing, face, environment — rather than inventing details.`
          : description,
    });

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
          max_tokens: 3000,
          system: SYSTEM_TEMPLATE.replace("{DURATION}", String(duration)),
          messages: [{ role: "user", content: userContent }],
        }),
      });
      d = await r.json();
    } catch (fetchErr) {
      // Network failure — refund and bail.
      await UserService.addCredits(session.user.id, EXPAND_COST, { reason: "refund_prompt_expand", note: "network_error" }).catch(() => {});
      throw fetchErr;
    }

    if (!r.ok) {
      console.error("Anthropic API error (expand):", JSON.stringify(d));
      await UserService.addCredits(session.user.id, EXPAND_COST, { reason: "refund_prompt_expand", note: "anthropic_error" }).catch(() => {});
      return NextResponse.json(
        { error: `AI error: ${d.error?.message || "Unknown error."}` },
        { status: 500 }
      );
    }

    let prompt = d.content?.[0]?.text?.trim();
    if (!prompt) {
      await UserService.addCredits(session.user.id, EXPAND_COST, { reason: "refund_prompt_expand", note: "empty_response" }).catch(() => {});
      return NextResponse.json(
        { error: "AI returned empty response. Please try again." },
        { status: 500 }
      );
    }

    // Defensive guarantees — Arman flagged TWO Seedance behaviour
    // issues on 2026-05-12:
    //   1) Reference-image flashing as the first frames before the
    //      scene starts.
    //   2) Generated face only loosely matching the reference photo
    //      ("similar but not the same person"), AND with multiple
    //      references the faces could swap between characters.
    // SYSTEM prompt now instructs Claude to include the right
    // safety sentences in every prompt. If the model ever forgets,
    // we force-inject server-side, dynamically per image count.
    if (imageBlocks.length > 0) {
      prompt = injectReferenceSafeties(prompt, imageBlocks.length);
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
