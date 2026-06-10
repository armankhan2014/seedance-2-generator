/**
 * Internal server-to-server endpoint that returns a user's Seedance creations.
 * Used by visualseffect-studio so the DaVinci plugin's "My Library" can
 * aggregate creations across both services into one list.
 *
 * Auth: NOT NextAuth — uses a shared bridge secret in the Authorization
 * header so it's gateway-able by any internal caller (Studio, ops scripts,
 * future analytics jobs). Reject anything else loudly.
 *
 *   GET /api/internal/creations?userId=<clerk_or_local_id>&limit=50&since=<ms>
 *   Authorization: Bearer ${INTERNAL_BRIDGE_SECRET}
 *
 * Response shape is intentionally trimmed to what the plugin renders — full
 * objects bloat the cross-service hop.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SECRET = process.env.INTERNAL_BRIDGE_SECRET;

export async function GET(req) {
  // Refuse to run without the secret configured. Better to 503 than to ship
  // an unauthenticated cross-service window in production.
  if (!SECRET) {
    return NextResponse.json({ error: "Bridge secret not configured" }, { status: 503 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (bearer !== SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  // We accept either a Seedance-internal userId (cuid) OR the user's email
  // (Studio passes Clerk's email since Clerk userIds don't match Seedance cuids).
  const userId = (url.searchParams.get("userId") ?? "").trim();
  const email  = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!userId && !email) {
    return NextResponse.json({ error: "userId or email required" }, { status: 400 });
  }
  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
  const since = Number.parseInt(url.searchParams.get("since") ?? "", 10);

  try {
    // Resolve email → Seedance user.id so the Creation query can hit its
    // `userId` index. No-op when caller already supplied a Seedance userId.
    let resolvedUserId = userId;
    if (!resolvedUserId && email) {
      const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (!u) {
        // No Seedance account for this email — return empty rather than 404
        // so the aggregator can stay graceful.
        return NextResponse.json({ ok: true, items: [] });
      }
      resolvedUserId = u.id;
    }

    const rows = await prisma.creation.findMany({
      where: {
        userId: resolvedUserId,
        status: { not: "failed" },
        ...(Number.isFinite(since) ? { createdAt: { gte: new Date(since) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        prompt: true,
        imageUrl: true,
        videoFiles: true,
        aspectRatio: true,
        duration: true,
        quality: true,
        status: true,
        createdAt: true,
      },
    });

    // Normalise to the shape the Studio plugin endpoint expects so the
    // aggregator can concat across sources without further shaping.
    const items = rows.map((r) => {
      // Prefer the rendered video, fall back to the cover image when a
      // creation is still processing.
      const videoUrl = Array.isArray(r.videoFiles) && r.videoFiles.length > 0 ? r.videoFiles[0] : null;
      const url      = videoUrl ?? r.imageUrl ?? "";
      return {
        id:           `seedance-${r.id}`,
        type:         videoUrl ? "video" : "image",
        url,
        prompt:       r.prompt ?? "",
        modelId:      "seedance-2",
        modelLabel:   "Seedance 2",
        provider:     "seedance",
        aspectRatio:  r.aspectRatio ?? undefined,
        durationSec:  r.duration ?? undefined,
        quality:      r.quality ?? undefined,
        status:       r.status,
        createdAt:    r.createdAt instanceof Date ? r.createdAt.getTime() : Date.now(),
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("[GET /api/internal/creations]", e);
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }
}
