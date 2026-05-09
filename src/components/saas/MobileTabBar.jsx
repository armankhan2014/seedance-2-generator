"use client";
import Link from "next/link";

// Persistent bottom navigation that mirrors the bar on
// community.visualseffect.com so users never lose their place when
// they cross the subdomain boundary into Studio. The four
// non-Studio tabs link out via absolute URLs; Studio is hard-active
// here because we ARE the Studio site.
//
// Visual contract MUST match community/src/components/shell/MobileTabBar
// (icons, sizes, colors, fonts, padding) — change them in lockstep.
//
// The Inbox unread badge that the community side has is intentionally
// NOT replicated here. We had a cross-origin credentialed fetch
// implementation; users reported mobile auth issues right after it
// shipped, so we removed it as a safety measure while we confirm
// the root cause. Ship the badge again only after we have a clean
// repro that proves the fetch wasn't the trigger.

const COMMUNITY_URL = "https://community.visualseffect.com";

const TABS = [
  {
    id: "feed",
    href: `${COMMUNITY_URL}/`,
    label: "Home",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    id: "members",
    href: `${COMMUNITY_URL}/members`,
    label: "Members",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: "search",
    href: `${COMMUNITY_URL}/?focus=search`,
    label: "Search",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    ),
  },
  {
    id: "messages",
    href: `${COMMUNITY_URL}/messages`,
    label: "Inbox",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
      </svg>
    ),
  },
  {
    id: "studio",
    href: "/",
    label: "Studio",
    isStudio: true,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" />
      </svg>
    ),
  },
];

export default function MobileTabBar() {
  return (
    <nav
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
      }}
      className="mobile-tab-bar"
    >
      {TABS.map((tab) => {
        const active = !!tab.isStudio;
        // Internal link → next/link. External (community.*) → plain
        // anchor with rel for tracking + security on the cross-domain
        // hop. We deliberately do NOT add target="_blank" — users
        // expect tapping a tab to navigate, not open a new tab.
        const Tag = tab.isStudio ? Link : "a";
        const linkProps = tab.isStudio
          ? { href: tab.href }
          : { href: tab.href, rel: "noopener" };
        return (
          <Tag
            key={tab.id}
            {...linkProps}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              padding: "6px 4px",
              color: active ? "#D9FF00" : "#94a3b8",
              textDecoration: "none",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              position: "relative",
              fontFamily: "inherit",
            }}
          >
            <span style={{ lineHeight: 0 }}>{tab.icon}</span>
            <span>{tab.label}</span>
          </Tag>
        );
      })}
      <style>{`
        /* Hide on tablet/desktop — same breakpoint as community. */
        @media (min-width: 721px) {
          .mobile-tab-bar { display: none !important; }
        }
      `}</style>
    </nav>
  );
}
