/**
 * POST /api/me/cover
 *
 * Cover-banner upload → R2 → User.coverImageUrl. Mirror of
 * /api/me/avatar with a larger size budget (covers are 16:9 banners
 * meant to render full-bleed at ~1920px on desktop).
 *
 * Body: multipart/form-data with a `file` field.
 *
 * Notes:
 *   • coverImageUrl already lives on the shared Neon User row —
 *     community wrote that column originally. After this lands, the
 *     same cover banner shows on community/music/edits the moment
 *     they next render the user.
 *   • Crop is client-side (object-fit: cover on render). Phase 3a.5
 *     adds an actual crop UI; for now any aspect lands gracefully.
 *   • Cleanup: previous R2 cover (if any) is deleted to keep the
 *     bucket flat. Legacy non-R2 values are ignored.
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

// Covers can legitimately be larger than avatars — a 1920×1080 JPEG
// at 0.85 quality is typically 400-900 KB. 4 MB cap gives plenty of
// headroom for a PNG paste from a screenshot without rejecting
// reasonable uploads.
const MAX_BYTES = 4 * 1024 * 1024;

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
        { error: `File too large (${Math.round(file.size / 1024)} KB · max 4 MB)` },
        { status: 400 }
      );
    }

    const me = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, coverImageUrl: true },
    });
    if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const ts = Date.now();
    const key = `users/${me.id}/cover-${ts}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const publicUrl = await uploadImageBuffer(buffer, key, contentType);

    const updated = await prisma.user.update({
      where: { id: me.id },
      data:  { coverImageUrl: publicUrl },
      select: { id: true, coverImageUrl: true },
    });

    const oldKey = getKeyFromUrl(me.coverImageUrl);
    if (oldKey && oldKey !== key) {
      deleteR2Object(oldKey).catch(() => {});
    }

    return NextResponse.json({ coverImageUrl: updated.coverImageUrl });
  } catch (err) {
    console.error("[/api/me/cover POST] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// Lets users clear their cover back to the brand gradient placeholder.
// Phase 3a.5 will expose this in the Edit drawer; for now it's
// reachable via fetch("/api/me/cover", { method: "DELETE" }) so the
// admin tools + future "remove cover" button both work the same way.
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const me = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, coverImageUrl: true },
    });
    if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const oldKey = getKeyFromUrl(me.coverImageUrl);
    await prisma.user.update({
      where: { id: me.id },
      data:  { coverImageUrl: null },
    });
    if (oldKey) deleteR2Object(oldKey).catch(() => {});
    return NextResponse.json({ coverImageUrl: null });
  } catch (err) {
    console.error("[/api/me/cover DELETE] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
