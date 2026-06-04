/**
 * Username (public @handle) validation helpers.
 *
 * Imported by both:
 *   • GET  /api/me/username/availability — real-time check
 *   • PATCH /api/me                       — change with cooldown
 *
 * Owning these in a single module means the format rules + reserved
 * word list can never drift between availability and persistence.
 */

// ── Format rules ─────────────────────────────────────────────────
// • 3-30 chars
// • allowed: lowercase letters, digits, underscore, period
// • cannot start or end with a period or underscore
// • no consecutive periods or underscores
//
// Same rules Instagram + community accept; small enough to fit in
// chips, big enough for personal handles.
export const USERNAME_RE  = /^[a-z0-9](?:[a-z0-9_.]{1,28}[a-z0-9])?$/;
export const NO_DOUBLE_RE = /__|\.\.|_\.|\._/;
export const MIN_LEN = 3;
export const MAX_LEN = 30;

// Reserved handles. App routes, brand terms, safety/legal,
// infrastructure paths, common abuse words. Add freely — the check
// is just a `.has()` so additions cost nothing.
export const RESERVED = new Set([
  // App routes
  "admin", "api", "auth", "login", "logout", "signin", "signup",
  "settings", "profile", "billing", "pricing", "checkout", "account",
  "generate", "studio", "music", "edits", "cinema", "image", "video",
  "library", "history", "feed", "explore", "home", "search", "discover",
  "demo", "u", "user", "users", "me", "@me",
  // Brand
  "visualseffect", "seedance", "vfx", "support", "help", "contact",
  // Safety/legal
  "terms", "privacy", "legal", "tos", "dmca", "abuse", "moderation",
  // Infra
  "_next", "static", "assets", "public", "favicon", "robots", "sitemap",
  // Common abuse
  "fuck", "shit", "porn", "nsfw", "cunt", "nazi",
  // Reserved for future features
  "live", "tv", "shop", "store", "ads",
]);

/**
 * Returns null if the format is fine, or a reasoned rejection
 * payload otherwise. Used by both the availability endpoint
 * (where it becomes the JSON response) and the PATCH endpoint
 * (where it becomes a 400 error).
 *
 *   formatProblem("ab")            → { reason: "format",  message: "..." }
 *   formatProblem("admin")         → { reason: "reserved", message: "..." }
 *   formatProblem("arman.khan")    → null
 */
export function formatProblem(username) {
  if (!username || typeof username !== "string") {
    return { reason: "format", message: "Pick a handle." };
  }
  if (username.length < MIN_LEN) {
    return { reason: "format", message: `At least ${MIN_LEN} characters.` };
  }
  if (username.length > MAX_LEN) {
    return { reason: "format", message: `At most ${MAX_LEN} characters.` };
  }
  if (!USERNAME_RE.test(username)) {
    return {
      reason:  "format",
      message: "Letters, numbers, underscore, period · can't start or end with . or _",
    };
  }
  if (NO_DOUBLE_RE.test(username)) {
    return {
      reason:  "format",
      message: "No consecutive periods or underscores.",
    };
  }
  if (RESERVED.has(username)) {
    return { reason: "reserved", message: "This handle is reserved." };
  }
  return null;
}

// ── Cooldown ─────────────────────────────────────────────────────
// 30 days between changes. Matches the spec ("Allow username
// change once every 30 days (prevents abuse)").
export const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Returns 0 if the user can change their username now, or the
 * number of MILLISECONDS still on the cooldown otherwise.
 *
 *   cooldownRemainingMs(null)                → 0  (never set → free)
 *   cooldownRemainingMs(yesterday)           → ~29 * 24 * 3600 * 1000
 *   cooldownRemainingMs(40 days ago)         → 0
 */
export function cooldownRemainingMs(lastChangedAt) {
  if (!lastChangedAt) return 0;
  const elapsed = Date.now() - new Date(lastChangedAt).getTime();
  return Math.max(0, COOLDOWN_MS - elapsed);
}

/** Human-friendly "12 days, 4 hours" style label for UI. */
export function cooldownLabel(ms) {
  if (ms <= 0) return "now";
  const days  = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 1)  return `${days} days`;
  if (days === 1) return hours > 0 ? `1 day, ${hours} h` : "1 day";
  if (hours > 0) return `${hours} h`;
  const mins = Math.floor(ms / (60 * 1000));
  return mins > 0 ? `${mins} min` : "soon";
}
