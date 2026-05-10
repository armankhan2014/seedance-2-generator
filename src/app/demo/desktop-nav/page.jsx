// Demo route for desktop top-nav animation variants on
// seedance.visualseffect.com. Lives at /demo/desktop-nav, not
// linked from public nav. Once Arman picks a winner, that variant
// ships into src/components/saas/Navbar.jsx and this directory
// deletes.
//
// Each variant covers the full nav row (logo + Generate / Gallery /
// Pricing links + Contact Us button + Credits badge + Profile pill)
// so we can see the animations interact with the real layout.

"use client";
import { useRef, useState } from "react";

export const dynamic = "force-static";

const LINKS = [
  { label: "Generate" },
  { label: "Gallery"  },
  { label: "Pricing"  },
];

// ─── Variant A: Underline glide ────────────────────────────────
// A lime gradient underline pill slides between hovered/active
// links. Active link has the underline persistent at lower
// opacity; hover overrides with full opacity. Cubic-bezier spring.
function VariantUnderlineGlide({ activeIdx, onTabClick }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const navRef = useRef(null);

  // Visible index = hover (if hovering) or active (if not).
  const visibleIdx = hoverIdx ?? activeIdx;

  return (
    <NavShell>
      <Logo />
      <nav
        ref={navRef}
        style={{
          display: "flex",
          gap: 4,
          flex: 1,
          justifyContent: "center",
          position: "relative",
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Sliding underline pill */}
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: -2,
            left: 0,
            width: `calc(100% / ${LINKS.length})`,
            display: "flex",
            justifyContent: "center",
            transform: `translateX(${visibleIdx * 100}%)`,
            transition: "transform 360ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              width: 28,
              height: 3,
              borderRadius: 999,
              background: "linear-gradient(90deg, transparent, #D9FF00, transparent)",
              boxShadow: "0 0 12px rgba(217,255,0,0.85)",
              opacity: hoverIdx !== null || activeIdx >= 0 ? 1 : 0,
              transition: "opacity 200ms ease",
            }}
          />
        </span>
        {LINKS.map((l, i) => {
          const active = i === activeIdx;
          const hovered = i === hoverIdx;
          return (
            <button
              key={l.label}
              onClick={() => onTabClick(i)}
              onMouseEnter={() => setHoverIdx(i)}
              style={{
                ...linkBase,
                color: active || hovered ? "#fff" : "#64748b",
                background: "transparent",
                transition: "color 220ms ease",
              }}
            >
              {l.label}
            </button>
          );
        })}
      </nav>
      <RightCluster />
    </NavShell>
  );
}

// ─── Variant B: Glow + scale ───────────────────────────────────
// Hover lifts the link 1px + adds a soft lime glow under it.
// Active link has a lime tint background. No moving indicator —
// motion is contained per-link.
function VariantGlowScale({ activeIdx, onTabClick }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  return (
    <NavShell>
      <Logo />
      <nav style={{ display: "flex", gap: 4, flex: 1, justifyContent: "center" }}>
        {LINKS.map((l, i) => {
          const active = i === activeIdx;
          const hovered = i === hoverIdx;
          return (
            <button
              key={l.label}
              onClick={() => onTabClick(i)}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{
                ...linkBase,
                color: active ? "#fff" : hovered ? "#D9FF00" : "#64748b",
                background: active
                  ? "rgba(217,255,0,0.14)"
                  : hovered
                  ? "rgba(217,255,0,0.06)"
                  : "transparent",
                border: active
                  ? "1px solid rgba(217,255,0,0.35)"
                  : "1px solid transparent",
                transform: hovered ? "translateY(-1px)" : "translateY(0)",
                boxShadow: active
                  ? "0 4px 14px -4px rgba(217,255,0,0.45), 0 0 0 1px rgba(217,255,0,0.2) inset"
                  : hovered
                  ? "0 4px 14px -6px rgba(217,255,0,0.35)"
                  : "none",
                transition:
                  "transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1), background 200ms ease, color 200ms ease, box-shadow 200ms ease, border-color 200ms ease",
              }}
            >
              {l.label}
            </button>
          );
        })}
      </nav>
      <RightCluster />
    </NavShell>
  );
}

// ─── Variant C: Sweep fill ─────────────────────────────────────
// On hover, a lime tint sweeps in from left to right behind the
// link. Active link has the full sweep complete. Like a wipe
// reveal.
function VariantSweepFill({ activeIdx, onTabClick }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  return (
    <NavShell>
      <Logo />
      <nav style={{ display: "flex", gap: 4, flex: 1, justifyContent: "center" }}>
        {LINKS.map((l, i) => {
          const active = i === activeIdx;
          const hovered = i === hoverIdx;
          const filled = active || hovered;
          return (
            <button
              key={l.label}
              onClick={() => onTabClick(i)}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{
                ...linkBase,
                position: "relative",
                color: filled ? "#fff" : "#64748b",
                background: "transparent",
                overflow: "hidden",
                transition: "color 240ms ease",
              }}
            >
              {/* Sweep layer */}
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(90deg, rgba(217,255,0,0.18) 0%, rgba(217,255,0,0.10) 60%, transparent 100%)",
                  transform: filled ? "translateX(0%)" : "translateX(-101%)",
                  transition: "transform 360ms cubic-bezier(0.22, 0.61, 0.36, 1)",
                  pointerEvents: "none",
                }}
              />
              <span style={{ position: "relative" }}>{l.label}</span>
            </button>
          );
        })}
      </nav>
      <RightCluster />
    </NavShell>
  );
}

// ─── Shared bits ───────────────────────────────────────────────
function NavShell({ children }) {
  return (
    <header
      style={{
        background: "#0a0a0a",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        margin: "0 auto",
        maxWidth: 1100,
      }}
    >
      <div
        style={{
          padding: "0 16px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        {children}
      </div>
    </header>
  );
}

function Logo() {
  return (
    <span style={{ fontSize: "1rem", fontWeight: 800, color: "#fff", flexShrink: 0 }}>
      Seedance
      <span
        style={{
          background: "linear-gradient(135deg,#D9FF00,#A6CC00)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        Studio
      </span>
    </span>
  );
}

function RightCluster() {
  const [creditsHover, setCreditsHover] = useState(false);
  const [profileHover, setProfileHover] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
      {/* Contact Us */}
      <button
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          color: "#94a3b8",
          padding: "6px 12px",
          fontSize: "0.78rem",
          fontFamily: "inherit",
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "background 200ms ease, color 200ms ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.1)";
          e.currentTarget.style.color = "#fff";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.06)";
          e.currentTarget.style.color = "#94a3b8";
        }}
      >
        Contact Us
      </button>

      {/* Credits badge — subtle hover lift + glow ramp */}
      <span
        onMouseEnter={() => setCreditsHover(true)}
        onMouseLeave={() => setCreditsHover(false)}
        style={{
          background: "linear-gradient(135deg, rgba(217,255,0,0.2), rgba(166,204,0,0.2))",
          border: "1px solid rgba(217,255,0,0.4)",
          borderRadius: 20,
          color: "#D9FF00",
          padding: "4px 10px",
          fontSize: "0.75rem",
          fontWeight: 700,
          whiteSpace: "nowrap",
          cursor: "default",
          transform: creditsHover ? "translateY(-1px)" : "translateY(0)",
          boxShadow: creditsHover
            ? "0 4px 16px -4px rgba(217,255,0,0.55), 0 0 0 1px rgba(217,255,0,0.5)"
            : "0 0 0 1px rgba(217,255,0,0.0)",
          transition:
            "transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 220ms ease",
        }}
      >
        ⚡ 17,765 credits
      </span>

      {/* Avatar pill — tilt + brighten on hover */}
      <button
        onMouseEnter={() => setProfileHover(true)}
        onMouseLeave={() => setProfileHover(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: profileHover ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          padding: "5px 10px 5px 6px",
          cursor: "pointer",
          color: profileHover ? "#fff" : "#94a3b8",
          fontSize: "0.78rem",
          fontFamily: "inherit",
          transition:
            "background 200ms ease, color 200ms ease, transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          transform: profileHover ? "translateY(-1px)" : "translateY(0)",
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #D9FF00, #A6CC00)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#0a0a0a",
            fontSize: 11,
            fontWeight: 800,
            transform: profileHover ? "rotate(-6deg)" : "rotate(0)",
            transition: "transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        >
          A
        </span>
        <span>Arman</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          style={{ marginLeft: 2, opacity: 0.5 }}
        >
          <path
            d="M2 3.5L5 6.5L8 3.5"
            stroke="#94a3b8"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

const linkBase = {
  padding: "6px 14px",
  borderRadius: 8,
  fontSize: "0.82rem",
  fontWeight: 600,
  textDecoration: "none",
  whiteSpace: "nowrap",
  background: "transparent",
  border: "1px solid transparent",
  fontFamily: "inherit",
  cursor: "pointer",
  position: "relative",
};

// ─── Page ──────────────────────────────────────────────────────
export default function DesktopNavDemoPage() {
  const [a, setA] = useState(0);
  const [b, setB] = useState(1);
  const [c, setC] = useState(2);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#f1f5f9",
        fontFamily: "Inter, sans-serif",
        padding: "32px 16px 80px",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
        <p
          style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.42em",
            textTransform: "uppercase",
            color: "#A6CC00",
          }}
        >
          Demo · Desktop Top Nav
        </p>
        <h1
          style={{
            margin: "10px 0 6px",
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: "-0.01em",
          }}
        >
          Pick a top-nav animation
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: "#94a3b8", lineHeight: 1.55 }}>
          Hover the links inside each nav, click to set an active state, and
          hover the credits badge + profile pill on the right. Best viewed on
          desktop. Mobile breakpoints are unchanged on production.
        </p>
      </div>

      <Section
        letter="A"
        title="Underline glide"
        body="A lime underline pill slides between hovered links with a spring ease. Active link has the underline persistent. Subtle motion only at the bottom of the link."
      >
        <VariantUnderlineGlide activeIdx={a} onTabClick={setA} />
      </Section>

      <Section
        letter="B"
        title="Glow + scale"
        body="Hover lifts the link 1px + adds a lime glow ring. Active link has a soft lime tint background + lime border. Per-link motion, no global indicator."
      >
        <VariantGlowScale activeIdx={b} onTabClick={setB} />
      </Section>

      <Section
        letter="C"
        title="Sweep fill"
        body="A lime tint sweeps in from the left behind the link on hover. Active link has the sweep complete. Wipe-style reveal that feels filmic — a nod to the Studio brand."
      >
        <VariantSweepFill activeIdx={c} onTabClick={setC} />
      </Section>

      <p
        style={{
          maxWidth: 600,
          margin: "32px auto 0",
          textAlign: "center",
          fontSize: 12.5,
          color: "#64748b",
          lineHeight: 1.7,
        }}
      >
        Reply with{" "}
        <strong style={{ color: "#D9FF00" }}>&quot;go A&quot;</strong>,{" "}
        <strong style={{ color: "#D9FF00" }}>&quot;go B&quot;</strong>, or{" "}
        <strong style={{ color: "#D9FF00" }}>&quot;go C&quot;</strong> to ship
        the winner into the real{" "}
        <code style={{ color: "#cbd5e1" }}>Navbar.jsx</code>. Or describe a
        tweak — e.g. <em>&quot;A but the underline is wider&quot;</em> or{" "}
        <em>&quot;B without the lift, just glow&quot;</em>.
      </p>
    </main>
  );
}

function Section({ letter, title, body, children }) {
  return (
    <section style={{ marginTop: 44 }}>
      <div style={{ maxWidth: 600, margin: "0 auto 18px", textAlign: "center" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "5px 14px 5px 8px",
            background: "rgba(217,255,0,0.08)",
            border: "1px solid rgba(217,255,0,0.25)",
            borderRadius: 999,
            marginBottom: 10,
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "linear-gradient(135deg,#D9FF00,#A6CC00)",
              color: "#0a0a0a",
              fontSize: 11,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {letter}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#D9FF00", letterSpacing: "0.06em" }}>
            {title}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: "#94a3b8", lineHeight: 1.6 }}>{body}</p>
      </div>
      {children}
    </section>
  );
}
