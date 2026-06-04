"use client";

/**
 * ProfilePage — premium creator profile (live at /profile).
 *
 * Ported from /demo/profile-v2 after Phase 2 sign-off.
 *
 * Layout map:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  Cover banner (16:9, brand gradient placeholder)         │
 *   │       ─── Avatar (overlaps cover, 128px circle, lime ring)│
 *   │  Display name [verified] + @handle                       │
 *   │  Tagline · 📍 location · joined date                     │
 *   │  Stats row: Generations · Posts · Followers · Following   │
 *   │  Primary CTAs: [Edit Profile] [Share] [⚙ Settings]       │
 *   ├──────────────────────────────────┬───────────────────────┤
 *   │  About / Bio                     │  Plan + credits       │
 *   │  Social links chips              │  +Top Up              │
 *   │  Tabs: Creations / Liked / Saved │  Referral link        │
 *   │  Tab content grid (placeholder)  │  Settings shortcut    │
 *   └──────────────────────────────────┴───────────────────────┘
 *
 * Edit Profile drawer: right-side on desktop, full-screen on mobile.
 *
 * Phase 2: real PATCH /api/me for editable text fields (name, bio,
 * tagline, location, pronouns, isPrivate).
 *
 * Phase 3a: avatar + cover both upload to Cloudflare R2 via
 * /api/me/avatar and /api/me/cover. Client-side resizes (avatar
 * 512×512, cover 1920×1080) keep payloads small; server stores
 * public CDN URLs in User.image and User.coverImageUrl. Old R2
 * objects are deleted on overwrite to keep the bucket flat. Legacy
 * base64 avatars in User.image continue to render via the same
 * <img src> until their owner re-uploads.
 */

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

// ════════════════════════════════════════════════════════════════
// BRAND TOKENS  (matches the live /profile palette exactly)
// ════════════════════════════════════════════════════════════════
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
const HAIR_STRONG = "rgba(255,255,255,0.14)";
const LIME_TINT   = "rgba(217,255,0,0.10)";
const LIME_RING   = "rgba(217,255,0,0.40)";
const RED         = "#f87171";
const GREEN       = "#4ade80";

// ════════════════════════════════════════════════════════════════
// DEMO DEFAULT PROFILE STATE
// — Real fields filled from the live session, the rest from
//   sensible defaults that show off the redesign surface.
// ════════════════════════════════════════════════════════════════
const DEFAULT_TAGLINE = "Filmmaker · AI Creator";
const DEFAULT_BIO =
  "Telling stories with light, code, and a lot of patience. " +
  "Working out of London and online — collaborations welcome.";

function deriveFirstLast(name) {
  if (!name) return { first: "", last: "" };
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function deriveHandle(name, email) {
  const base =
    (name || "").toLowerCase().replace(/[^a-z0-9]+/g, "") ||
    (email || "").split("@")[0]?.toLowerCase().replace(/[^a-z0-9]+/g, "") ||
    "user";
  return base.slice(0, 18);
}

// Canonical default shape for the form's social-link object. Keyed
// by platform so the 7 inputs always render in the same order.
function d_socialLinksDefault() {
  return {
    instagram: "",
    tiktok:    "",
    youtube:   "",
    x:         "",
    vimeo:     "",
    behance:   "",
    website:   "",
  };
}

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
export default function ProfilePage() {
  const { data: session, status } = useSession();
  const [profile, setProfile]   = useState(null);
  const [activeTab, setActiveTab] = useState("creations");
  const [editOpen, setEditOpen] = useState(false);
  const [toast, setToast]       = useState(null);

  // Pull the editable profile from /api/me (Phase 2 endpoint that
  // returns bio + tagline + location + pronouns + coverImageUrl +
  // isPrivate + socialLinks). Separate from /api/user/profile which
  // is read-only and computes generation stats.
  const refetchProfile = async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      if (res.ok) setProfile(await res.json());
    } catch (e) {
      console.error("[profile-v2] /api/me fetch error:", e);
    }
  };
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (!cancelled && res.ok) setProfile(await res.json());
      } catch (e) {
        console.error("[profile-v2] /api/me fetch error:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [session]);

  // ── derive base fields from session + profile ────────────────
  const realName   = profile?.name  || session?.user?.name  || "Your Name";
  const realEmail  = profile?.email || session?.user?.email || "";
  const realImage  = profile?.image || session?.user?.image || null;
  const credits    = profile?.credits ?? session?.user?.credits ?? 0;
  const verified   = !!profile?.verified;
  const createdAt  = profile?.createdAt;
  const { first: derivedFirst, last: derivedLast } = deriveFirstLast(realName);

  // ── Editable demo state ───────────────────────────────────────
  // Phase 2 will swap this for a fetch + PATCH against /api/me.
  // For now everything lives in component state so the redesign
  // can be reviewed end-to-end without touching the DB.
  const [draft, setDraft] = useState({
    firstName:  derivedFirst,
    lastName:   derivedLast,
    displayName: realName,
    username:   deriveHandle(realName, realEmail),
    pronouns:   "",
    bio:        DEFAULT_BIO,
    tagline:    DEFAULT_TAGLINE,
    location:   "",
    languages:  ["English"],
    socialLinks: {
      instagram: "",
      tiktok:    "",
      youtube:   "",
      x:         "",
      vimeo:     "",
      behance:   "",
      website:   "",
    },
    privacy: {
      profile:     "public",          // public | followers | private
      hideStats:   false,
      hideSocials: false,
    },
    notifications: {
      emailReplies:    true,
      emailFollowers:  true,
      emailMarketing:  false,
      pushVideoReady:  true,
      pushFeatured:    true,
    },
    cover: null, // R2 upload deferred — gradient placeholder used.
    avatar: realImage,
  });

  // Sync derived fields back into the draft once profile loads
  // (only the first time so a user editing them isn't overridden).
  // Phase 2: also seed bio / tagline / location / pronouns / privacy
  // from /api/me so the edit drawer starts pre-populated with the
  // user's already-saved values.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (!profile && !session) return;
    seededRef.current = true;
    // Convert profile.socialLinks (array of UserSocialLink rows from
    // /api/me) → flat object the form is keyed on. Unknown platforms
    // are silently dropped so the form always renders the same 7
    // fields regardless of what's in the DB.
    const seededLinks = { ...d_socialLinksDefault() };
    if (Array.isArray(profile?.socialLinks)) {
      for (const row of profile.socialLinks) {
        if (row?.platform && row.platform in seededLinks) {
          seededLinks[row.platform] = row.handle || "";
        }
      }
    }
    setDraft((d) => ({
      ...d,
      firstName:   derivedFirst   || d.firstName,
      lastName:    derivedLast    || d.lastName,
      displayName: realName       || d.displayName,
      username:    deriveHandle(realName, realEmail) || d.username,
      avatar:      realImage      || d.avatar,
      // Real DB-backed values when present, else keep the demo
      // placeholders so the surface still looks alive on first view.
      bio:         profile?.bio        ?? d.bio,
      tagline:     profile?.tagline    ?? d.tagline,
      location:    profile?.location   ?? d.location,
      pronouns:    profile?.pronouns   ?? d.pronouns,
      socialLinks: seededLinks,
      privacy: {
        ...d.privacy,
        profile: profile?.isPrivate ? "private" : "public",
      },
    }));
  }, [profile, session, derivedFirst, derivedLast, realName, realEmail, realImage]);

  // Client-side resize helper. Reads the file, draws into a canvas
  // capped at MAX on the long edge, encodes as JPEG, and returns the
  // resulting Blob. Keeps the network payload small without forcing
  // server-side image processing.
  const resizeToBlob = async (file, MAX, quality = 0.85) => {
    const rawDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.onload  = (ev) => resolve(ev.target.result);
      reader.readAsDataURL(file);
    });
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not decode image"));
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > MAX || height > MAX) {
            if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
            else                { width  = Math.round(width  * MAX / height); height = MAX; }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => blob ? resolve(blob) : reject(new Error("Canvas blob conversion failed")),
            "image/jpeg",
            quality
          );
        } catch (e) { reject(e); }
      };
      img.src = rawDataUrl;
    });
  };

  // Avatar upload → Cloudflare R2 via /api/me/avatar.
  // Client-resizes to 512×512 (retina-friendly for the 128 px hero
  // circle), uploads as multipart, server returns the public URL,
  // hero updates immediately + /api/me re-fetches for canonical state.
  const [avatarUploading, setAvatarUploading] = useState(false);
  // Hidden file input for the in-hero "Edit cover" button (lets the
  // user replace the banner in one tap without opening the drawer).
  const heroCoverInputRef = useRef(null);
  const handleAvatarChange = async (file) => {
    if (!file || avatarUploading) return;
    setAvatarUploading(true);
    try {
      const blob = await resizeToBlob(file, 512, 0.85);
      const form = new FormData();
      form.append("file", blob, "avatar.jpg");
      const res = await fetch("/api/me/avatar", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setToast({ kind: "err", text: data.error || `Upload failed (HTTP ${res.status})` });
        setTimeout(() => setToast(null), 3600);
        return;
      }
      const data = await res.json();
      setDraft((d) => ({ ...d, avatar: data.image }));
      await refetchProfile();
      setToast({ kind: "ok", text: "Avatar updated · live on community, music, edits too" });
      setTimeout(() => setToast(null), 2600);
    } catch (err) {
      console.error("[profile] avatar upload error:", err);
      setToast({ kind: "err", text: err?.message || "Upload failed — try a smaller image." });
      setTimeout(() => setToast(null), 3600);
    } finally {
      setAvatarUploading(false);
    }
  };

  // Cover banner upload → /api/me/cover. Resizes to 1920×1080 max
  // (16:9 cinematic) at 0.85 quality. We don't enforce 16:9 — any
  // aspect lands gracefully via object-fit: cover.
  const [coverUploading, setCoverUploading] = useState(false);
  const handleCoverChange = async (file) => {
    if (!file || coverUploading) return;
    setCoverUploading(true);
    try {
      const blob = await resizeToBlob(file, 1920, 0.85);
      const form = new FormData();
      form.append("file", blob, "cover.jpg");
      const res = await fetch("/api/me/cover", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setToast({ kind: "err", text: data.error || `Cover upload failed (HTTP ${res.status})` });
        setTimeout(() => setToast(null), 3600);
        return;
      }
      const data = await res.json();
      // Refresh /api/me so profile.coverImageUrl propagates into the
      // hero banner render path.
      await refetchProfile();
      setToast({ kind: "ok", text: "Cover banner updated · live everywhere" });
      setTimeout(() => setToast(null), 2600);
      return data.coverImageUrl;
    } catch (err) {
      console.error("[profile] cover upload error:", err);
      setToast({ kind: "err", text: err?.message || "Cover upload failed — try a smaller image." });
      setTimeout(() => setToast(null), 3600);
    } finally {
      setCoverUploading(false);
    }
  };

  // PATCH /api/me with the editable subset, then re-fetch so the
  // hero updates without a page reload. Shows a real toast — green
  // on success, red on validation/server error.
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name:              draft.displayName,
          bio:               draft.bio,
          tagline:           draft.tagline,
          location:          draft.location,
          pronouns:          draft.pronouns,
          profileVisibility: draft.privacy.profile,
          // Flatten { instagram: "armankhan", tiktok: "", ... } →
          // [{ platform: "instagram", handle: "armankhan" }, ...].
          // Empty handles are dropped server-side; sending the full
          // set including empties signals "this is the COMPLETE
          // desired state" (full-replace semantics).
          socialLinks: Object.entries(draft.socialLinks)
            .map(([platform, handle]) => ({
              platform,
              handle: String(handle || "").trim(),
            }))
            .filter((l) => l.handle.length > 0),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setToast({ kind: "err", text: data.error || `Save failed (HTTP ${res.status})` });
        setTimeout(() => setToast(null), 3600);
        return;
      }
      // Refresh from the server so the hero card picks up the
      // canonical values (server-side trim + length caps applied).
      await refetchProfile();
      setToast({ kind: "ok", text: "Profile saved · community + music + edits see it on next render" });
      setEditOpen(false);
      setTimeout(() => setToast(null), 3200);
    } catch (err) {
      console.error("[profile-v2] save error:", err);
      setToast({ kind: "err", text: "Save failed — check your connection and try again." });
      setTimeout(() => setToast(null), 3600);
    } finally {
      setSaving(false);
    }
  };

  // ── Loading + signed-out shells ──────────────────────────────
  if (status === "loading") {
    return <Center>Loading…</Center>;
  }
  if (!session) {
    return (
      <Center>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: MUTED, marginBottom: 16 }}>
            Sign in to preview the new profile.
          </p>
          <Link href="/" style={{ color: LIME, fontWeight: 600, textDecoration: "none" }}>
            ← Back to home
          </Link>
        </div>
      </Center>
    );
  }

  // ── joined-since string ──────────────────────────────────────
  const joined = createdAt
    ? new Date(createdAt).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      })
    : "—";

  const headlineName = draft.displayName || realName;
  const initials = headlineName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: "Inter,sans-serif" }}>
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 16px 80px" }}>
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* HERO: cover banner + avatar + name block             */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section style={{
          background: CARD,
          border: `1px solid ${HAIR}`,
          borderRadius: 20,
          overflow: "hidden",
        }}>
          {/* Cover banner — uses the user's uploaded image if set,
              otherwise falls back to the brand-aligned aurora gradient
              so a fresh account still feels polished. The hidden file
              input under the button lets the user replace it in one
              tap without opening the Edit drawer. */}
          {(() => {
            const coverUrl = profile?.coverImageUrl;
            return (
              <div style={{
                position: "relative",
                width: "100%",
                aspectRatio: "16 / 5",
                background: coverUrl
                  ? `#000 url(${coverUrl}) center/cover no-repeat`
                  : `
                      radial-gradient(120% 80% at 12% 18%, rgba(217,255,0,0.34) 0%, rgba(217,255,0,0) 55%),
                      radial-gradient(80% 100% at 85% 110%, rgba(76,29,149,0.55) 0%, rgba(76,29,149,0) 60%),
                      linear-gradient(135deg, #0c0c12 0%, #16141f 60%, #050507 100%)
                    `,
              }}>
                {/* Edit-cover — opens the file picker inline */}
                <button
                  type="button"
                  onClick={() => heroCoverInputRef.current?.click()}
                  disabled={coverUploading}
                  style={{
                    position: "absolute",
                    right: 12,
                    bottom: 12,
                    background: "rgba(0,0,0,0.55)",
                    border: `1px solid ${HAIR_STRONG}`,
                    color: TEXT,
                    padding: "8px 14px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: coverUploading ? "wait" : "pointer",
                    fontFamily: "inherit",
                    backdropFilter: "blur(6px)",
                    WebkitBackdropFilter: "blur(6px)",
                    opacity: coverUploading ? 0.7 : 1,
                  }}
                >
                  {coverUploading
                    ? "Uploading…"
                    : coverUrl ? "📷 Change cover" : "📷 Add cover"}
                </button>
                <input
                  ref={heroCoverInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleCoverChange(f);
                    if (e.target) e.target.value = "";
                  }}
                />
              </div>
            );
          })()}

          {/* Identity block — sits below cover, avatar overlaps */}
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
              {draft.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={draft.avatar}
                  alt={headlineName}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span>{initials}</span>
              )}
            </div>

            {/* Top row: name/handle/tagline OR edit/share/settings */}
            <div style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "flex-start",
              paddingTop: 80,
            }}>
              {/* Left — identity column */}
              <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <h1 style={{
                    margin: 0,
                    fontSize: "1.7rem",
                    fontWeight: 800,
                    letterSpacing: "-0.01em",
                    color: TEXT,
                    overflowWrap: "anywhere",
                  }}>
                    {headlineName}
                  </h1>
                  {verified && (
                    <VerifiedBadge />
                  )}
                </div>
                <div style={{ marginTop: 4, color: SUB, fontSize: ".95rem", fontWeight: 600 }}>
                  @{draft.username}
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
                  {draft.tagline && (
                    <span style={{ color: TEXT, fontWeight: 600 }}>{draft.tagline}</span>
                  )}
                  {draft.location && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span aria-hidden="true">📍</span> {draft.location}
                    </span>
                  )}
                  <span>Joined {joined}</span>
                </div>
              </div>

              {/* Right — primary actions */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  style={primaryBtn}
                >
                  Edit profile
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.clipboard) {
                      navigator.clipboard.writeText(`https://seedance.visualseffect.com/@${draft.username}`);
                      setToast({ kind: "ok", text: "Profile link copied" });
                      setTimeout(() => setToast(null), 1600);
                    }
                  }}
                  style={ghostBtn}
                >
                  Share
                </button>
                <button type="button" style={ghostIconBtn} aria-label="Settings">
                  ⚙
                </button>
              </div>
            </div>

            {/* Stats row */}
            <div style={{
              marginTop: 22,
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 10,
              borderTop: `1px solid ${HAIR}`,
              paddingTop: 18,
            }}>
              <Stat label="Generations" value={(profile?.videosGenerated ?? 0).toLocaleString()} />
              <Stat label="Posts" value="—" />
              <Stat label="Followers" value="—" />
              <Stat label="Following" value="—" />
            </div>
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* BODY: left content column + right sidebar            */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 20, marginTop: 20 }}
             className="profile-v2-grid">
          {/* LEFT COLUMN */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
            {/* About / Bio */}
            <Card title="About">
              <p style={{ margin: 0, color: SUB, fontSize: ".92rem", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                {draft.bio || (
                  <em style={{ color: MUTED }}>
                    Add a bio so people know what you create. Click <strong>Edit profile</strong> to add one.
                  </em>
                )}
              </p>

              {/* Social link chips */}
              {/* Reads from the SAVED profile (array of UserSocialLink
                  rows), not the in-progress drawer edits — so chips
                  always reflect what's actually in the DB. */}
              <SocialChips links={profile?.socialLinks || []} />
            </Card>

            {/* Tabs */}
            <Card noPadding>
              <div style={{
                display: "flex",
                gap: 4,
                borderBottom: `1px solid ${HAIR}`,
                overflowX: "auto",
                padding: "0 4px",
              }}>
                {TABS.map((t) => (
                  <TabButton
                    key={t.key}
                    active={activeTab === t.key}
                    onClick={() => setActiveTab(t.key)}
                  >
                    {t.icon} {t.label}
                  </TabButton>
                ))}
              </div>

              {/* Tab content — Phase 1 = placeholder tile grid + hint */}
              <div style={{ padding: 18 }}>
                {activeTab === "creations" ? (
                  <PlaceholderGrid
                    count={(profile?.videosGenerated ?? 0)}
                    label="Wired up in Phase 2 — pulls your real generation history into 16:9 tiles."
                  />
                ) : (
                  <EmptyTab
                    icon={TABS.find((t) => t.key === activeTab)?.icon}
                    title={TABS.find((t) => t.key === activeTab)?.label}
                    blurb={TAB_BLURB[activeTab]}
                  />
                )}
              </div>
            </Card>
          </div>

          {/* RIGHT SIDEBAR */}
          <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}
                 className="profile-v2-sidebar">
            {/* Plan + credits */}
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".09em", color: MUTED }}>
                  Plan
                </span>
                <span style={{
                  background: LIME_TINT,
                  color: LIME,
                  fontSize: 11,
                  fontWeight: 800,
                  padding: "3px 8px",
                  borderRadius: 999,
                  border: `1px solid ${LIME_RING}`,
                }}>
                  Free
                </span>
              </div>
              <p style={{ margin: "10px 0 0", color: SUB, fontSize: 12.5 }}>
                Upgrade for higher resolutions, longer videos, and priority queue.
              </p>

              <div style={{
                marginTop: 14,
                padding: "12px 14px",
                background: LIME_TINT,
                border: `1px solid ${LIME_RING}`,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".09em" }}>
                    Credits
                  </div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 900, color: LIME, marginTop: 2 }}>
                    ⚡ {credits.toLocaleString()}
                  </div>
                </div>
                <Link href="/pricing" style={topUpBtn}>+ Top Up</Link>
              </div>
            </Card>

            {/* Referral */}
            <Card>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".09em", color: MUTED }}>
                Refer a friend
              </span>
              <p style={{ margin: "8px 0 12px", color: SUB, fontSize: 12.5, lineHeight: 1.5 }}>
                You and your friend both earn credits when they make their first video.
              </p>
              <div style={{
                display: "flex", gap: 8, alignItems: "center",
                background: CARD_2,
                border: `1px solid ${HAIR}`,
                borderRadius: 10,
                padding: "8px 10px",
              }}>
                <code style={{
                  flex: 1,
                  fontSize: 11.5,
                  color: TEXT,
                  fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  seedance.visualseffect.com/?ref={draft.username}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.clipboard) {
                      navigator.clipboard.writeText(`https://seedance.visualseffect.com/?ref=${draft.username}`);
                      setToast({ kind: "ok", text: "Referral link copied" });
                      setTimeout(() => setToast(null), 1600);
                    }
                  }}
                  style={copyBtn}
                >
                  Copy
                </button>
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: MUTED }}>
                <strong style={{ color: TEXT }}>0</strong> friends signed up so far.
              </div>
            </Card>

            {/* Account shortcut */}
            <Card>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".09em", color: MUTED }}>
                Account
              </span>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <SettingsRow icon="🔔" label="Notifications" hint={summarizeNotifs(draft.notifications)} onClick={() => setEditOpen(true)} />
                <SettingsRow icon="🔒" label="Privacy"        hint={summarizePrivacy(draft.privacy)}     onClick={() => setEditOpen(true)} />
                <SettingsRow icon="✉"  label="Email"          hint={realEmail || "—"}                     onClick={() => setEditOpen(true)} />
                <SettingsRow icon="🔑" label="Password"       hint="Change password"                      onClick={() => setEditOpen(true)} />
                <SettingsRow icon="🛡" label="Two-factor auth" hint="Not enabled"                          onClick={() => setEditOpen(true)} />
              </div>
            </Card>
          </aside>
        </div>

      </main>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* EDIT PROFILE MODAL — drawer on desktop, sheet on mobile */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {editOpen && (
        <EditProfileDrawer
          draft={draft}
          setDraft={setDraft}
          onClose={() => setEditOpen(false)}
          onSave={handleSave}
          onAvatarChange={handleAvatarChange}
          avatarUploading={avatarUploading}
          onCoverChange={handleCoverChange}
          coverUploading={coverUploading}
          currentCoverUrl={profile?.coverImageUrl || null}
        />
      )}

      {/* Toast */}
      {toast && (
        <div role="status" style={{
          position: "fixed",
          bottom: 22,
          left: "50%",
          transform: "translateX(-50%)",
          background: "#0b0b10",
          border: `1px solid ${toast.kind === "ok" ? LIME_RING : "rgba(248,113,113,0.45)"}`,
          color: toast.kind === "ok" ? LIME : RED,
          padding: "10px 16px",
          borderRadius: 12,
          fontSize: 13,
          fontWeight: 700,
          zIndex: 90,
          boxShadow: "0 12px 32px rgba(0,0,0,0.55)",
        }}>
          {toast.text}
        </div>
      )}

      {/* Responsive: collapse to single column on phone */}
      <style>{`
        @media (max-width: 880px) {
          .profile-v2-grid {
            grid-template-columns: 1fr !important;
          }
          .profile-v2-sidebar {
            order: 2;
          }
        }
      `}</style>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ════════════════════════════════════════════════════════════════

const TABS = [
  { key: "creations",   label: "Creations",   icon: "🎬" },
  { key: "liked",       label: "Liked",       icon: "♥"  },
  { key: "saved",       label: "Saved",       icon: "🔖" },
  { key: "collections", label: "Collections", icon: "📁" },
  { key: "prompts",     label: "Prompts",     icon: "✦"  },
];

const TAB_BLURB = {
  liked:       "Posts and videos you've liked show up here.",
  saved:       "Save prompts, references, and inspiration for later.",
  collections: "Group your best work into curated collections.",
  prompts:     "Prompts you've shared with the community will appear here once Prompt Library ships.",
};

function Center({ children }) {
  return (
    <div style={{
      minHeight: "100vh",
      background: BG,
      color: TEXT,
      fontFamily: "Inter,sans-serif",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      {children}
    </div>
  );
}

function Card({ title, children, noPadding = false }) {
  return (
    <section style={{
      background: CARD,
      border: `1px solid ${HAIR}`,
      borderRadius: 16,
      padding: noPadding ? 0 : 18,
    }}>
      {title && (
        <h2 style={{
          margin: "0 0 10px",
          fontSize: 11,
          letterSpacing: ".12em",
          fontWeight: 800,
          textTransform: "uppercase",
          color: MUTED,
        }}>
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: "1.2rem", fontWeight: 800, color: TEXT, letterSpacing: "-0.01em" }}>
        {value}
      </div>
      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 2, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".09em" }}>
        {label}
      </div>
    </div>
  );
}

function VerifiedBadge() {
  return (
    <span title="Verified creator" aria-label="Verified creator" style={{ display: "inline-flex" }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill={VERIFIED} xmlns="http://www.w3.org/2000/svg">
        <path d="M23 12l-2.44-2.79.34-3.69-3.61-.82-1.89-3.2L12 2.96 8.6 1.5 6.71 4.69 3.1 5.5l.34 3.7L1 12l2.44 2.79-.34 3.7 3.61.82 1.89 3.2L12 21.04l3.4 1.46 1.89-3.19 3.61-.82-.34-3.69z" />
        <path d="M10 17l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9z" fill="white" />
      </svg>
    </span>
  );
}

// SocialChips renders the SAVED social-link rows from /api/me. It
// accepts either the array shape returned by /api/me (preferred —
// rows include the server-computed canonical URL) or the flat
// { platform: handle } object the Edit-drawer form uses (back-
// compat). Empty handles + unknown platforms are filtered out.
function SocialChips({ links }) {
  const rows = Array.isArray(links)
    ? links
        .filter((l) => l && l.platform && (l.url || l.handle))
        .map((l) => ({
          platform: l.platform,
          // Prefer the server-computed url; fall back to client-side
          // normalize for the (rare) case where someone passes raw
          // draft state.
          href: l.url || normalizeLink(l.platform, l.handle),
        }))
    : Object.entries(links || {})
        .filter(([, v]) => v)
        .map(([platform, handle]) => ({
          platform,
          href: normalizeLink(platform, handle),
        }));

  if (rows.length === 0) {
    return (
      <div style={{ marginTop: 14, fontSize: 12, color: MUTED, fontStyle: "italic" }}>
        No social links added yet.
      </div>
    );
  }
  return (
    <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
      {rows.map((r) => (
        <a
          key={r.platform}
          href={r.href}
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
          <span aria-hidden="true">{SOCIAL_ICON[r.platform]}</span>
          <span style={{ color: SUB }}>{LABEL_FOR_SOCIAL[r.platform] || r.platform}</span>
        </a>
      ))}
    </div>
  );
}

const SOCIAL_ICON = {
  instagram: "📷",
  tiktok:    "♪",
  youtube:   "▶",
  x:         "𝕏",
  vimeo:     "▷",
  behance:   "Be",
  website:   "🌐",
};

const LABEL_FOR_SOCIAL = {
  instagram: "Instagram",
  tiktok:    "TikTok",
  youtube:   "YouTube",
  x:         "X",
  vimeo:     "Vimeo",
  behance:   "Behance",
  website:   "Website",
};

function normalizeLink(platform, raw) {
  if (!raw) return "#";
  if (raw.startsWith("http")) return raw;
  if (platform === "website") return `https://${raw}`;
  return `https://${platform}.com/${raw.replace(/^@/, "")}`;
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        color: active ? TEXT : SUB,
        padding: "14px 14px",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        position: "relative",
        whiteSpace: "nowrap",
        fontFamily: "inherit",
        borderBottom: active ? `2px solid ${LIME}` : "2px solid transparent",
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}

function PlaceholderGrid({ count, label }) {
  // Show 6 placeholder tiles to convey the surface.
  const tiles = Array.from({ length: 6 }, (_, i) => i);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
        {tiles.map((i) => (
          <div key={i} style={{
            aspectRatio: "16/9",
            borderRadius: 10,
            background: `linear-gradient(135deg, rgba(217,255,0,${0.06 + (i % 3) * 0.04}), rgba(76,29,149,${0.18 + (i % 3) * 0.05}))`,
            border: `1px solid ${HAIR}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: MUTED,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".08em",
            textTransform: "uppercase",
          }}>
            placeholder
          </div>
        ))}
      </div>
      <p style={{ marginTop: 12, fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
        <strong style={{ color: TEXT }}>You have {count.toLocaleString()} generation(s).</strong>{" "}
        {label}
      </p>
    </div>
  );
}

function EmptyTab({ icon, title, blurb }) {
  return (
    <div style={{
      padding: "40px 20px",
      textAlign: "center",
      color: SUB,
      fontSize: 13.5,
    }}>
      <div style={{ fontSize: 30, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontWeight: 700, color: TEXT, fontSize: 15, marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ color: MUTED, maxWidth: 380, margin: "0 auto" }}>{blurb}</div>
    </div>
  );
}

function SettingsRow({ icon, label, hint, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{
      background: CARD_2,
      border: `1px solid ${HAIR}`,
      borderRadius: 10,
      padding: "10px 12px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      color: TEXT,
      cursor: "pointer",
      fontFamily: "inherit",
      textAlign: "left",
    }}>
      <span style={{ fontSize: 16, width: 22, textAlign: "center" }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {hint}
        </div>
      </div>
      <span style={{ color: MUTED, fontSize: 14 }}>›</span>
    </button>
  );
}

function summarizeNotifs(n) {
  const on = Object.values(n).filter(Boolean).length;
  return `${on} of ${Object.keys(n).length} enabled`;
}
function summarizePrivacy(p) {
  if (p.profile === "private") return "Private profile";
  if (p.profile === "followers") return "Followers only";
  return "Public profile";
}

// ════════════════════════════════════════════════════════════════
// EDIT PROFILE DRAWER
// ════════════════════════════════════════════════════════════════
function EditProfileDrawer({
  draft,
  setDraft,
  onClose,
  onSave,
  onAvatarChange,
  avatarUploading,
  onCoverChange,
  coverUploading,
  currentCoverUrl,
}) {
  const titleId = useId();
  const fileInputRef = useRef(null);
  const coverInputRef = useRef(null);

  // iOS Safari-safe scroll lock (same recipe as the ref-guide modal).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const scrollY = window.scrollY;
    const prev = {
      position: document.body.style.position,
      top:      document.body.style.top,
      width:    document.body.style.width,
      overflow: document.body.style.overflow,
    };
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.position = prev.position;
      document.body.style.top = prev.top;
      document.body.style.width = prev.width;
      document.body.style.overflow = prev.overflow;
      window.scrollTo({ top: scrollY, left: 0, behavior: "instant" });
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (path, value) => {
    setDraft((d) => {
      const keys = path.split(".");
      const next = structuredClone(d);
      let cursor = next;
      for (let i = 0; i < keys.length - 1; i++) cursor = cursor[keys[i]];
      cursor[keys[keys.length - 1]] = value;
      return next;
    });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        zIndex: 85,
        display: "flex",
        justifyContent: "flex-end",
        animation: "fadeIn 200ms ease-out",
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideIn {
          from { transform: translateX(100%) }
          to   { transform: translateX(0) }
        }
        @keyframes riseIn {
          from { transform: translateY(100%) }
          to   { transform: translateY(0) }
        }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          width: "min(540px, 100%)",
          height: "100%",
          background: CARD,
          borderLeft: `1px solid ${HAIR}`,
          display: "flex",
          flexDirection: "column",
          animation: "slideIn 280ms cubic-bezier(0.2,0.9,0.2,1)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: `1px solid ${HAIR}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <h2 id={titleId} style={{ margin: 0, fontSize: 16, fontWeight: 800, color: TEXT }}>
            Edit profile
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{
            width: 32, height: 32, borderRadius: 999,
            border: "none",
            background: "rgba(255,255,255,0.06)",
            color: TEXT,
            fontSize: 18,
            cursor: "pointer",
            fontFamily: "inherit",
          }}>
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px 20px",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
        }}>
          {/* Avatar + cover row */}
          <Section title="Media">
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{
                width: 72, height: 72, borderRadius: "50%",
                background: draft.avatar
                  ? `url(${draft.avatar}) center/cover`
                  : `linear-gradient(135deg, ${LIME}, ${LIME_DARK})`,
                border: `2px solid ${LIME_RING}`,
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <button
                  type="button"
                  style={smallBtn}
                  disabled={avatarUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {avatarUploading ? "Uploading…" : "Change avatar"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onAvatarChange?.(f);
                    // Reset so picking the same file twice still fires onChange
                    if (e.target) e.target.value = "";
                  }}
                />
                <p style={fineHint}>JPG, PNG or WebP · resized to 250×250 · saves instantly.</p>
              </div>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              {/* Cover thumbnail — shows current cover or gradient placeholder */}
              <div style={{
                width: 96,
                aspectRatio: "16 / 9",
                borderRadius: 8,
                background: currentCoverUrl
                  ? `#000 url(${currentCoverUrl}) center/cover no-repeat`
                  : `linear-gradient(135deg, rgba(217,255,0,0.3), rgba(76,29,149,0.55))`,
                border: `1px solid ${HAIR_STRONG}`,
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <button
                  type="button"
                  style={smallBtn}
                  disabled={coverUploading}
                  onClick={() => coverInputRef.current?.click()}
                >
                  {coverUploading
                    ? "Uploading…"
                    : currentCoverUrl ? "Change cover banner" : "Add cover banner"}
                </button>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onCoverChange?.(f);
                    if (e.target) e.target.value = "";
                  }}
                />
                <p style={fineHint}>16:9 cinematic · resized to 1920×1080 · saves instantly.</p>
              </div>
            </div>
          </Section>

          {/* Identity */}
          <Section title="Identity">
            <Row>
              <Field label="First name" value={draft.firstName} onChange={(v) => {
                set("firstName", v);
                // Auto-sync display name unless user has customised it
                const dn = `${v} ${draft.lastName}`.trim();
                set("displayName", dn);
              }} />
              <Field label="Last name" value={draft.lastName} onChange={(v) => {
                set("lastName", v);
                const dn = `${draft.firstName} ${v}`.trim();
                set("displayName", dn);
              }} />
            </Row>
            <Field label="Display name" value={draft.displayName} onChange={(v) => set("displayName", v)}
                   hint="How your name appears on posts + videos." />
            <Field
              label="Username (@handle)"
              value={draft.username}
              onChange={(v) => set("username", v.replace(/[^a-z0-9_]/gi, "").toLowerCase())}
              prefix="@"
              hint="3-18 chars · letters, numbers, underscores. Can be changed once every 30 days."
            />
            <SelectField
              label="Pronouns"
              value={draft.pronouns}
              onChange={(v) => set("pronouns", v)}
              options={[
                { value: "", label: "Prefer not to say" },
                { value: "she/her", label: "she / her" },
                { value: "he/him", label: "he / him" },
                { value: "they/them", label: "they / them" },
                { value: "custom", label: "Custom…" },
              ]}
            />
          </Section>

          {/* Profile */}
          <Section title="Profile">
            <Field
              label="Tagline"
              value={draft.tagline}
              onChange={(v) => set("tagline", v.slice(0, 80))}
              hint={`${draft.tagline.length}/80 · one-liner shown under your name`}
            />
            <TextareaField
              label="Bio"
              value={draft.bio}
              onChange={(v) => set("bio", v.slice(0, 500))}
              hint={`${draft.bio.length}/500`}
            />
            <Field label="Location" value={draft.location}
                   onChange={(v) => set("location", v)}
                   hint="City, country (optional)" placeholder="London, UK" />
          </Section>

          {/* Social */}
          <Section title="Social links">
            {Object.keys(draft.socialLinks).map((k) => (
              <Field
                key={k}
                label={LABEL_FOR_SOCIAL[k] || k}
                value={draft.socialLinks[k]}
                onChange={(v) => set(`socialLinks.${k}`, v)}
                prefix={SOCIAL_ICON[k]}
                placeholder={
                  k === "website" ? "yoursite.com" :
                  k === "x" ? "@username" :
                  `@username on ${LABEL_FOR_SOCIAL[k]}`
                }
              />
            ))}
            <p style={fineHint}>
              Drag-to-reorder lands in Phase 2 once these persist.
            </p>
          </Section>

          {/* Privacy */}
          <Section title="Privacy">
            <SelectField
              label="Who can see your profile"
              value={draft.privacy.profile}
              onChange={(v) => set("privacy.profile", v)}
              options={[
                { value: "public",    label: "Public · anyone can view" },
                { value: "followers", label: "Followers only" },
                { value: "private",   label: "Private · only you" },
              ]}
            />
            <CheckboxField
              label="Hide stats (followers, generations, etc.)"
              checked={draft.privacy.hideStats}
              onChange={(v) => set("privacy.hideStats", v)}
            />
            <CheckboxField
              label="Hide social links from public view"
              checked={draft.privacy.hideSocials}
              onChange={(v) => set("privacy.hideSocials", v)}
            />
          </Section>

          {/* Notifications */}
          <Section title="Notifications">
            <CheckboxField
              label="Email me about replies + mentions"
              checked={draft.notifications.emailReplies}
              onChange={(v) => set("notifications.emailReplies", v)}
            />
            <CheckboxField
              label="Email me when I get new followers"
              checked={draft.notifications.emailFollowers}
              onChange={(v) => set("notifications.emailFollowers", v)}
            />
            <CheckboxField
              label="Product updates + occasional offers"
              checked={draft.notifications.emailMarketing}
              onChange={(v) => set("notifications.emailMarketing", v)}
            />
            <CheckboxField
              label="Push me when a video is ready"
              checked={draft.notifications.pushVideoReady}
              onChange={(v) => set("notifications.pushVideoReady", v)}
            />
            <CheckboxField
              label="Push me when my work is featured"
              checked={draft.notifications.pushFeatured}
              onChange={(v) => set("notifications.pushFeatured", v)}
            />
          </Section>

          {/* Account */}
          <Section title="Account">
            <SettingsRow icon="✉" label="Email"        hint="Change email (requires verification)" onClick={() => alert("Phase 2") } />
            <SettingsRow icon="🔑" label="Password"     hint="Set or change your password"          onClick={() => alert("Phase 2") } />
            <SettingsRow icon="🛡" label="Two-factor"    hint="Add an extra security layer"          onClick={() => alert("Phase 2") } />
            <SettingsRow icon="🔗" label="Connected accounts" hint="Google · Apple" onClick={() => alert("Phase 2") } />
            <div style={{ marginTop: 10 }}>
              <button type="button" style={dangerBtn} onClick={() => alert("Delete account — Phase 2 with 7-day grace + safeguards")}>
                Delete account…
              </button>
            </div>
          </Section>
        </div>

        {/* Footer actions */}
        <div style={{
          padding: "12px 20px max(12px, env(safe-area-inset-bottom, 12px))",
          borderTop: `1px solid ${HAIR}`,
          display: "flex",
          gap: 10,
        }}>
          <button type="button" onClick={onClose} style={ghostBtn}>Cancel</button>
          <button type="button" onClick={onSave} style={{ ...primaryBtn, flex: 1 }}>Save changes</button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h3 style={{
        margin: "0 0 10px",
        fontSize: 10.5,
        letterSpacing: ".14em",
        fontWeight: 800,
        textTransform: "uppercase",
        color: MUTED,
      }}>
        {title}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ children }) {
  return <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{
    Array.isArray(children) ? children.map((c, i) => <div key={i} style={{ flex: "1 1 0", minWidth: 140 }}>{c}</div>) : children
  }</div>;
}

function Field({ label, value, onChange, hint, prefix, placeholder }) {
  return (
    <label style={{ display: "block", fontSize: 12, color: SUB, fontWeight: 600 }}>
      <span style={{ color: SUB, fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" }}>
        {label}
      </span>
      <div style={{
        marginTop: 6,
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: CARD_2,
        border: `1px solid ${HAIR}`,
        borderRadius: 8,
        padding: "0 10px",
      }}>
        {prefix && <span style={{ color: MUTED, fontSize: 13, fontWeight: 700 }}>{prefix}</span>}
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            color: TEXT,
            padding: "10px 0",
            fontSize: 13,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
      </div>
      {hint && <div style={fineHint}>{hint}</div>}
    </label>
  );
}

function TextareaField({ label, value, onChange, hint }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ color: SUB, fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" }}>
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        style={{
          width: "100%",
          marginTop: 6,
          background: CARD_2,
          border: `1px solid ${HAIR}`,
          borderRadius: 8,
          padding: "10px 12px",
          color: TEXT,
          fontSize: 13,
          fontFamily: "inherit",
          lineHeight: 1.5,
          resize: "vertical",
          outline: "none",
        }}
      />
      {hint && <div style={fineHint}>{hint}</div>}
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ color: SUB, fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          marginTop: 6,
          background: CARD_2,
          border: `1px solid ${HAIR}`,
          borderRadius: 8,
          padding: "10px 12px",
          color: TEXT,
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: CARD }}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function CheckboxField({ label, checked, onChange }) {
  return (
    <label style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 10px",
      background: CARD_2,
      border: `1px solid ${HAIR}`,
      borderRadius: 8,
      cursor: "pointer",
      fontSize: 13,
      color: TEXT,
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: LIME, width: 16, height: 16 }}
      />
      <span>{label}</span>
    </label>
  );
}

// ════════════════════════════════════════════════════════════════
// SHARED INLINE STYLES
// ════════════════════════════════════════════════════════════════
const primaryBtn = {
  background: `linear-gradient(135deg, ${LIME}, ${LIME_DARK})`,
  border: "none",
  color: "#000",
  padding: "10px 18px",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
};

const ghostBtn = {
  background: "rgba(255,255,255,0.06)",
  border: `1px solid ${HAIR_STRONG}`,
  color: TEXT,
  padding: "10px 16px",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

const ghostIconBtn = {
  background: "rgba(255,255,255,0.06)",
  border: `1px solid ${HAIR_STRONG}`,
  color: TEXT,
  width: 40,
  height: 40,
  borderRadius: 10,
  fontSize: 18,
  cursor: "pointer",
  fontFamily: "inherit",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const smallBtn = {
  background: "rgba(255,255,255,0.06)",
  border: `1px solid ${HAIR_STRONG}`,
  color: TEXT,
  padding: "7px 12px",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

const dangerBtn = {
  background: "transparent",
  border: "1px solid rgba(248,113,113,0.45)",
  color: RED,
  padding: "8px 14px",
  borderRadius: 8,
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

const copyBtn = {
  background: "rgba(217,255,0,0.10)",
  border: `1px solid ${LIME_RING}`,
  color: LIME,
  padding: "5px 10px",
  borderRadius: 6,
  fontSize: 11.5,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
  letterSpacing: ".04em",
};

const topUpBtn = {
  background: "#000",
  color: LIME,
  border: `1px solid ${LIME_RING}`,
  padding: "8px 12px",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 800,
  textDecoration: "none",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};

const fineHint = {
  marginTop: 6,
  fontSize: 11,
  color: MUTED,
  fontWeight: 500,
};

const codePill = {
  background: "rgba(255,255,255,0.06)",
  color: TEXT,
  padding: "1px 6px",
  borderRadius: 4,
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
  fontSize: "0.92em",
};
