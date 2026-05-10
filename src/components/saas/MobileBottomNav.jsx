// Pure-presentation bottom navigation that mirrors community.visualseffect
// .com's bar so users keep their bearings when crossing the subdomain into
// Studio. ZERO client-side logic by design — no hooks, no fetch, no event
// handlers. Just static HTML + CSS that compiles to ~600 bytes of markup.
//
// Visual contract MUST stay 1:1 with
// seedance-community/src/components/shell/MobileTabBar.jsx
// (icons, sizes, gap, colors, padding, font weights). Change them in
// lockstep on both sides.
//
// Why no "use client": this component has no client-side state. Plain
// <a> anchors handle navigation natively — no Next.js Link is needed
// either, since 4 of 5 tabs cross the subdomain boundary (which forces
// a full page load anyway, the same thing <a> does).

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

export default function MobileBottomNav() {
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
      {TABS.map((tab) => (
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
            color: tab.isStudio ? "#D9FF00" : "#94a3b8",
            textDecoration: "none",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          <span style={{ lineHeight: 0 }}>{tab.icon}</span>
          <span>{tab.label}</span>
        </a>
      ))}
      <style>{`
        /* Hide on tablet/desktop — same breakpoint as community's bar. */
        @media (min-width: 721px) {
          .seedance-mobile-bottom-nav { display: none !important; }
        }
      `}</style>
    </nav>
  );
}
