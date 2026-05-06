import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { UserService } from "@/lib/services/user";
import { buildReferenceImage } from "@/lib/services/imageBuilder";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const CREDIT_COST = 2;
const MAX_REFERENCES = 3;
const MAX_PROMPT_LENGTH = 4000;
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB after client-side compression
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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
  const prompt = formData.get("prompt");
  const files = formData.getAll("references");

  if (typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "Please describe what you want to generate." }, { status: 400 });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json({ error: `Prompt is too long (max ${MAX_PROMPT_LENGTH} characters).` }, { status: 400 });
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

  // Generate via OpenAI
  let buffer;
  try {
    buffer = await buildReferenceImage({ referenceFiles: files, prompt });
  } catch (err) {
    // Refund only on transient errors (5xx/network). 4xx errors are user-input
    // problems and refunding them invites abuse loops.
    const status = err.status ?? 500;
    if (status >= 500 || err.code === "NOT_CONFIGURED") {
      try { await UserService.addCredits(session.user.id, CREDIT_COST); } catch {}
    }
    console.error("[IMAGE_BUILD]", err.status, err.message);
    if (err.code === "NOT_CONFIGURED") {
      return NextResponse.json({ error: "Image builder is not available right now. Please try again later." }, { status: 503 });
    }
    return NextResponse.json({ error: "Could not generate image. Please try again." }, { status: 502 });
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
