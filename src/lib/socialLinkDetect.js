/**
 * Phase 3c.5 — paste-detection for social link inputs.
 *
 * When a user pastes a full URL into ANY social field on the Edit
 * drawer, route it to the correct platform field and extract the
 * handle. e.g. pasting `https://instagram.com/foo` into the X field
 * should:
 *   • return { platform: "instagram", handle: "foo" }
 * The Edit drawer then re-routes the value: clears the X field,
 * fills the Instagram field with "foo".
 *
 * Pure module — no React, no dependencies. Both client and any
 * future server validator can call it.
 */

const PATTERNS = [
  { platform: "instagram", host: /(?:www\.)?instagram\.com/,        extract: (path) => path.replace(/^\//, "").split("/")[0] },
  { platform: "tiktok",    host: /(?:www\.)?tiktok\.com/,           extract: (path) => path.replace(/^\/@?/, "").split("/")[0] },
  { platform: "youtube",   host: /(?:www\.)?youtube\.com/,          extract: (path) => path.replace(/^\/@?/, "").split("/")[0] },
  { platform: "youtube",   host: /(?:www\.)?youtu\.be/,             extract: (path) => path.replace(/^\//, "").split("/")[0] },
  { platform: "x",         host: /(?:www\.)?x\.com/,                extract: (path) => path.replace(/^\//, "").split("/")[0] },
  { platform: "twitter",   host: /(?:www\.)?twitter\.com/,          extract: (path) => path.replace(/^\//, "").split("/")[0] },
  { platform: "vimeo",     host: /(?:www\.)?vimeo\.com/,            extract: (path) => path.replace(/^\//, "").split("/")[0] },
  { platform: "behance",   host: /(?:www\.)?behance\.net/,          extract: (path) => path.replace(/^\//, "").split("/")[0] },
  { platform: "imdb",      host: /(?:www\.)?imdb\.com/,             extract: (path) => path.replace(/^\/name\//, "").split("/")[0] },
  { platform: "threads",   host: /(?:www\.)?threads\.net/,          extract: (path) => path.replace(/^\/@?/, "").split("/")[0] },
  { platform: "bluesky",   host: /(?:www\.)?bsky\.app/,             extract: (path) => path.replace(/^\/profile\//, "").split("/")[0] },
  { platform: "facebook",  host: /(?:www\.)?facebook\.com|fb\.com/, extract: (path) => path.replace(/^\//, "").split("/")[0] },
];

/**
 * Try to recognize a pasted URL as a social handle.
 *
 *   detectSocialFromUrl("https://instagram.com/armankhan/")
 *     → { platform: "instagram", handle: "armankhan" }
 *
 *   detectSocialFromUrl("https://x.com/Arman_K?lang=en")
 *     → { platform: "x", handle: "Arman_K" }
 *
 *   detectSocialFromUrl("arman.com")
 *     → { platform: "website", handle: "arman.com" }
 *
 *   detectSocialFromUrl("plain text")
 *     → null
 */
export function detectSocialFromUrl(raw) {
  if (!raw || typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text) return null;

  // Try to parse as a URL. If it parses we get host/path; if not we
  // fall through to the "looks like a domain" heuristic for websites.
  let url;
  try {
    // Prefix https:// when the user pastes bare host like "instagram.com/foo"
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }

  for (const { platform, host, extract } of PATTERNS) {
    if (host.test(url.hostname)) {
      const handle = extract(url.pathname).replace(/^@+/, "");
      if (handle) return { platform, handle };
      return null;
    }
  }

  // Anything else with a TLD → treat as a personal website.
  if (/\./.test(url.hostname) && !/\.(local|test|example)$/.test(url.hostname)) {
    return { platform: "website", handle: url.hostname.replace(/^www\./, "") + (url.pathname === "/" ? "" : url.pathname) };
  }

  return null;
}
