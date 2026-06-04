"use client";

/**
 * SocialChipsPublic
 *
 * Client wrapper for rendering social-link chips on the public
 * /u/[username] page (RSC). Identical visual output to the chips
 * baked into /profile, but lives in its own component so the
 * sendBeacon click tracking can fire from a server-rendered page.
 *
 * Phase 3c.5.
 */

const CARD_2 = "#0f0f15";
const TEXT   = "#FFFFFF";
const SUB    = "#94a3b8";
const HAIR   = "rgba(255,255,255,0.08)";

const SOCIAL_ICON = {
  instagram: "📷", tiktok: "♪", youtube: "▶", x: "𝕏",
  vimeo: "▷", behance: "Be", website: "🌐", imdb: "🎬",
  threads: "@", bluesky: "🦋", facebook: "f", twitter: "𝕏",
};
const LABEL_FOR_SOCIAL = {
  instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube",
  x: "X", vimeo: "Vimeo", behance: "Behance", website: "Website",
  imdb: "IMDb", threads: "Threads", bluesky: "Bluesky",
  facebook: "Facebook", twitter: "Twitter",
};

export default function SocialChipsPublic({ links }) {
  if (!Array.isArray(links) || links.length === 0) return null;
  return (
    <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 6 }}>
      {links.map((l) => (
        <a
          key={l.platform}
          href={l.url}
          target="_blank"
          rel="noreferrer noopener"
          onClick={() => {
            if (!l.id) return;
            try {
              const blob = new Blob(
                [JSON.stringify({ linkId: l.id })],
                { type: "application/json" }
              );
              if (typeof navigator !== "undefined" && navigator.sendBeacon) {
                navigator.sendBeacon("/api/social-link/click", blob);
              } else {
                fetch("/api/social-link/click", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ linkId: l.id }),
                  keepalive: true,
                }).catch(() => {});
              }
            } catch { /* never block the outbound click */ }
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 10px",
            background: CARD_2,
            border: `1px solid ${HAIR}`,
            borderRadius: 999,
            color: TEXT,
            fontSize: 11.5,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          <span aria-hidden="true">{SOCIAL_ICON[l.platform] || "🔗"}</span>
          <span style={{ color: SUB }}>{LABEL_FOR_SOCIAL[l.platform] || l.platform}</span>
        </a>
      ))}
    </div>
  );
}
