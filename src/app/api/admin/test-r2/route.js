import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export async function GET() {
  const checks = {
    R2_ACCOUNT_ID:        !!process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID:     !!process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: !!process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME:       !!process.env.R2_BUCKET_NAME,
    R2_PUBLIC_URL:        !!process.env.R2_PUBLIC_URL,
  };

  const allSet = Object.values(checks).every(Boolean);
  if (!allSet) {
    return NextResponse.json({ ok: false, checks, error: "Missing R2 env vars" });
  }

  try {
    const client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });

    const testKey = `test/ping-${Date.now()}.txt`;
    await client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: testKey,
      Body: Buffer.from("ping"),
      ContentType: "text/plain",
    }));
    await client.send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: testKey,
    }));

    return NextResponse.json({
      ok: true, checks,
      bucket: process.env.R2_BUCKET_NAME,
      publicUrl: process.env.R2_PUBLIC_URL,
      message: "R2 connection successful ✅",
    });
  } catch (err) {
    return NextResponse.json({ ok: false, checks, error: err.message });
  }
}
