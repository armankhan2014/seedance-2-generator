import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import config from "@/lib/config";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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
  const ext = (file.name?.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
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

    // ── Try R2 first ─────────────────────────────────────────────────────────
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
        console.log("[UPLOAD] R2 success:", url);
        return NextResponse.json({ url });
      } catch (r2Err) {
        console.error("[UPLOAD] R2 error:", r2Err.message);
        // Fall through to MuAPI
      }
    } else {
      console.log("[UPLOAD] R2 not configured, using MuAPI");
    }

    // ── Fallback: MuAPI ───────────────────────────────────────────────────────
    const apiKey = config.ai.seedance.apiKey;
    if (!apiKey) {
      return NextResponse.json({ error: "Image upload is not available. Please contact support." }, { status: 500 });
    }

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
      // MuAPI key likely expired — show clear message
      return NextResponse.json(
        { error: "Image upload failed. Please try again or contact support." },
        { status: 500 }
      );
    }

    let data;
    try { data = JSON.parse(responseText); }
    catch { return NextResponse.json({ error: "Invalid response from upload service" }, { status: 500 }); }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[UPLOAD_ERROR]", error);
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 });
  }
}
