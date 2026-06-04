/**
 * /u/[username] — public profile page for a Seedance creator.
 *
 * Phase 3b.2 of the profile redesign. Renders a public-safe view
 * of the user identified by the URL handle. No private fields
 * (email, credits, push prefs, geo, signupSource) ever ship.
 *
 * 404 / 410 semantics:
 *   • Unknown handle           → notFound() (clean 404)
 *   • isPrivate = true         → locked stub (no creations grid yet)
 *   • Empty profile (no bio    → still renders the hero so the
 *     /tagline / avatar)         user can claim their identity
 *
 * SEO:
 *   • generateMetadata() emits OpenGraph profile metadata + title
 *   • revalidate: 300 (5 min) — fresh enough for new uploads, cheap
 *     enough not to spam Postgres for celebrity handles
 *
 * What this page does NOT do (deferred):
 *   • Creations grid (Phase 3b.3 — needs visibility rules)
 *   • Follower/following counts (no graph exists on seedance yet)
 *   • Comment + reaction surface (community owns those)
 *   • UsernameHistory 301 redirects (Phase 3b.3)
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const revalidate = 300;

// ── Shared brand tokens (mirrors /profile) ────────────────────────
const BG          = "#0a0a0a";
const CARD        = "#111118";
const CARD_2      = "#0f0f15";
const LIME        = "#D9FF00";
const LIME_DARK   = "#A6CC00";
const TEXT        = "#FFFFFF";
const SUB         = "#94a3b8";
const MUTED       = "#64748b";
const VERIFIED    = "#e91e8c";
const HAIR        = "rgba(255,255,255,0.08)";
const LIME_RING   = "rgba(217,255,0,0.40)";

// Sole entry point: look up a user by their @handle (case-insensitive),
// return the public-safe subset only. Keeps every callsite honest.
async function findByHandle(handle) {
  if (!handle || typeof handle !== "string") return null;
  return prisma.user.findFirst({
    where: { username: { equals: handle.toLowerCase(), mode: "insensitive" } },
    select: {
      id:            true,
      name:          true,
      image:         true,
      verified:      true,
      createdAt:     true,
      bio:           true,
      tagline:       true,
      pronouns:      true,
      location:      true,
      coverImageUrl: true,
      isPrivate:     true,
      username:      true,
      socialLinks: {
        orderBy: { position: "asc" },
        where:   { hidden: false },
        select:  { platform: true, handle: true, url: true },
      },
      // Aggregate stats — Creation has no shape-of-data leak risk
      // because we only count the row, never select content.
      _count: {
        select: { creations: true },
      },
    },
  });
}

// ────────────────────────────────────────────────────────────────
// generateMetadata — OpenGraph + Twitter + page title.
// Runs per request (revalidate respected); a fresh DB call on a
// cache miss is fine because we already pay it on the page render.
// ────────────────────────────────────────────────────────────────
export async function generateMetadata({ params }) {
  const { username } = await params;
  const user = await findByHandle(username);
  if (!user) {
    return {
      title: "Handle not found · Seedance",
      robots: { index: false, follow: false },
    };
  }
  const display = user.name || `@${user.username}`;
  const headline = user.tagline ? ` · ${user.tagline}` : "";
  const summary  = user.bio || `${display} on Seedance — AI video generation.`;
  const ogImage  = user.coverImageUrl || user.image || null;
  return {
    title:       `${display} (@${user.username}) — Seedance`,
    description: summary,
    openGraph: {
      type:        "profile",
      title:       `${display}${headline}`,
      description: summary,
      url:         `https://seedance.visualseffect.com/u/${user.username}`,
      images:      ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card:        ogImage ? "summary_large_image" : "summary",
      title:       `${display} (@${user.username})`,
      description: summary,
      images:      ogImage ? [ogImage] : undefined,
    },
    alternates: {
      canonical: `https://seedance.visualseffect.com/u/${user.username}`,
    },
  };
}

// ────────────────────────────────────────────────────────────────
// PAGE
// ────────────────────────────────────────────────────────────────
export default async function PublicProfilePage({ params }) {
  const { username } = await params;
  const user = await findByHandle(username);
  if (!user) notFound();

  const display = user.name || `@${user.username}`;
  const joined = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-GB", {
        month: "long",
        year:  "numeric",
      })
    : null;
  const initials = display
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: "Inter,sans-serif" }}>
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 16px 80px" }}>
        {/* HERO */}
        <section style={{
          background: CARD,
          border: `1px solid ${HAIR}`,
          borderRadius: 20,
          overflow: "hidden",
        }}>
          {/* Cover banner */}
          <div style={{
            position: "relative",
            width: "100%",
            aspectRatio: "16 / 5",
            background: user.coverImageUrl
              ? `#000 url(${user.coverImageUrl}) center/cover no-repeat`
              : `
                  radial-gradient(120% 80% at 12% 18%, rgba(217,255,0,0.34) 0%, rgba(217,255,0,0) 55%),
                  radial-gradient(80% 100% at 85% 110%, rgba(76,29,149,0.55) 0%, rgba(76,29,149,0) 60%),
                  linear-gradient(135deg, #0c0c12 0%, #16141f 60%, #050507 100%)
                `,
          }} />

          <div style={{ position: "relative", padding: "0 28px 28px" }}>
            {/* Overlapping avatar */}
            <div style={{
              position: "absolute",
              top: -64,
              left: 28,
              width: 128,
              height: 128,
              borderRadius: "50%",
              border: `4px solid ${CARD}`,
              boxShadow: `0 0 0 2px ${LIME_RING}`,
              background: `linear-gradient(135deg, ${LIME}, ${LIME_DARK})`,
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 38,
              fontWeight: 800,
              color: "#000",
            }}>
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt={display} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span>{initials}</span>
              )}
            </div>

            <div style={{ paddingTop: 80 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <h1 style={{
                  margin: 0,
                  fontSize: "1.7rem",
                  fontWeight: 800,
                  letterSpacing: "-0.01em",
                  color: TEXT,
                  overflowWrap: "anywhere",
                }}>
                  {display}
                </h1>
                {user.verified && (
                  <span title="Verified creator" aria-label="Verified creator" style={{ display: "inline-flex" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill={VERIFIED} xmlns="http://www.w3.org/2000/svg">
                      <path d="M23 12l-2.44-2.79.34-3.69-3.61-.82-1.89-3.2L12 2.96 8.6 1.5 6.71 4.69 3.1 5.5l.34 3.7L1 12l2.44 2.79-.34 3.7 3.61.82 1.89 3.2L12 21.04l3.4 1.46 1.89-3.19 3.61-.82-.34-3.69z" />
                      <path d="M10 17l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9z" fill="white" />
                    </svg>
                  </span>
                )}
              </div>
              <div style={{ marginTop: 4, color: SUB, fontSize: ".95rem", fontWeight: 600 }}>
                @{user.username}
                {user.pronouns ? <span style={{ color: MUTED, fontSize: ".82rem", marginLeft: 8 }}>· {user.pronouns}</span> : null}
              </div>

              <div style={{
                marginTop: 12,
                display: "flex",
                flexWrap: "wrap",
                gap: 14,
                alignItems: "center",
                fontSize: ".85rem",
                color: SUB,
              }}>
                {user.tagline ? <span style={{ color: TEXT, fontWeight: 600 }}>{user.tagline}</span> : null}
                {user.location ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>📍 {user.location}</span> : null}
                {joined ? <span>Joined {joined}</span> : null}
              </div>
            </div>
          </div>
        </section>

        {/* Private profile lock — show the hero (avatar+name+@handle)
            so the URL still has identity, but no further content. */}
        {user.isPrivate ? (
          <PrivateLock username={user.username} />
        ) : (
          <div style={{
            marginTop: 20,
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) 280px",
            gap: 20,
          }} className="u-grid">
            <section style={{
              background: CARD,
              border: `1px solid ${HAIR}`,
              borderRadius: 16,
              padding: 18,
            }}>
              <h2 style={{
                margin: "0 0 10px",
                fontSize: 11,
                letterSpacing: ".12em",
                fontWeight: 800,
                textTransform: "uppercase",
                color: MUTED,
              }}>
                About
              </h2>
              <p style={{ margin: 0, color: SUB, fontSize: ".92rem", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                {user.bio || <em style={{ color: MUTED }}>This creator hasn&rsquo;t added a bio yet.</em>}
              </p>
              {/* Social chips */}
              {user.socialLinks.length > 0 && (
                <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {user.socialLinks.map((l) => (
                    <a
                      key={l.platform}
                      href={l.url}
                      target="_blank"
                      rel="noreferrer noopener"
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
              )}
            </section>

            <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <section style={{
                background: CARD,
                border: `1px solid ${HAIR}`,
                borderRadius: 16,
                padding: 18,
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".09em", color: MUTED }}>
                  Stats
                </span>
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: "1.6rem", fontWeight: 900, color: LIME, letterSpacing: "-0.01em" }}>
                    {user._count.creations.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 2, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".09em" }}>
                    Generations
                  </div>
                </div>
              </section>
              <Link href="/" style={{
                background: "transparent",
                border: `1px solid ${LIME_RING}`,
                color: LIME,
                padding: "10px 14px",
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 800,
                textAlign: "center",
                textDecoration: "none",
              }}>
                Make your own → Seedance
              </Link>
            </aside>
          </div>
        )}
      </main>

      {/* JSON-LD Person schema for richer search snippets */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context":  "https://schema.org",
            "@type":     "Person",
            name:        display,
            alternateName: `@${user.username}`,
            description: user.bio || undefined,
            image:       user.image || undefined,
            url:         `https://seedance.visualseffect.com/u/${user.username}`,
            mainEntityOfPage: `https://seedance.visualseffect.com/u/${user.username}`,
          }),
        }}
      />

      <style>{`
        @media (max-width: 880px) {
          .u-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
function PrivateLock({ username }) {
  return (
    <section style={{
      marginTop: 20,
      background: CARD,
      border: `1px solid ${HAIR}`,
      borderRadius: 16,
      padding: 40,
      textAlign: "center",
    }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 6 }}>
        @{username} is a private profile
      </div>
      <div style={{ color: SUB, fontSize: 13, maxWidth: 360, margin: "0 auto" }}>
        Their bio + creations are only visible to followers on community.
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────
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
