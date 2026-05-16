"use client";
// Bottom navigation that mirrors community.visualseffect.com's bar so
// users keep their bearings when crossing the subdomain into Studio.
//
// Visual contract MUST stay 1:1 with
// seedance-community/src/components/shell/MobileTabBar.jsx
// (icons, sizes, gap, colors, padding, font weights, AND the lime
// pill-slide treatment). Change them in lockstep on both sides.
//
// Was previously a pure server component because Studio was always
// the active tab (only Studio's own home + cross-origin community
// routes were reachable). Adding /music as a same-origin sub-route
// broke that assumption — the pill would stay under "Studio" even
// when the user was on /music. Converted to client with usePathname
// so the active tab follows the current route.

import { usePathname } from "next/navigation";

const COMMUNITY_URL = "https://community.visualseffect.com";

const TABS = [
  {
    href: `${COMMUNITY_URL}/`,
    label: "Home",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: `${COMMUNITY_URL}/members`,
    label: "Members",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: `${COMMUNITY_URL}/messages`,
    label: "Inbox",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
      </svg>
    ),
  },
  {
    href: "/music",
    label: "Music",
    icon: (
      // Music note + waveform — distinctive against the navigation
      // icons (home, person, chat) on either side.
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    ),
  },
  {
    href: "/",
    label: "Studio",
    isStudio: true,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" />
      </svg>
    ),
  },
];

// Studio tab is the rightmost — used as the default-active state
// for any Studio route that isn't explicitly mapped to another tab.
const STUDIO_IDX = TABS.length - 1;
const MUSIC_IDX = TABS.findIndex((t) => t.href === "/music");

// Match the current pathname to one of the LOCAL tabs (same-origin
// hrefs only — the cross-subdomain ones at COMMUNITY_URL are never
// the current pathname on this side). Falls back to STUDIO_IDX so
// the lime pill defaults to Studio on /, /generate, /creations etc.
function activeIndexFor(pathname) {
  if (!pathname) return STUDIO_IDX;
  if (pathname === "/music" || pathname.startsWith("/music/")) return MUSIC_IDX;
  return STUDIO_IDX;
}

export default function MobileBottomNav() {
  const pathname = usePathname();
  const activeIdx = activeIndexFor(pathname);
  return (
    <nav
      className="seedance-mobile-bottom-nav"
      aria-label="Site navigation"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: "rgba(10,10,10,0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        padding: "8px 4px calc(env(safe-area-inset-bottom, 0px) + 12px)",
        display: "flex",
        justifyContent: "space-around",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* Lime pill that slides under the active tab. translateX is
          computed from `activeIdx` which follows usePathname — so
          tapping Music slides the pill there, navigating to / or
          any other Studio route slides it back to Studio. The
          cubic-bezier overshoot matches community's MobileTabBar. */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 8,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
          left: 4,
          width: `calc((100% - 8px) / ${TABS.length})`,
          background:
            "linear-gradient(180deg, rgba(217,255,0,0.16), rgba(217,255,0,0.06))",
          border: "1px solid rgba(217,255,0,0.28)",
          borderRadius: 14,
          transform: `translateX(${activeIdx * 100}%)`,
          transition:
            "transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          pointerEvents: "none",
          boxShadow: "0 0 18px -4px rgba(217,255,0,0.35)",
          willChange: "transform",
        }}
      />

      {TABS.map((tab, i) => {
        const isActive = i === activeIdx;
        return (
          <a
            key={tab.label}
            href={tab.href}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              padding: "6px 4px",
              color: isActive ? "#D9FF00" : "#94a3b8",
              textDecoration: "none",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              position: "relative",
              zIndex: 1,
              transition: "color 240ms ease",
            }}
          >
            <span
              style={{
                lineHeight: 0,
                display: "block",
                transform: isActive ? "scale(1.08)" : "scale(1)",
                transition:
                  "transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
            >
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </a>
        );
      })}
      <style>{`
        /* Hide on tablet/desktop — same breakpoint as community's bar. */
        @media (min-width: 721px) {
          .seedance-mobile-bottom-nav { display: none !important; }
        }
      `}</style>
    </nav>
  );
}
