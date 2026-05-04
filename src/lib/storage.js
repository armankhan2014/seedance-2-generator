/**
 * Cloudflare R2 Storage
 * S3-compatible — zero egress fees, global CDN
 *
 * Required env vars:
 *   R2_ACCOUNT_ID        – Cloudflare account ID
 *   R2_ACCESS_KEY_ID     – R2 API token access key
 *   R2_SECRET_ACCESS_KEY – R2 API token secret key
 *   R2_BUCKET_NAME       – bucket name (e.g. "seedance-videos")
 *   R2_PUBLIC_URL        – public base URL (e.g. https://videos.seedance.visualseffect.com)
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

function getClient() {
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!accountId) throw new Error("R2_ACCOUNT_ID is not set");
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * Download a video from a remote URL and upload it to R2.
 * Returns the public CDN URL of the stored file.
 */
export async function uploadVideoFromUrl(sourceUrl, key) {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);

  const contentType = response.headers.get("content-type") || "video/mp4";
  const buffer = await response.arrayBuffer();

  const client = getClient();
  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: Buffer.from(buffer),
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }));

  const baseUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  return `${baseUrl}/${key}`;
}

/**
 * Delete a video from R2.
 */
export async function deleteVideo(key) {
  const client = getClient();
  await client.send(new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  }));
}

/**
 * Extract the R2 object key from a public R2 URL.
 */
export function getKeyFromUrl(url) {
  if (!url) return null;
  const baseUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!baseUrl || !url.startsWith(baseUrl)) return null;
  return url.slice(baseUrl.length + 1);
}

/**
 * Returns true only when all R2 env vars are present.
 * Falls back gracefully — videos stay at their source URL if not configured.
 */
export function isR2Configured() {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL
  );
}
