// Pure-presentation bottom navigation that mirrors community.visualseffect
// .com's bar so users keep their bearings when crossing the subdomain into
// Studio. ZERO client-side logic by design — no hooks, no fetch, no event
// handlers. Just static HTML + CSS that compiles to ~700 bytes of markup.
//
// Visual contract MUST stay 1:1 with
// seedance-community/src/components/shell/MobileTabBar.jsx
// (icons, sizes, gap, colors, padding, font weights, AND the lime
// pill-slide treatment). Change them in lockstep on both sides.
//
// Why no "use client": this component has no client-side state — the
// active tab is *always* Studio when this side of the subdomain is
// rendered, so the pill can be statically positioned with no JS.
// Plain <a> anchors handle navigation natively; 3 of 4 tabs cross
// the subdomain (which forces a full page load anyway).

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

// Studio is always the rightmost tab (TABS.length - 1) and always
// "active" on this side of the subdomain — so the pill is a fixed
// CSS placement, not a JS-driven translateX like on community.
const ACTIVE_IDX = TABS.length - 1;

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
      {/* Lime pill behind the Studio tab — same visual treatment as
          the community pill-slide animation. Statically positioned
          here because Studio is always the active tab on this side
          (no slide needed). The translateX in style + matching CSS
          transition means if we ever do switch this to a client
          component with active-tab tracking, the same animation
          will Just Work. */}
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
          transform: `translateX(${ACTIVE_IDX * 100}%)`,
          transition:
            "transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          pointerEvents: "none",
          boxShadow: "0 0 18px -4px rgba(217,255,0,0.35)",
          willChange: "transform",
        }}
      />

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
            position: "relative",
            zIndex: 1,
            transition: "color 240ms ease",
          }}
        >
          <span
            style={{
              lineHeight: 0,
              display: "block",
              transform: tab.isStudio ? "scale(1.08)" : "scale(1)",
              transition:
                "transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            {tab.icon}
          </span>
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
