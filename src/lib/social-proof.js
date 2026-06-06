/**
 * Social-proof popup — server-side helpers.
 *
 * Two layers of "never repeat":
 *   1. Server (this file) — SocialProofShown table keyed by
 *      (visitorIp, shownUserId). Once we've served a popup for
 *      a given user to a given IP, future queries for that IP
 *      exclude that user.
 *   2. Client (SocialProofPopup.jsx) — localStorage list of
 *      user IDs already seen on this device. Catches same-device
 *      revisits even when the IP rotates (mobile networks).
 *
 * The two layers together make the dedupe robust against cleared
 * cookies, incognito, browser swaps, and IP changes.
 */

import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

// ── visitor IP extraction ─────────────────────────────────────────
// Order of precedence reflects how Vercel forwards the request:
//   1. x-vercel-forwarded-for  — Vercel's canonical client IP
//   2. x-forwarded-for         — first hop, comma-separated
//   3. x-real-ip               — proxy fallback
// All three normalize: strip whitespace + drop port suffixes for
// IPv6 brackets. The result is a STRING — no parsing into octets.
export async function getVisitorIp() {
  try {
    const h = await headers();
    const raw =
      h.get("x-vercel-forwarded-for") ||
      h.get("x-forwarded-for") ||
      h.get("x-real-ip") ||
      "";
    const first = raw.split(",")[0]?.trim() || "";
    if (!first) return "0.0.0.0";
    // Strip IPv6 brackets + port: "[::1]:12345" → "::1"
    return first.replace(/^\[|\]:.*$/g, "").replace(/:\d+$/, "");
  } catch {
    return "0.0.0.0";
  }
}

// ── Cache for the "never-shown to this IP" id list ────────────────
// Per-IP cache for 30 s. Most session traffic stays within this
// window so the heavy "WHERE userId NOT IN (...)" query runs ~once
// per visitor, not per-popup.
const ipCache = new Map(); // ip → { ids: Set<string>, fetchedAt: ms }
const IP_CACHE_MS = 30_000;

async function getShownIdsForIp(ip) {
  const now = Date.now();
  const cached = ipCache.get(ip);
  if (cached && now - cached.fetchedAt < IP_CACHE_MS) return cached.ids;
  const rows = await prisma.socialProofShown.findMany({
    where:  { visitorIp: ip },
    select: { shownUserId: true },
  });
  const ids = new Set(rows.map((r) => r.shownUserId));
  ipCache.set(ip, { ids, fetchedAt: now });
  // Bound the cache so a flood of unique IPs can't OOM the lambda.
  if (ipCache.size > 5000) {
    const keys = Array.from(ipCache.keys()).slice(0, 1000);
    for (const k of keys) ipCache.delete(k);
  }
  return ids;
}

// Public — invalidate one IP's cache on track-write so the next
// queue fetch reflects the just-shown user immediately.
export function invalidateIpCache(ip) {
  ipCache.delete(ip);
}

// ── Candidate pools ───────────────────────────────────────────────
// Cached at module scope so a busy homepage gets one round-trip per
// minute instead of per-request. Real signups TTL is shorter than
// dummies because the whole point is freshness on real signups.
let realCache  = { rows: null, fetchedAt: 0 };
let dummyCache = { rows: null, fetchedAt: 0 };
const REAL_TTL_MS  = 60_000;       // 60 s — fresh signups should pop fast
const DUMMY_TTL_MS = 5 * 60_000;   // 5 min — dummies barely change

// Select shape — only the fields the popup actually renders. Keeps
// payloads small + makes it obvious nothing private leaks to the
// homepage.
//
// `location` is community's free-text city/region (populated on all
// 2,000 dummies). `city` is the Vercel-geo column populated only on
// real users. The byline prefers location → city → country.
const POPUP_SELECT = {
  id:       true,
  name:     true,
  image:    true,
  location: true,
  city:     true,
  country:  true,
  verified: true,
  isDummy:  true,
  username: true,
};

async function getRealCandidates() {
  const now = Date.now();
  if (realCache.rows && now - realCache.fetchedAt < REAL_TTL_MS) return realCache.rows;
  // Real signups in the last 24 h. Pull more than we need so
  // post-dedupe we still have a healthy queue.
  const since = new Date(now - 24 * 60 * 60 * 1000);
  const rows = await prisma.user.findMany({
    where: {
      isDummy:   false,
      createdAt: { gte: since },
      name:      { not: null },
    },
    select:  POPUP_SELECT,
    orderBy: { createdAt: "desc" },
    take:    40,
  });
  realCache = { rows, fetchedAt: now };
  return rows;
}

async function getDummyCandidates() {
  const now = Date.now();
  if (dummyCache.rows && now - dummyCache.fetchedAt < DUMMY_TTL_MS) return dummyCache.rows;
  // Dummies are static-ish; cache hard. Pull up to 200 — plenty of
  // shuffle space without dragging the whole pool. We only require
  // name+image — `location` is set on all 2,000 community dummies
  // but the filter doesn't enforce it (defensive — the byline falls
  // back to first-name-only if location is missing).
  const rows = await prisma.user.findMany({
    where: {
      isDummy: true,
      name:    { not: null },
      image:   { not: null },
    },
    select: POPUP_SELECT,
    take:   200,
  });
  dummyCache = { rows, fetchedAt: now };
  return rows;
}

// ── Fisher-Yates ─────────────────────────────────────────────────
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build the popup queue for a visitor.
 *
 * @param opts.ip                 visitor IP (server-extracted)
 * @param opts.selfUserId         signed-in user's id to exclude
 *                                (null when anonymous)
 * @param opts.limit              max queue length (default 15)
 * @returns array of popup-shaped objects
 */
export async function getPopupQueue({ ip, selfUserId = null, limit = 15 } = {}) {
  const [real, dummies, shownIds] = await Promise.all([
    getRealCandidates(),
    getDummyCandidates(),
    getShownIdsForIp(ip),
  ]);

  const exclude = new Set(shownIds);
  if (selfUserId) exclude.add(selfUserId);

  const eligibleReal   = shuffle(real.filter((u) => !exclude.has(u.id)));
  const eligibleDummy  = shuffle(dummies.filter((u) => !exclude.has(u.id)));

  // Real first (they're THE point of social proof), dummies fill
  // the rest so the surface never feels dead.
  const out = [...eligibleReal, ...eligibleDummy].slice(0, limit);

  // Render-safe shape — strip isDummy so the client doesn't bake
  // any branching on it (the spec says dummy and real should look
  // indistinguishable to the visitor).
  return out.map((u) => ({
    id:       u.id,
    name:     u.name,
    image:    u.image,
    // Single resolved location string — saves the client a
    // 3-field fallback chain at render time.
    location: u.location || u.city || u.country || null,
    verified: u.verified,
    username: u.username || null,
  }));
}

/**
 * Record that a popup was shown.
 *
 * Idempotent via the UNIQUE (visitorIp, shownUserId) index — if
 * the client double-fires (network retry, sendBeacon + fetch
 * fallback both landing) we silently ignore the duplicate.
 */
export async function trackShown({ ip, userId }) {
  if (!ip || !userId) return;
  try {
    await prisma.socialProofShown.create({
      data: { visitorIp: ip, shownUserId: userId },
    });
  } catch (err) {
    // P2002 = unique constraint violation. Expected on dupes;
    // anything else worth surfacing in the log but we never
    // fail the request — popup tracking is best-effort.
    if (err?.code !== "P2002") {
      console.warn("[social-proof] trackShown:", err?.message);
    }
  } finally {
    invalidateIpCache(ip);
  }
}
