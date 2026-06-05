"use client";
// Universal top navigation. Same layout on every subdomain — once
// the demo is approved, this component moves into a shared
// package and gets imported by community / seedance / music /
// edits / studio.
//
// Layout (left → right):
//   [Logo "visualseffect"] [current-subdomain pill]
//   [contextual nav slot] (children)
//   [credits pill] [⊞ apps] [bell] [avatar]
//
// On mobile, contextual nav collapses into the parent screen and
// only logo + apps + bell + avatar remain on the bar.

import { useMemo, useState } from "react";
import AppsPanel from "./AppsPanel";
import { useAppsPanel } from "./AppsPanelContext";
import {
  APPS,
  detectActiveApp,
  DEMO_RECENT_TOOLS,
  DEMO_RESUME,
} from "./ecosystem";

// EcosystemNav is auth-agnostic. Each subdomain's wrapper resolves
// `user`/`status`/`onSignOut` from whatever auth it uses
// (NextAuth on community, Clerk on the studio, etc.) and plugs
// in the right `bell` + `avatar` slot components. That way one
// nav source of truth ships across the ecosystem without dragging
// any specific auth library with it.

export default function EcosystemNav({
  // Override the auto-detected current app — useful for the demo
  // page or any embedded preview.
  activeAppId: activeOverride,
  // User object: { name, image, verified, ... }. Wrapper supplies
  // it from whatever auth lib the host subdomain runs.
  user = null,
  // "authenticated" / "unauthenticated" / "loading". Drives which
  // right-side cluster paints (real avatar vs sign-in CTA).
  status = "unauthenticated",
  // Wrapper-supplied sign-out handler. Wired into the user menu.
  onSignOut,
  // Credit balance — wrapper passes a number (or null/undefined
  // to hide the pill until the shared credits API lands).
  credits = null,
  // Optional notification bell node. Wrapper supplies the
  // subdomain-specific bell (e.g. community's NotificationBell);
  // omitted on apps where notifications haven't shipped yet.
  bell,
  // Required avatar node — wrapper passes a sized avatar with
  // the subdomain's local ring/story behaviour baked in.
  avatar,
  // Contextual middle section (e.g. tab links specific to the
  // current subdomain). Optional.
  children,
  // Recents + resume — same shape as ecosystem.js demo exports.
  recentIds = DEMO_RECENT_TOOLS,
  resume = DEMO_RESUME,
  // Profile and settings hrefs — wrapper points them at the
  // right subdomain's surfaces.
  profileHref = "https://community.visualseffect.com/me",
  settingsHref = "https://community.visualseffect.com/settings",
  signInHref = "/sign-in",
}) {
  const apps = useAppsPanel();
  const appsOpen = apps.isOpen;
  const setAppsOpen = (v) => (v ? apps.open() : apps.close());
  const [menuOpen, setMenuOpen] = useState(false);

  const activeApp = useMemo(() => {
    if (activeOverride) return APPS.find((a) => a.id === activeOverride) || null;
    if (typeof window === "undefined") return null;
    return detectActiveApp({
      host: window.location.host,
      pathname: window.location.pathname,
    });
  }, [activeOverride]);

  return (
    <>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 18px",
          background:
            "color-mix(in srgb, var(--bg-page) 92%, transparent)",
          borderBottom: "1px solid var(--border-soft)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          fontFamily: "inherit",
          color: "var(--text-primary)",
        }}
      >
        {/* Brand wordmark — links to hub */}
        <a
          href="https://visualseffect.com"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
            color: "inherit",
            flexShrink: 0,
          }}
          aria-label="Visualseffect home"
        >
          <span
            aria-hidden
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              background:
                "linear-gradient(135deg, var(--accent) 0%, var(--accent-mid) 100%)",
              color: "var(--text-on-accent)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              fontSize: 14,
              letterSpacing: 0,
            }}
          >
            V
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            visualseffect
          </span>
        </a>

        {/* Active-subdomain pill */}
        {activeApp && (
          <span
            aria-label={`You are on ${activeApp.name}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              borderRadius: 999,
              background:
                "color-mix(in srgb, var(--accent) 14%, transparent)",
              border:
                "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
              color: "var(--accent)",
              fontSize: 11.5,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>
              {activeApp.icon}
            </span>
            {activeApp.name}
          </span>
        )}

        {/* Contextual nav slot — owned by the host page */}
        <nav
          className="eco-context-nav"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            flex: 1,
            minWidth: 0,
            overflowX: "auto",
            scrollbarWidth: "none",
          }}
          aria-label="Section navigation"
        >
          {children}
        </nav>

        {/* Right-side cluster: credits / apps / bell / avatar */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          {credits !== null && (
            <a
              href="https://visualseffect.com/buy-credits"
              style={creditPillStyle}
              title="Credit balance — top up"
            >
              <span aria-hidden style={{ fontSize: 13 }}>
                ✦
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {credits.toLocaleString()}
              </span>
              <span
                aria-hidden
                style={{
                  fontSize: 11,
                  color: "var(--text-faint)",
                  fontWeight: 700,
                }}
              >
                +
              </span>
            </a>
          )}
          <button
            type="button"
            onClick={() => setAppsOpen((v) => !v)}
            aria-label="Open app switcher"
            aria-expanded={appsOpen}
            style={iconBtnStyle(appsOpen)}
            title="Switch apps"
          >
            <AppsIcon />
          </button>
          {/* Wrapper-supplied bell — community ships its own popover,
              other subdomains may pass a simple link icon. */}
          {status === "authenticated" && bell}
          {status === "authenticated" ? (
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Your account"
              aria-expanded={menuOpen}
              style={avatarBtnStyle}
            >
              {avatar}
            </button>
          ) : (
            <a href={signInHref} style={signInBtnStyle}>
              Sign in
            </a>
          )}
        </div>
      </header>

      {/* User dropdown */}
      {menuOpen && (
        <UserMenu
          user={user}
          profileHref={profileHref}
          settingsHref={settingsHref}
          onSignOut={onSignOut}
          onClose={() => setMenuOpen(false)}
          onOpenApps={() => setAppsOpen(true)}
        />
      )}

      {/* Apps panel */}
      <AppsPanel
        open={appsOpen}
        onClose={() => setAppsOpen(false)}
        activeAppId={activeApp?.id}
        recentIds={recentIds}
        resume={resume}
      />

      {/* Mobile bottom nav lives in each subdomain's own
          MobileTabBar component now — its Apps centre button
          opens this same panel via AppsPanelContext. Avoids two
          fixed bottom bars stacking. */}

      <style>{`
        .eco-context-nav::-webkit-scrollbar { display: none; }
        @media (max-width: 720px) {
          .eco-context-nav { display: none !important; }
        }
      `}</style>
    </>
  );
}

/* ───────── Mobile bottom nav ───────── */

function EcosystemBottomNav({ activeAppId, onAppsClick }) {
  // Five slots: Generate · Community · Apps centre · Inbox · You
  const tabs = [
    {
      id: "seedance",
      label: "Generate",
      icon: "🎬",
      href: "https://seedance.visualseffect.com",
    },
    {
      id: "community",
      label: "Community",
      icon: "🎞",
      href: "https://community.visualseffect.com",
    },
    {
      id: "__apps",
      label: "Apps",
      icon: "⊞",
      isCentre: true,
      onClick: onAppsClick,
    },
    {
      id: "__inbox",
      label: "Inbox",
      icon: "💬",
      href: "https://community.visualseffect.com/notifications",
    },
    {
      id: "__profile",
      label: "Profile",
      icon: "👤",
      href: "https://community.visualseffect.com/me",
    },
  ];

  return (
    <nav
      className="eco-bottom-nav"
      aria-label="Ecosystem"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        display: "none",
        background:
          "color-mix(in srgb, var(--bg-page) 96%, transparent)",
        borderTop: "1px solid var(--border-soft)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        padding: "6px 10px calc(6px + env(safe-area-inset-bottom))",
      }}
    >
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 4,
        }}
      >
        {tabs.map((t) => {
          const active = !t.isCentre && t.id === activeAppId;
          const inner = (
            <>
              <span
                aria-hidden
                style={{
                  fontSize: t.isCentre ? 18 : 17,
                  lineHeight: 1,
                  marginBottom: 2,
                }}
              >
                {t.icon}
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: active
                    ? "var(--accent)"
                    : t.isCentre
                      ? "var(--text-on-accent)"
                      : "var(--text-secondary)",
                }}
              >
                {t.label}
              </span>
            </>
          );
          const baseStyle = {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px 4px",
            textDecoration: "none",
            color: "inherit",
            borderRadius: t.isCentre ? 999 : 10,
            background: t.isCentre
              ? "linear-gradient(135deg, var(--accent), var(--accent-mid))"
              : active
                ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                : "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            transform: t.isCentre ? "translateY(-6px)" : "none",
            boxShadow: t.isCentre
              ? "0 8px 18px -6px color-mix(in srgb, var(--accent) 65%, transparent)"
              : "none",
          };
          return (
            <li key={t.id} style={{ minWidth: 0 }}>
              {t.onClick ? (
                <button type="button" onClick={t.onClick} style={baseStyle}>
                  {inner}
                </button>
              ) : (
                <a href={t.href} style={baseStyle}>
                  {inner}
                </a>
              )}
            </li>
          );
        })}
      </ul>
      <style>{`
        @media (max-width: 720px) {
          .eco-bottom-nav { display: block !important; }
        }
      `}</style>
    </nav>
  );
}

/* ───────── User dropdown ───────── */

function UserMenu({
  user,
  profileHref,
  settingsHref,
  onSignOut,
  onClose,
  onOpenApps,
}) {
  const items = [
    { label: "View profile", icon: "👤", href: profileHref },
    { label: "Settings", icon: "⚙", href: settingsHref },
    { label: "Switch apps", icon: "⊞", action: "apps" },
    { label: "Sign out", icon: "⎋", action: "signout", danger: true },
  ];
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 55,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 58,
          right: 18,
          width: 220,
          background: "var(--bg-card)",
          border: "1px solid var(--border-strong)",
          borderRadius: 12,
          boxShadow: "0 24px 56px -16px rgba(0,0,0,0.5)",
          padding: 6,
        }}
      >
        <div
          style={{
            padding: "8px 10px 12px",
            borderBottom: "1px solid var(--border-soft)",
            marginBottom: 6,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 13.5,
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            {user?.name || "You"}
            {user?.verified ? " ✓" : ""}
          </p>
          <p
            style={{
              margin: "2px 0 0",
              fontSize: 11,
              color: "var(--text-faint)",
            }}
          >
            Synced across all apps
          </p>
        </div>
        {items.map((it) => {
          const handler = () => {
            if (it.action === "signout") {
              onClose();
              if (onSignOut) onSignOut();
              return;
            }
            if (it.action === "apps") {
              onClose();
              if (onOpenApps) onOpenApps();
              return;
            }
            // Anchor items: let the <a> navigation handle it,
            // close menu after click.
            onClose();
          };
          const sharedProps = {
            onClick: handler,
            style: {
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              textAlign: "left",
              padding: "8px 10px",
              borderRadius: 8,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: it.danger ? "#d44" : "var(--text-primary)",
              fontFamily: "inherit",
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: "none",
            },
            onMouseEnter: (e) => {
              e.currentTarget.style.background = "var(--bg-card-hover)";
            },
            onMouseLeave: (e) => {
              e.currentTarget.style.background = "transparent";
            },
          };
          const content = (
            <>
              <span aria-hidden style={{ width: 16, textAlign: "center" }}>
                {it.icon}
              </span>
              {it.label}
            </>
          );
          return it.href ? (
            <a key={it.label} href={it.href} {...sharedProps}>
              {content}
            </a>
          ) : (
            <button key={it.label} type="button" {...sharedProps}>
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────── Tiny icon set ───────── */

function AppsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

/* ───────── Styles ───────── */

const creditPillStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "5px 10px",
  borderRadius: 999,
  background: "var(--bg-input)",
  border: "1px solid var(--border-soft)",
  color: "var(--text-primary)",
  fontSize: 12.5,
  fontWeight: 700,
  textDecoration: "none",
};

function iconBtnStyle(active) {
  return {
    width: 34,
    height: 34,
    borderRadius: 999,
    background: active
      ? "color-mix(in srgb, var(--accent) 18%, transparent)"
      : "var(--bg-input)",
    border: active
      ? "1px solid color-mix(in srgb, var(--accent) 45%, transparent)"
      : "1px solid var(--border-soft)",
    color: active ? "var(--accent)" : "var(--text-secondary)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

const avatarBtnStyle = {
  padding: 0,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  borderRadius: "50%",
  display: "inline-flex",
};

const signInBtnStyle = {
  padding: "8px 14px",
  borderRadius: 999,
  background: "var(--accent)",
  color: "var(--text-on-accent)",
  fontSize: 12.5,
  fontWeight: 800,
  textDecoration: "none",
  fontFamily: "inherit",
};
