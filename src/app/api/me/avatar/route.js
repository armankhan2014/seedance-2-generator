/**
 * POST /api/me/avatar
 *
 * Multi-part image upload → Cloudflare R2 → User.image URL.
 *
 * Replaces the legacy /api/user/update-image (which stored a 250×250
 * base64 dataURL directly in the User.image column). Bigger size cap
 * — clients can now send up to 1 MB; we still recommend they resize
 * client-side to 512×512 so the bucket stays lean.
 *
 * Body: multipart/form-data with a single `file` field.
 *
 * What this route does NOT touch yet:
 *   • Multi-size generation (thumb / medium / large) — the existing
 *     base 512×512 covers every UI surface today. If we later need
 *     32 px thumbs in chat, we can re-process or use Cloudflare
 *     Images transform-on-demand without changing this route.
 *   • Face-aware cropping (BlazeFace is already in the bundle for
 *     /generate; can be added client-side without a server change).
 *
 * Cleanup: if the user's previous avatar was an R2 URL, we delete
 * that object before returning so the bucket doesn't grow unbounded.
 * Legacy base64 dataURLs in User.image are ignored — they're not on
 * R2, they vanish the moment we overwrite the column.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import {
  uploadImageBuffer,
  deleteR2Object,
  getKeyFromUrl,
  isR2Configured,
} from "@/lib/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Client should keep payload <1 MB. We accept up to 2 MB to leave
// headroom for a paste-from-clipboard PNG that didn't resize well.
const MAX_BYTES = 2 * 1024 * 1024;

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isR2Configured()) {
      return NextResponse.json(
        { error: "Image storage not configured" },
        { status: 503 }
      );
    }

    let formData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
    }
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Missing file field" }, { status: 400 });
    }

    const contentType = file.type || "image/jpeg";
    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: `Unsupported type: ${contentType}. Use JPG, PNG, or WebP.` },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (${Math.round(file.size / 1024)} KB · max 2 MB)` },
        { status: 400 }
      );
    }

    // Look up the user so we can scope the R2 key + clean up any
    // previous R2 object.
    const me = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, image: true },
    });
    if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Build the bucket key — timestamped so every upload is a new
    // immutable object (lets us set a long Cache-Control).
    const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const ts = Date.now();
    const key = `users/${me.id}/avatar-${ts}.${ext}`;

    // Push to R2.
    const buffer = Buffer.from(await file.arrayBuffer());
    const publicUrl = await uploadImageBuffer(buffer, key, contentType);

    // Persist on User.image.
    const updated = await prisma.user.update({
      where: { id: me.id },
      data:  { image: publicUrl },
      select: { id: true, image: true },
    });

    // Best-effort cleanup of the previous R2 object — only if the
    // old value was actually an R2 URL we own. Skipped silently for
    // legacy base64 dataURLs or external avatars (Google OAuth, etc).
    const oldKey = getKeyFromUrl(me.image);
    if (oldKey && oldKey !== key) {
      // Fire-and-forget — we already replied with the new URL on
      // success, the old key is no longer reachable from any view.
      deleteR2Object(oldKey).catch(() => {});
    }

    return NextResponse.json({ image: updated.image });
  } catch (err) {
    console.error("[/api/me/avatar POST] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
