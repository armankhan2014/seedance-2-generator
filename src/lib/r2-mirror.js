// Mirror an external media URL into our R2 bucket.
//
// Used by /api/prompts (Share to Prompt Library) so PromptEntry rows
// never end up pointing at a third-party CDN we don't control. Before
// this, PromptEntry.resultMediaUrl stored whatever the client POSTed
// — usually a `cdn.muapi.ai/...` URL straight from the Seedance
// generator. MuAPI's S3 bucket has a 30-day expiry rule that moves
// objects to DEEP_ARCHIVE, after which GET returns AccessDenied.
//
// Caught 2026-06-19 when the prompt "LONDON HEATHROW — CELEBRITY
// ARRIVAL" (id cmq1b7jv6000004jrde1c6x3z) showed "No video with
// supported format and MIME type found." in the browser. Three
// published prompts already broken; every future share would join
// them.
//
// Strategy:
// - HEAD-check first so we know the source is alive + see the
//   content-type and content-length without pulling bytes.
// - Reject anything > MAX_BYTES (default 80 MB — same cap as the
//   manual upload route for video).
// - GET the bytes (single fetch — these are MuAPI CDN-hosted files,
//   not chunked uploads).
// - PUT to R2 under `<prefix>/<random>.<ext>` so two shares of the
//   same source URL still get unique keys.
// - Return the public R2 URL. Caller swaps it into the DB row.
//
// Failure mode: return null. Callers should fall back to the original
// URL (the share at least lands; we'll have a backfill / cron path
// to retry mirrors that initially failed).
//
// R2 already configured via the same env vars /api/upload uses:
//   R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY /
//   R2_BUCKET_NAME / R2_PUBLIC_URL.

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "node:crypto";

const MAX_BYTES = 80 * 1024 * 1024; // 80 MB (video cap)

// Extension inference from content-type — covers the formats MuAPI
// + Replicate + fal.ai actually emit. We deliberately don't try to
// infer from the source URL path because some CDNs hand back
// extensionless keys.
const EXT_FROM_TYPE = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function _r2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

function _r2Configured() {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL
  );
}

/**
 * Mirror a source URL into R2. Returns the new R2 public URL on
 * success, or null on any failure (caller decides whether to fall
 * back to the source URL or fail loud).
 *
 * @param {string} sourceUrl    e.g. "https://cdn.muapi.ai/outputs/abc.mp4"
 * @param {object} opts
 * @param {string} opts.prefix  R2 key prefix, e.g. "prompts/<userId>"
 * @param {number} [opts.maxBytes]  hard cap (default 80 MB)
 * @param {AbortSignal} [opts.signal]  optional cancel signal
 * @returns {Promise<string|null>}  R2 URL or null
 */
export async function mirrorToR2(sourceUrl, opts = {}) {
  if (typeof sourceUrl !== "string" || !sourceUrl.startsWith("http")) {
    return null;
  }
  if (!_r2Configured()) {
    console.error("[r2-mirror] R2 env not configured");
    return null;
  }

  const prefix = (opts.prefix || "mirror").replace(/^\/+|\/+$/g, "");
  const maxBytes = opts.maxBytes || MAX_BYTES;

  try {
    // HEAD first to short-circuit dead / archived / too-large sources
    // BEFORE pulling MBs of bytes through the lambda.
    const head = await fetch(sourceUrl, {
      method: "HEAD",
      signal: opts.signal,
    });
    if (!head.ok) {
      console.warn(`[r2-mirror] HEAD ${head.status} on ${sourceUrl}`);
      return null;
    }
    const contentType = (head.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const contentLengthStr = head.headers.get("content-length") || "0";
    const contentLength = parseInt(contentLengthStr, 10) || 0;
    if (contentLength > maxBytes) {
      console.warn(
        `[r2-mirror] ${sourceUrl} is ${contentLength}B, cap ${maxBytes}B`
      );
      return null;
    }

    // Now pull the actual bytes.
    const res = await fetch(sourceUrl, { signal: opts.signal });
    if (!res.ok) {
      console.warn(`[r2-mirror] GET ${res.status} on ${sourceUrl}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());

    // Defensive: if the actual body is bigger than HEAD claimed
    // (some misconfigured CDNs lie about content-length on HEAD),
    // still enforce the cap.
    if (buf.byteLength > maxBytes) {
      console.warn(
        `[r2-mirror] body ${buf.byteLength}B > cap ${maxBytes}B for ${sourceUrl}`
      );
      return null;
    }

    // Pick an extension. Prefer the content-type mapping; fall back
    // to the URL's last path segment; default to "bin" if both fail.
    let ext = EXT_FROM_TYPE[contentType] || "";
    if (!ext) {
      const pathExt = (
        new URL(sourceUrl).pathname.split(".").pop() || ""
      )
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      ext = pathExt && pathExt.length <= 5 ? pathExt : "bin";
    }

    // Random key — two prompt shares with the same source URL get
    // distinct R2 keys, and we don't leak the underlying MuAPI hash.
    const random = crypto.randomBytes(12).toString("hex");
    const key = `${prefix}/${random}.${ext}`;

    await _r2Client().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buf,
        ContentType: contentType || "application/octet-stream",
        // 1 year cache — videos are immutable once shared, R2 URL
        // contains a random hash so we never collide.
        CacheControl: "public, max-age=31536000, immutable",
      })
    );

    const baseUrl = process.env.R2_PUBLIC_URL.replace(/\/$/, "");
    return `${baseUrl}/${key}`;
  } catch (err) {
    console.error(
      `[r2-mirror] failed for ${sourceUrl}: ${err?.message || err}`
    );
    return null;
  }
}

/**
 * Mirror only when the source URL is NOT already on our R2. Lets
 * callers blindly hand any URL — already-R2 ones pass through
 * unchanged, third-party ones get copied.
 */
export async function mirrorToR2IfExternal(sourceUrl, opts = {}) {
  if (!sourceUrl || typeof sourceUrl !== "string") return null;
  const base = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (base && sourceUrl.startsWith(base)) {
    // Already on our R2 — no-op.
    return sourceUrl;
  }
  return (await mirrorToR2(sourceUrl, opts)) || sourceUrl;
}
