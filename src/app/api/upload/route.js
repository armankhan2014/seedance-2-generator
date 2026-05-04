import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import config from "@/lib/config";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Upload image to R2 and return a public URL
async function uploadToR2(file, userId) {
  const accountId = process.env.R2_ACCOUNT_ID;
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  const bytes = await file.arrayBuffer();
  const ext = file.name?.split(".").pop()?.toLowerCase() || "jpg";
  const key = `uploads/${userId}/${Date.now()}.${ext}`;

  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: Buffer.from(bytes),
    ContentType: file.type || "image/jpeg",
    CacheControl: "public, max-age=86400",
  }));

  const baseUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  return `${baseUrl}/${key}`;
}

// Upload image to MuAPI (fallback)
async function uploadToMuAPI(file, apiKey) {
  const muapiFormData = new FormData();
  muapiFormData.append("file", file);

  const response = await fetch("https://api.muapi.ai/api/v1/upload_file", {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: muapiFormData,
  });

  const responseText = await response.text();
  console.log("[UPLOAD] MuAPI status:", response.status, "body:", responseText);

  if (!response.ok) {
    throw new Error(`Upload service error (${response.status}): ${responseText.slice(0, 200)}`);
  }

  return JSON.parse(responseText);
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // ── Try R2 first (preferred — we own it, no API key issues) ──────────────
    const r2Ready = !!(
      process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME &&
      process.env.R2_PUBLIC_URL
    );

    if (r2Ready) {
      try {
        const url = await uploadToR2(file, session.user.id);
        console.log("[UPLOAD] R2 upload success:", url);
        // Return in same format as MuAPI for compatibility
        return NextResponse.json({ url });
      } catch (r2Err) {
        console.error("[UPLOAD] R2 failed, trying MuAPI fallback:", r2Err.message);
      }
    }

    // ── Fallback to MuAPI ────────────────────────────────────────────────────
    const apiKey = config.ai.seedance.apiKey;
    if (!apiKey) {
      return NextResponse.json({ error: "Upload not configured — contact support" }, { status: 500 });
    }

    try {
      const data = await uploadToMuAPI(file, apiKey);
      return NextResponse.json(data);
    } catch (muapiErr) {
      return NextResponse.json({ error: muapiErr.message }, { status: 500 });
    }
  } catch (error) {
    console.error("[UPLOAD_ERROR]", error);
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 });
  }
}
