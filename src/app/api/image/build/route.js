import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { UserService } from "@/lib/services/user";
import { buildReferenceImage } from "@/lib/services/imageBuilderGemini";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Single-pass via Google Gemini 2.5 Flash Image — handles small-face
// identity preservation in turnaround sheets much better than GPT-image-1.
// ~$0.04 per image, fast (~30s), single API call.
const CREDIT_COST = 2;
const MAX_REFERENCES = 3;
const MAX_LOOK_LENGTH = 500;
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB after client-side compression
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// The "recipe" — hidden from users, wraps every request to enforce
// identity preservation, four-panel layout, and editorial quality.
// The reference-handling guidance adapts based on how many photos
// the user uploaded.
function buildReferenceGuidance(refCount) {
  if (refCount >= 3) {
    return `The user uploaded ${refCount} reference photos showing the SAME person from multiple angles — likely front, side, and back, in that order. Use each photo to inform its corresponding panel:
- Reference photo 1 → use it to draw Panel 1 (front view) exactly. Match the face, body proportions, and visible details.
- Reference photo 2 → use it to draw Panel 2 (side profile) exactly. Match the side-on facial features (nose profile, ear shape, jaw line) precisely.
- Reference photo 3 → use it to draw Panel 3 (back view) exactly. Match the hairline, head shape from behind, neck, and shoulders precisely.
- For Panel 4 (face close-up), use whichever reference photo shows the face most clearly (typically photo 1).`;
  }
  if (refCount === 2) {
    return `The user uploaded 2 reference photos of the SAME person from different angles. Use them together to lock identity. For the views the references cover, match exactly. For the missing view (likely back), INFER realistically — keep the same face, same hair, same skin tone, same body shape, same outfit drape. The inferred view must be unmistakably the same person.`;
  }
  // refCount === 1 (or fallback)
  return `The user uploaded ONE reference photo (likely a front-facing photo). Use it to LOCK the person's identity completely. For the side profile and back view panels, you must INFER realistically from what you can see in the front photo — keep the same face, same hair color and length and texture, same skin tone, same age, same body proportions, same height, same weight. The person in the side and back panels MUST be unmistakably the same person as the front reference. Do not invent different features for the unseen views.`;
}

function buildPrompt(userLook, refCount = 1) {
  return `ABSOLUTE RULE — THIS IS NOT IMAGE GENERATION, THIS IS WARDROBE EDITING ON A FIXED PERSON.

${buildReferenceGuidance(refCount)}

Every panel of the output must show THAT EXACT person — same face, no exceptions.

The face must be PIXEL-IDENTICAL across all four panels, INCLUDING the smaller full-body panels. The face in the small full-body panels (1, 2, 3) must be drawn with the same precision and detail as the close-up panel (4). Do NOT save detail for the close-up. Do NOT simplify, smooth, blur, idealize, beautify, age, de-age, slim, or "interpret" the face when it appears small. If you cannot draw the face at full detail in a small panel, you should NOT generate the image at all — but you MUST NOT generate a different face.

Match exactly to the reference photos: face shape, jawline, cheekbones, eyes (color, shape, spacing), eyebrows (shape, thickness), nose (shape, width, bridge), mouth, lips, chin, ears, skin tone, skin texture (pores, lines, marks), age, facial hair pattern and density, hairstyle, hair color, hair texture, hairline. Treat this as a costume change on the same person, not the creation of a new character that looks similar.

LAYOUT — exactly 4 panels in ONE horizontal row, left to right, evenly spaced with thin gaps:
- Panel 1: Front view, full body head-to-feet, arms relaxed at sides, looking at camera.
- Panel 2: Right-side profile, full body head-to-feet, body rotated 90° from panel 1, looking forward.
- Panel 3: Back view, full body head-to-feet.
- Panel 4: A SINGLE close-up portrait of the face from the front — head and shoulders only.

DO NOT duplicate the close-up. DO NOT add a 5th panel. DO NOT stack panels vertically. Output is ONE wide image, one row, four panels total.

OUTFIT / LOOK: ${userLook}

STYLE: Professional fashion model sheet on a clean white studio background. Soft, even, shadowless lighting. Ultra-realistic skin texture, sharp focus, natural hair detail. 8k editorial photography. No text, no logos, no watermarks, no captions. The four faces must be indistinguishable from each other when zoomed in — they are the same face.`;
}

async function uploadToR2(buffer, userId) {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  const key = `image-builds/${userId}/${Date.now()}.png`;
  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: "image/png",
    CacheControl: "public, max-age=86400",
  }));
  const baseUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  return `${baseUrl}/${key}`;
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to use the image builder." }, { status: 401 });
  }

  const formData = await req.formData();
  const look = formData.get("look");
  const files = formData.getAll("references");

  if (typeof look !== "string" || !look.trim()) {
    return NextResponse.json({ error: "Tell us what look you want (e.g. \"dress me like a king\")." }, { status: 400 });
  }
  if (look.length > MAX_LOOK_LENGTH) {
    return NextResponse.json({ error: `Description is too long (max ${MAX_LOOK_LENGTH} characters).` }, { status: 400 });
  }
  if (!files.length) {
    return NextResponse.json({ error: "Upload at least one reference photo." }, { status: 400 });
  }
  if (files.length > MAX_REFERENCES) {
    return NextResponse.json({ error: `You can upload up to ${MAX_REFERENCES} reference photos.` }, { status: 400 });
  }
  for (const f of files) {
    if (!f || typeof f === "string") {
      return NextResponse.json({ error: "Invalid reference file." }, { status: 400 });
    }
    if (f.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "One of the reference photos is too large." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(f.type)) {
      return NextResponse.json({ error: "Reference photos must be JPEG, PNG, or WEBP." }, { status: 400 });
    }
  }

  // Debit credits first
  try {
    await UserService.deductCredits(session.user.id, CREDIT_COST);
  } catch (err) {
    if (err.message === "Insufficient credits") {
      return NextResponse.json({ error: "Not enough credits. Buy a credit pack to continue." }, { status: 402 });
    }
    return NextResponse.json({ error: "Could not debit credits." }, { status: 500 });
  }

  // Single-pass generation via Gemini.
  let buffer;
  try {
    buffer = await buildReferenceImage({
      referenceFiles: files,
      prompt: buildPrompt(look.trim(), files.length),
    });
  } catch (err) {
    const status = err.status ?? 500;
    if (status >= 500 || err.code === "NOT_CONFIGURED") {
      try { await UserService.addCredits(session.user.id, CREDIT_COST); } catch {}
    }
    console.error("[IMAGE_BUILD]", err.status, err.message);
    if (err.code === "NOT_CONFIGURED") {
      return NextResponse.json({ error: "Image builder is not available right now. Please try again later." }, { status: 503 });
    }
    if (status === 400) {
      return NextResponse.json({ error: err.message || "The request was rejected (often a safety filter). Try a different photo or look description." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not generate image. Please try again in a few seconds." }, { status: 502 });
  }

  // Upload to R2
  let url;
  try {
    url = await uploadToR2(buffer, session.user.id);
  } catch (err) {
    // Refund — we charged but couldn't deliver
    try { await UserService.addCredits(session.user.id, CREDIT_COST); } catch {}
    console.error("[IMAGE_BUILD] R2 upload failed:", err.message);
    return NextResponse.json({ error: "Could not save the generated image. Your credits have been refunded." }, { status: 500 });
  }

  return NextResponse.json({ url, creditsCharged: CREDIT_COST });
}
