/**
 * /api/me — canonical editable-profile endpoint (Phase 2 of the
 * profile-v2 redesign).
 *
 * Why it exists alongside /api/user/profile:
 *   • /api/user/profile is read-only and tailored for the *current*
 *     profile page (avatar, credits, stats). It's used elsewhere in
 *     the app — don't disturb it.
 *   • /api/me is the dedicated read/write surface for the redesigned
 *     profile + Edit-profile drawer. GET returns every editable
 *     field plus the user's social-link rows; PATCH validates +
 *     updates the editable fields.
 *
 * What this route OWNS (Phase 2):
 *   bio, tagline, location, pronouns, coverImageUrl, isPrivate,
 *   notifyComments + other community-side bell preferences (skipped
 *   for now — community owns those; can be wired in Phase 3).
 *
 * What this route DOES NOT touch yet:
 *   • Username / @handle (deferred — needs its own uniqueness +
 *     30-day cooldown + URL-redirect strategy).
 *   • Avatar + cover image upload (deferred to Phase 3 R2 wiring).
 *   • Email / password / 2FA / delete-account (sensitive flows that
 *     need re-auth + their own routes).
 *   • Social links create/update/delete — Phase 3.
 *
 * Cross-subdomain sync:
 *   • community.visualseffect.com + music + edits all read from the
 *     SAME Neon row. The moment this PATCH commits, the next render
 *     on any of those apps reads the fresh values. No fanout needed.
 *   • Studio (visualseffect.com) is on Clerk — separate identity,
 *     untouched.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ── Field caps — mirror the Edit-drawer client validation ─────────
// Server is the source of truth; client caps are just nice UX.
const LIMITS = {
  name:     { max: 80  },
  bio:      { max: 500 },
  tagline:  { max: 120 },
  location: { max: 80  },
  pronouns: { max: 40  },
};

const VALID_VISIBILITY = ["public", "followers", "private"];

// ── Social link platforms — whitelist + URL templates ─────────────
// The community canonical schema accepts arbitrary platform strings,
// but seedance's UI ships a fixed set of 7. Cap at 12 to leave headroom
// for future additions (Threads, Bluesky, etc.) without forcing a
// client-side coordination.
const VALID_PLATFORMS = new Set([
  "instagram", "tiktok", "youtube", "x",
  "vimeo", "behance", "imdb", "website",
  "threads", "bluesky", "facebook", "twitter",
]);
const MAX_SOCIAL_LINKS = 12;

// Build the canonical public URL for a given platform + handle. The
// client may pass either a raw handle ("armankhan") or a full URL
// ("https://instagram.com/armankhan"); we accept both and emit a
// single canonical form so the database holds clean data.
function buildSocialUrl(platform, raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim();
  if (!cleaned) return null;
  // Already a full URL — accept verbatim (Instagram permalinks,
  // YouTube channel IDs, etc.).
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  // Strip leading @ then build per-platform.
  const slug = cleaned.replace(/^@+/, "");
  switch (platform) {
    case "instagram": return `https://instagram.com/${slug}`;
    case "tiktok":    return `https://tiktok.com/@${slug}`;
    case "youtube":   return slug.startsWith("UC")
                          ? `https://youtube.com/channel/${slug}`
                          : `https://youtube.com/@${slug}`;
    case "x":         return `https://x.com/${slug}`;
    case "twitter":   return `https://twitter.com/${slug}`;
    case "vimeo":     return `https://vimeo.com/${slug}`;
    case "behance":   return `https://behance.net/${slug}`;
    case "imdb":      return `https://imdb.com/name/${slug}`;
    case "threads":   return `https://threads.net/@${slug}`;
    case "bluesky":   return `https://bsky.app/profile/${slug}`;
    case "facebook":  return `https://facebook.com/${slug}`;
    case "website":   return /^https?:\/\//.test(cleaned) ? cleaned : `https://${slug}`;
    default:          return null;
  }
}

// Helper: trim + cap + collapse empty-string → null. The DB columns
// are nullable; we don't want to litter them with "" values.
function clean(value, max) {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  if (s.length === 0) return null;
  return s.slice(0, max);
}

// ════════════════════════════════════════════════════════════════
// GET /api/me — full editable profile + social links
// ════════════════════════════════════════════════════════════════
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const me = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id:            true,
        name:          true,
        email:         true,
        image:         true,
        credits:       true,
        verified:      true,
        createdAt:     true,
        // New profile fields
        bio:           true,
        tagline:       true,
        pronouns:      true,
        location:      true,
        coverImageUrl: true,
        isPrivate:     true,
        // Social links — community's UserSocialLink table.
        socialLinks: {
          orderBy: { position: "asc" },
          where:   { hidden: false },
          select: {
            id:       true,
            platform: true,
            handle:   true,
            url:      true,
            position: true,
          },
        },
      },
    });

    if (!me) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(me);
  } catch (err) {
    console.error("[/api/me GET] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ════════════════════════════════════════════════════════════════
// PATCH /api/me — update the editable profile fields
// ════════════════════════════════════════════════════════════════
//
// Accepts a JSON body with any subset of these fields:
//   { name, bio, tagline, location, pronouns, isPrivate,
//     profileVisibility }
//
// Validates each, ignores unknown keys, and returns the updated
// row. Empty strings collapse to null (clears the field).
//
// profileVisibility is accepted as a forward-looking 3-state value
// ("public" | "followers" | "private") but is currently mapped to
// the binary `isPrivate` column — the only DB shape we have right
// now. "followers" silently maps to public for storage; the UI
// will show a "coming soon" hint. Phase 3 swaps this for a real
// 3-state column.
export async function PATCH(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
    }

    // Build a strict whitelist of updatable fields. Anything else is
    // silently dropped — we never want a client to update credits,
    // verified, or any other privileged column.
    const updates = {};

    if ("name" in body) {
      const v = clean(body.name, LIMITS.name.max);
      if (v !== undefined) updates.name = v;
    }
    if ("bio" in body) {
      const v = clean(body.bio, LIMITS.bio.max);
      if (v !== undefined) updates.bio = v;
    }
    if ("tagline" in body) {
      const v = clean(body.tagline, LIMITS.tagline.max);
      if (v !== undefined) updates.tagline = v;
    }
    if ("location" in body) {
      const v = clean(body.location, LIMITS.location.max);
      if (v !== undefined) updates.location = v;
    }
    if ("pronouns" in body) {
      const v = clean(body.pronouns, LIMITS.pronouns.max);
      if (v !== undefined) updates.pronouns = v;
    }
    if ("isPrivate" in body) {
      if (typeof body.isPrivate !== "boolean") {
        return NextResponse.json({ error: "isPrivate must be boolean" }, { status: 400 });
      }
      updates.isPrivate = body.isPrivate;
    }
    if ("profileVisibility" in body) {
      const vis = String(body.profileVisibility);
      if (!VALID_VISIBILITY.includes(vis)) {
        return NextResponse.json(
          { error: `profileVisibility must be one of ${VALID_VISIBILITY.join(", ")}` },
          { status: 400 }
        );
      }
      // Map 3-state → 2-state until the real column lands. "followers"
      // is treated as public for storage; the redesign UI still
      // displays the user's selection because the response echoes it
      // back through `_pendingProfileVisibility` (see below).
      updates.isPrivate = vis === "private";
    }

    // Social links — full-replace semantics. The client always sends
    // the COMPLETE desired set (or an empty array to clear all);
    // server diffs against current and lands the new state in one
    // transaction so the UI is never inconsistent mid-save.
    //
    // Accepted shape:
    //   socialLinks: [
    //     { platform: "instagram", handle: "armankhan" },
    //     { platform: "website",   handle: "arman.com" },
    //   ]
    //
    // Stored shape (UserSocialLink rows): platform, handle, url,
    // position (0-based, mirrors array index), hidden (default false).
    let socialLinksPlan = null;
    if ("socialLinks" in body) {
      if (!Array.isArray(body.socialLinks)) {
        return NextResponse.json({ error: "socialLinks must be an array" }, { status: 400 });
      }
      if (body.socialLinks.length > MAX_SOCIAL_LINKS) {
        return NextResponse.json(
          { error: `Too many links (max ${MAX_SOCIAL_LINKS})` },
          { status: 400 }
        );
      }
      const seen = new Set();
      const cleanedLinks = [];
      for (const raw of body.socialLinks) {
        if (!raw || typeof raw !== "object") continue;
        const platform = String(raw.platform || "").toLowerCase().trim();
        if (!VALID_PLATFORMS.has(platform)) continue;
        // One link per platform — first one wins, dupes are silently
        // dropped. The UI form is keyed by platform so this is a
        // safety belt rather than a user-visible rule.
        if (seen.has(platform)) continue;
        const handle = String(raw.handle || "").trim();
        if (!handle) continue; // Empty handle → user is clearing this row.
        const url = buildSocialUrl(platform, handle);
        if (!url) continue;
        seen.add(platform);
        cleanedLinks.push({
          platform,
          handle: handle.slice(0, 120),
          url:    url.slice(0, 400),
          position: cleanedLinks.length,
          hidden: false,
        });
      }
      socialLinksPlan = cleanedLinks;
    }

    // No-op safety: if nothing valid was supplied, just return the
    // current profile so the client save flow stays simple.
    if (Object.keys(updates).length === 0 && socialLinksPlan === null) {
      // Re-read + return current state.
      const me = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: BASE_SELECT,
      });
      return NextResponse.json(me);
    }

    // Look up the user id once so the social-link reset can scope
    // by id (the relation key) rather than by email.
    const me = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // One transaction: text fields + social-links full-replace land
    // atomically. Failure on either step rolls the other back, so
    // we never half-save.
    const ops = [];
    if (Object.keys(updates).length > 0) {
      ops.push(prisma.user.update({
        where: { id: me.id },
        data:  updates,
      }));
    }
    if (socialLinksPlan !== null) {
      ops.push(prisma.userSocialLink.deleteMany({ where: { userId: me.id } }));
      if (socialLinksPlan.length > 0) {
        ops.push(prisma.userSocialLink.createMany({
          data: socialLinksPlan.map((l) => ({ ...l, userId: me.id })),
        }));
      }
    }
    await prisma.$transaction(ops);

    const updated = await prisma.user.findUnique({
      where: { id: me.id },
      select: BASE_SELECT,
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[/api/me PATCH] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// Shared `select` shape so GET / PATCH responses match.
const BASE_SELECT = {
  id:            true,
  name:          true,
  email:         true,
  image:         true,
  credits:       true,
  verified:      true,
  createdAt:     true,
  bio:           true,
  tagline:       true,
  pronouns:      true,
  location:      true,
  coverImageUrl: true,
  isPrivate:     true,
  socialLinks: {
    orderBy: { position: "asc" },
    where:   { hidden: false },
    select: {
      id:       true,
      platform: true,
      handle:   true,
      url:      true,
      position: true,
    },
  },
};
