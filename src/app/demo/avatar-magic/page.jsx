// Demo route for the "A" avatar magic animation. Lives at
// /demo/avatar-magic — preview-only, not linked from public nav.
// Once Arman picks a winner, that variant ships into the Avatar
// helper inside src/components/saas/Navbar.jsx and this directory
// deletes.
//
// Each variant is shown TWICE:
//   1. At nav scale (24 px) — exactly how it'll look in the top nav
//   2. At hero scale (96 px) — so the animation is easy to inspect
//
// Hover the hero-scale avatar to see the hover behaviour.

"use client";

export const dynamic = "force-static";

// ─── The base "A" avatar — same gradient + initial as the real
// Navbar Avatar component. Exposed as a prop-driven component so
// each variant can wrap it in its own animation layer.
function BaseAvatar({ size = 24, initial = "A" }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(135deg,#D9FF00,#A6CC00)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.42 + "px",
        fontWeight: 700,
        color: "#0a0a0a",
        flexShrink: 0,
        position: "relative",
        zIndex: 1,
      }}
    >
      {initial}
    </div>
  );
}

// ─── Variant A: Orbiting emojis ────────────────────────────────
// 3 film emojis orbit slowly around the avatar (30s loop, evenly
// spaced 120° apart). Always-on. Subtle, premium. Like planets
// around a sun.
function VariantOrbiting({ size = 24 }) {
  const orbitRadius = size * 0.95;
  const emojiSize = Math.max(10, size * 0.42);
  const emojis = ["🎬", "✨", "🎥"];
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-block",
      }}
    >
      <BaseAvatar size={size} />
      {emojis.map((e, i) => (
        <span
          key={i}
          className="amg-orbit"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 0,
            height: 0,
            // Stagger the start angle by 120° per emoji.
            ["--start-angle"]: `${i * 120}deg`,
            ["--orbit-r"]: `${orbitRadius}px`,
            ["--orbit-duration"]: "16s",
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%)`,
              fontSize: emojiSize,
              filter: "drop-shadow(0 0 4px rgba(217,255,0,0.5))",
              userSelect: "none",
            }}
          >
            {e}
          </span>
        </span>
      ))}
    </div>
  );
}

// ─── Variant B: Sparkle shimmer ────────────────────────────────
// Tiny ✨ sparkles pop in at random positions around the avatar,
// fade through, fade out. Five sparkles on different stagger so
// it never feels mechanical. AI-generated magic dust.
function VariantSparkleShimmer({ size = 24 }) {
  const sparkleSize = Math.max(8, size * 0.32);
  // 5 sparkle slots, each at a different angle + delay.
  const sparkles = [
    { angle: 30, delay: "0s" },
    { angle: 110, delay: "0.6s" },
    { angle: 190, delay: "1.2s" },
    { angle: 280, delay: "1.8s" },
    { angle: 350, delay: "2.4s" },
  ];
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-block",
      }}
    >
      <BaseAvatar size={size} />
      {sparkles.map((s, i) => {
        const r = size * 0.85;
        const rad = (s.angle * Math.PI) / 180;
        const x = Math.cos(rad) * r;
        const y = Math.sin(rad) * r;
        return (
          <span
            key={i}
            className="amg-sparkle"
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: `translate(${x}px, ${y}px)`,
              fontSize: sparkleSize,
              animationDelay: s.delay,
              userSelect: "none",
              pointerEvents: "none",
            }}
          >
            ✨
          </span>
        );
      })}
    </div>
  );
}

// ─── Variant C: Hover burst ────────────────────────────────────
// Static at rest. On hover (or tap on touch), 5 emojis fan out
// from the centre, expand 28 px outward, fade in then fade away.
// Quiet most of the time, magical when triggered.
function VariantHoverBurst({ size = 24 }) {
  const emojiSize = Math.max(11, size * 0.45);
  const burstR = size * 1.25;
  const emojis = ["🎬", "🎥", "✨", "🎞", "⭐"];
  return (
    <div className="amg-burst-wrap" style={{ position: "relative", width: size, height: size, display: "inline-block" }}>
      <BaseAvatar size={size} />
      {emojis.map((e, i) => {
        const angle = (i / emojis.length) * 360 - 90;
        const rad = (angle * Math.PI) / 180;
        const tx = Math.cos(rad) * burstR;
        const ty = Math.sin(rad) * burstR;
        return (
          <span
            key={i}
            className="amg-burst-particle"
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              fontSize: emojiSize,
              ["--tx"]: `${tx}px`,
              ["--ty"]: `${ty}px`,
              userSelect: "none",
              pointerEvents: "none",
            }}
          >
            {e}
          </span>
        );
      })}
    </div>
  );
}

// ─── Variant D: Combined magic (recommended) ───────────────────
// Subtle ambient sparkle shimmer at rest (3 sparkles) + a fuller
// emoji burst on hover. Best of both.
function VariantCombined({ size = 24 }) {
  const sparkleSize = Math.max(8, size * 0.30);
  const emojiSize = Math.max(11, size * 0.45);
  const burstR = size * 1.25;
  const sparkles = [
    { angle: 50, delay: "0s" },
    { angle: 170, delay: "1s" },
    { angle: 290, delay: "2s" },
  ];
  const emojis = ["🎬", "🎥", "✨", "🎞", "⭐"];
  return (
    <div className="amg-combined-wrap" style={{ position: "relative", width: size, height: size, display: "inline-block" }}>
      <BaseAvatar size={size} />
      {/* Ambient sparkles (always on) */}
      {sparkles.map((s, i) => {
        const r = size * 0.85;
        const rad = (s.angle * Math.PI) / 180;
        const x = Math.cos(rad) * r;
        const y = Math.sin(rad) * r;
        return (
          <span
            key={`s-${i}`}
            className="amg-sparkle"
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: `translate(${x}px, ${y}px)`,
              fontSize: sparkleSize,
              animationDelay: s.delay,
              userSelect: "none",
              pointerEvents: "none",
            }}
          >
            ✨
          </span>
        );
      })}
      {/* Hover-only burst */}
      {emojis.map((e, i) => {
        const angle = (i / emojis.length) * 360 - 90;
        const rad = (angle * Math.PI) / 180;
        const tx = Math.cos(rad) * burstR;
        const ty = Math.sin(rad) * burstR;
        return (
          <span
            key={`b-${i}`}
            className="amg-burst-particle"
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              fontSize: emojiSize,
              ["--tx"]: `${tx}px`,
              ["--ty"]: `${ty}px`,
              userSelect: "none",
              pointerEvents: "none",
            }}
          >
            {e}
          </span>
        );
      })}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────
export default function AvatarMagicDemoPage() {
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
      <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
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
          Demo · Avatar Magic
        </p>
        <h1
          style={{
            margin: "10px 0 6px",
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: "-0.01em",
          }}
        >
          Pick the &quot;A&quot; magic
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: "#94a3b8", lineHeight: 1.55 }}>
          Each variant is shown at nav scale (24 px) and hero scale (96 px) so
          you can judge subtlety AND see the animation easily. Hover the big
          one to test hover-only behaviour.
        </p>
      </div>

      <Section
        letter="A"
        title="Orbiting emojis"
        body="Three film emojis (🎬 ✨ 🎥) orbit slowly around the avatar on a 16s loop. Always-on. Premium and quiet — like planets around a sun."
      >
        <Stage>
          <ScalePair render={(size) => <VariantOrbiting size={size} />} />
        </Stage>
      </Section>

      <Section
        letter="B"
        title="Sparkle shimmer"
        body="Tiny ✨ sparkles pop in at five staggered points around the avatar, fade through, fade out. AI-generated magic dust feel — Midjourney / Firefly territory."
      >
        <Stage>
          <ScalePair render={(size) => <VariantSparkleShimmer size={size} />} />
        </Stage>
      </Section>

      <Section
        letter="C"
        title="Hover burst"
        body="Static at rest. On hover, five emojis (🎬 🎥 ✨ 🎞 ⭐) fan outward and fade away. Quiet most of the time, magical when triggered."
      >
        <Stage>
          <ScalePair render={(size) => <VariantHoverBurst size={size} />} hoverHint />
        </Stage>
      </Section>

      <Section
        letter="D"
        title="Combined magic ⭐ recommended"
        body="Subtle ambient sparkle shimmer at rest (so it always feels alive) PLUS a fuller emoji burst on hover. Both worlds — what your spec called 'Combined Magic'."
      >
        <Stage>
          <ScalePair render={(size) => <VariantCombined size={size} />} hoverHint />
        </Stage>
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
        <strong style={{ color: "#D9FF00" }}>&quot;go B&quot;</strong>,{" "}
        <strong style={{ color: "#D9FF00" }}>&quot;go C&quot;</strong>, or{" "}
        <strong style={{ color: "#D9FF00" }}>&quot;go D&quot;</strong> to ship
        the winner into the real Avatar component in{" "}
        <code style={{ color: "#cbd5e1" }}>Navbar.jsx</code>. Or describe a
        tweak — e.g. <em>&quot;A but only on hover&quot;</em> or{" "}
        <em>&quot;D with fewer emojis&quot;</em>.
      </p>

      {/* All variant-specific keyframes + hover behaviours, scoped to
          .amg-* selectors so this never bleeds. */}
      <style jsx global>{`
        /* Respect reduced-motion: kill every animation in this demo. */
        @media (prefers-reduced-motion: reduce) {
          .amg-orbit,
          .amg-sparkle,
          .amg-burst-particle {
            animation: none !important;
          }
        }

        /* ── Variant A: orbit */
        .amg-orbit {
          animation: amg-orbit-spin var(--orbit-duration, 16s) linear infinite;
          animation-delay: calc(var(--start-angle, 0deg) / 360deg * var(--orbit-duration, 16s) * -1);
          will-change: transform;
        }
        @keyframes amg-orbit-spin {
          from { transform: translate(-50%, -50%) rotate(0deg) translateX(var(--orbit-r, 24px)); }
          to   { transform: translate(-50%, -50%) rotate(360deg) translateX(var(--orbit-r, 24px)); }
        }

        /* ── Variant B + ambient layer in D: sparkle pop-in */
        .amg-sparkle {
          opacity: 0;
          animation: amg-sparkle-pop 3.6s ease-in-out infinite;
          will-change: opacity, transform;
        }
        @keyframes amg-sparkle-pop {
          0%, 100% { opacity: 0; transform-origin: center; }
          15% { opacity: 0; }
          25% { opacity: 1; }
          50% { opacity: 0.6; }
          75% { opacity: 0; }
        }

        /* ── Variant C + burst layer in D: hover fan-out */
        .amg-burst-particle {
          opacity: 0;
          transform: translate(-50%, -50%);
          transition:
            opacity 320ms ease,
            transform 480ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: opacity, transform;
        }
        .amg-burst-wrap:hover .amg-burst-particle,
        .amg-combined-wrap:hover .amg-burst-particle {
          opacity: 1;
          transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty)));
        }
        /* Stagger each particle by index — done with nth-of-type. */
        .amg-burst-wrap:hover .amg-burst-particle:nth-of-type(2),
        .amg-combined-wrap:hover .amg-burst-particle:nth-of-type(5) {
          transition-delay: 30ms;
        }
        .amg-burst-wrap:hover .amg-burst-particle:nth-of-type(3),
        .amg-combined-wrap:hover .amg-burst-particle:nth-of-type(6) {
          transition-delay: 60ms;
        }
        .amg-burst-wrap:hover .amg-burst-particle:nth-of-type(4),
        .amg-combined-wrap:hover .amg-burst-particle:nth-of-type(7) {
          transition-delay: 90ms;
        }
        .amg-burst-wrap:hover .amg-burst-particle:nth-of-type(5),
        .amg-combined-wrap:hover .amg-burst-particle:nth-of-type(8) {
          transition-delay: 120ms;
        }
      `}</style>
    </main>
  );
}

// ─── Small layout primitives ───────────────────────────────────
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

function Stage({ children }) {
  return (
    <div
      style={{
        background: "#0d0d0f",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 14,
        padding: "32px 20px",
        maxWidth: 600,
        margin: "0 auto",
      }}
    >
      {children}
    </div>
  );
}

function ScalePair({ render, hoverHint }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", gap: 24, flexWrap: "wrap" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ margin: "0 0 14px", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "#475569" }}>
          Nav scale (24 px)
        </p>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 80 }}>
          {render(24)}
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ margin: "0 0 14px", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "#475569" }}>
          Hero scale (96 px) {hoverHint && <span style={{ color: "#D9FF00" }}>· hover me</span>}
        </p>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 200 }}>
          {render(96)}
        </div>
      </div>
    </div>
  );
}
