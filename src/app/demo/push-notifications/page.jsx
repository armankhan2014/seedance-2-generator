"use client";
//
// DEMO — Push notifications UX for Seedance Studio.
//
// What this page shows (all in one scrollable surface so Arman can
// redline copy + colour in one read-through):
//
//   1. The /generate page mock with the contextual permission banner
//      that slides in when the user clicks "Generate" for the first
//      time. Two buttons: "Enable notifications" (fires OS prompt in
//      real life; toggles a state here) + "Not now" (dismisses for
//      14 days via localStorage in real life).
//
//   2. A side-by-side mock of the three OS-level notifications we
//      plan to send (video ready / gen failed-refunded / featured),
//      including the tap-action route each one opens.
//
//   3. The Settings → Notifications panel — master switch + 3 per-
//      type toggles. Defaults to all-on after the user opts in.
//
//   4. The in-app fallback banner that appears at the top of the
//      Studio shell for users who denied OS push but had a generation
//      complete (so they don't miss the result).
//
// Decisions locked (Arman 2026-05-14):
//   • Ask contextually after first Generate click — never on page load.
//   • Three push types only: ready / failed-refunded / featured.
//   • Tap-action goes straight to /v/<creationId> — no interstitial.
//   • Settings: master + 3 per-type toggles, default all-on after opt-in.
//   • No quiet hours, no per-device control in v1.
//
// Throwaway at /demo/push-notifications. Sign-off → port to live.

import { useState } from "react";

const C = {
  bg: "#0a0a0a",
  panel: "#141414",
  panelSoft: "#1c1c1c",
  border: "#2a2a2a",
  borderHover: "rgba(166,204,0,0.40)",
  text: "#f1f5f9",
  textSoft: "#cbd5e1",
  muted: "#64748b",
  accent: "#A6CC00",
  accentSoft: "rgba(166,204,0,0.10)",
  danger: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
};

export default function PushNotificationsDemo() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
      }}
    >
      <DemoBanner />
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 16px 96px" }}>
        <Heading />
        <SectionLabel n={1} title="Contextual permission banner" sub="Slides in on first Generate click — never on page load." />
        <GenerateMock />

        <SectionLabel n={2} title="System notifications" sub="What each push looks like on Mac / iOS / Android lock screen." />
        <NotificationCards />

        <SectionLabel n={3} title="Settings → Notifications" sub="Master switch + per-type toggles. Default all-on after opt-in." />
        <SettingsMock />

        <SectionLabel n={4} title="In-app fallback banner" sub="For users who denied OS push — surfaces ready / failed states when they return." />
        <FallbackBanner />

        <Footer />
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Top
// ─────────────────────────────────────────────────────────────────────────
function DemoBanner() {
  return (
    <div
      style={{
        background: C.accentSoft,
        borderBottom: `1px solid ${C.borderHover}`,
        padding: "8px 16px",
        textAlign: "center",
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: "0.08em",
        color: C.accent,
        textTransform: "uppercase",
      }}
    >
      ⚡ DEMO · push notifications UX · throwaway preview
    </div>
  );
}

function Heading() {
  return (
    <div style={{ marginBottom: 28 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
        Push notifications
      </h1>
      <p style={{ fontSize: 13, color: C.muted, margin: "8px 0 0", lineHeight: 1.6 }}>
        Close the async-gen gap: users start a 60–120s render, alt-tab away, and forget. A push pulls them back the
        moment the video is ready — so the credit they paid for becomes a moment of delight instead of a forgotten tab.
        <br />
        Below: the four UI surfaces in order. Click around the banners and toggles — everything is interactive.
      </p>
    </div>
  );
}

function SectionLabel({ n, title, sub }) {
  return (
    <div style={{ marginTop: 40, marginBottom: 14 }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 10px",
          background: C.accentSoft,
          border: `1px solid ${C.borderHover}`,
          borderRadius: 999,
          fontSize: 10.5,
          fontWeight: 800,
          color: C.accent,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {n} · {title}
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, marginTop: 8 }}>{sub}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 1) /generate page mock + permission banner
// ─────────────────────────────────────────────────────────────────────────
function GenerateMock() {
  const [stage, setStage] = useState("idle"); // idle | asking | granted | denied
  return (
    <div
      style={{
        position: "relative",
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 20,
        overflow: "hidden",
      }}
    >
      {/* Faux generate-page UI */}
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          color: C.accent,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        Generate · /generate
      </div>
      <div
        style={{
          marginTop: 14,
          padding: 14,
          background: C.panelSoft,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          fontSize: 13,
          color: C.textSoft,
          lineHeight: 1.55,
        }}
      >
        Slow-mo rain falling through a forest canopy, dappled afternoon light, anamorphic flare.
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
        <button
          onClick={() => setStage(stage === "idle" ? "asking" : stage)}
          style={{
            padding: "10px 18px",
            background: C.accent,
            border: "none",
            color: "#0a0a0a",
            fontSize: 13,
            fontWeight: 800,
            borderRadius: 8,
            cursor: "pointer",
            fontFamily: "inherit",
            letterSpacing: "0.02em",
          }}
        >
          ▶ Generate (80 credits)
        </button>
        <span style={{ fontSize: 11.5, color: C.muted }}>
          {stage === "idle"
            ? "Click Generate to see the banner slide in →"
            : stage === "asking"
              ? "Banner showing in the bottom-right."
              : stage === "granted"
                ? "Permission granted — subscription stored, fanout wired."
                : "Permission denied — in-app fallback (Section 4) kicks in."}
        </span>
      </div>

      {/* Slide-in banner */}
      {stage === "asking" && (
        <PermissionBanner
          onAccept={() => setStage("granted")}
          onDecline={() => setStage("denied")}
        />
      )}
      {stage !== "idle" && stage !== "asking" && (
        <button
          onClick={() => setStage("idle")}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "transparent",
            border: `1px solid ${C.border}`,
            color: C.muted,
            fontSize: 11,
            padding: "4px 10px",
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ↺ Reset
        </button>
      )}
    </div>
  );
}

function PermissionBanner({ onAccept, onDecline }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        right: 16,
        maxWidth: 360,
        background: C.panel,
        border: `1px solid ${C.borderHover}`,
        borderRadius: 14,
        boxShadow: "0 22px 60px -20px rgba(0,0,0,0.7)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        animation: "slideIn 0.32s ease-out",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: C.accentSoft,
            border: `1px solid ${C.borderHover}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          🔔
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: 1.35 }}>
            Don&rsquo;t sit and wait for your video
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.55 }}>
            We&rsquo;ll ping you the second it&rsquo;s ready — usually 60–120 seconds. Alt-tab freely.
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={onDecline}
          style={{
            flex: 1,
            background: "transparent",
            border: `1px solid ${C.border}`,
            color: C.textSoft,
            fontSize: 12.5,
            fontWeight: 600,
            padding: "8px 0",
            borderRadius: 8,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Not now
        </button>
        <button
          onClick={onAccept}
          style={{
            flex: 1.4,
            background: C.accent,
            border: "none",
            color: "#0a0a0a",
            fontSize: 12.5,
            fontWeight: 800,
            padding: "8px 0",
            borderRadius: 8,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Enable
        </button>
      </div>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 2) System notification preview cards
// ─────────────────────────────────────────────────────────────────────────
function NotificationCards() {
  const items = [
    {
      kind: "ready",
      title: "🎬 Your video is ready",
      body: "“Slow-mo rain falling through a forest canopy…” — tap to watch",
      tapsTo: "/v/<creationId>",
      tone: C.accent,
    },
    {
      kind: "failed",
      title: "⚠️ Generation didn't complete",
      body: "Face detection blocked this render — your 80 credits are back. Tap for details.",
      tapsTo: "/creations",
      tone: C.warning,
    },
    {
      kind: "featured",
      title: "⭐ You're featured",
      body: "An admin pinned your latest video to the home feed. Tap to see it live.",
      tapsTo: "/v/<creationId>",
      tone: C.info,
    },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 12,
      }}
    >
      {items.map((n) => (
        <NotificationPreview key={n.kind} {...n} />
      ))}
    </div>
  );
}

function NotificationPreview({ title, body, tapsTo, tone }) {
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 14,
        boxShadow: "0 8px 18px -8px rgba(0,0,0,0.4)",
        display: "flex",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: tone + "22",
          border: `1px solid ${tone}55`,
          color: tone,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          flexShrink: 0,
        }}
      >
        S
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: C.muted,
            marginBottom: 4,
          }}
        >
          <span>Seedance Studio</span>
          <span>·</span>
          <span>now</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.35 }}>
          {title}
        </div>
        <div style={{ fontSize: 11.5, color: C.textSoft, marginTop: 4, lineHeight: 1.5 }}>{body}</div>
        <div
          style={{
            marginTop: 8,
            fontSize: 10,
            color: tone,
            fontFamily: "ui-monospace, monospace",
            fontWeight: 700,
          }}
        >
          tap → {tapsTo}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 3) Settings panel
// ─────────────────────────────────────────────────────────────────────────
function SettingsMock() {
  const [master, setMaster] = useState(true);
  const [ready, setReady] = useState(true);
  const [failed, setFailed] = useState(true);
  const [featured, setFeatured] = useState(true);
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <header
        style={{
          padding: "14px 16px",
          borderBottom: `1px solid ${C.border}`,
          background: C.panelSoft,
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: C.text,
        }}
      >
        Notifications
      </header>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 4 }}>
        <ToggleRow
          label="Push notifications"
          sub="Master switch — turning off disables every push below."
          value={master}
          onChange={setMaster}
          accent
        />
        <Divider />
        <ToggleRow
          label="🎬 Video ready"
          sub="Ping me when a generation finishes (the main reason you're here)."
          value={ready}
          disabled={!master}
          onChange={setReady}
        />
        <ToggleRow
          label="⚠️ Generation failed / refunded"
          sub="So you don't sit waiting on a render that hit a content-policy block."
          value={failed}
          disabled={!master}
          onChange={setFailed}
        />
        <ToggleRow
          label="⭐ Featured by an admin"
          sub="Studio pinned your video to the home feed."
          value={featured}
          disabled={!master}
          onChange={setFeatured}
        />
      </div>
    </div>
  );
}

function ToggleRow({ label, sub, value, onChange, disabled, accent }) {
  return (
    <div
      style={{
        padding: "10px 4px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
      onClick={() => !disabled && onChange(!value)}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: accent ? 800 : 600,
            color: accent ? C.accent : C.text,
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>{sub}</div>
      </div>
      <Switch on={value} />
    </div>
  );
}

function Switch({ on }) {
  return (
    <div
      style={{
        width: 36,
        height: 22,
        borderRadius: 999,
        background: on ? C.accent : C.panelSoft,
        border: `1px solid ${on ? C.accent : C.border}`,
        position: "relative",
        transition: "background 0.18s, border-color 0.18s",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          left: on ? 16 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: on ? "#0a0a0a" : C.muted,
          transition: "left 0.18s",
        }}
      />
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: C.border, margin: "6px 0" }} />;
}

// ─────────────────────────────────────────────────────────────────────────
// 4) In-app fallback banner (denied permission)
// ─────────────────────────────────────────────────────────────────────────
function FallbackBanner() {
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 18,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          color: C.muted,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        Top of the Studio shell · only when there's something to show
      </div>
      <div
        style={{
          background: C.accentSoft,
          border: `1px solid ${C.borderHover}`,
          borderRadius: 10,
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 18 }}>🎬</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
            Your video is ready
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
            We tried to push but didn&rsquo;t have permission. <a href="#" style={{ color: C.accent }}>Enable pushes</a> to get this instantly next time.
          </div>
        </div>
        <button
          style={{
            background: C.accent,
            border: "none",
            color: "#0a0a0a",
            fontSize: 12,
            fontWeight: 800,
            padding: "8px 14px",
            borderRadius: 8,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Watch →
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <div
      style={{
        marginTop: 48,
        padding: "16px 18px",
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        fontSize: 12.5,
        color: C.muted,
        lineHeight: 1.6,
      }}
    >
      <b style={{ color: C.text }}>Once you OK this design, the live port is:</b>
      <br />
      • <b style={{ color: C.text }}>Schema</b> — add <code style={{ color: C.accent }}>PushSubscription</code> model (mirror from community) so the Studio Prisma client can store browser endpoints alongside the mobile <code>Device</code> tokens we already keep.<br />
      • <b style={{ color: C.text }}>VAPID keys</b> — generated once, stored in <code style={{ color: C.accent }}>.env</code>.<br />
      • <b style={{ color: C.text }}>API</b> — <code style={{ color: C.accent }}>/api/push/subscribe</code> + <code style={{ color: C.accent }}>/api/push/unsubscribe</code>.<br />
      • <b style={{ color: C.text }}>Service Worker</b> — add <code>push</code> + <code>notificationclick</code> handlers to <code>public/sw.js</code>.<br />
      • <b style={{ color: C.text }}>Fanout</b> — <code style={{ color: C.accent }}>lib/push.js</code> with <code>sendCreationReadyPush(userId, creationId)</code>, called from <code>/api/webhook/muapi</code> on both success and failure paths.<br />
      • <b style={{ color: C.text }}>UI</b> — the banner from Section 1 (slides in once per user), the toggles from Section 3 (under <code>/settings</code>), the fallback from Section 4 (mounted in the shell).<br />
      Mobile push (FCM/APNS) is a separate Phase C once the Firebase project is set up.
    </div>
  );
}
