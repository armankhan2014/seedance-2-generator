"use client";
//
// Inline sign-in prompt for /music/studio when the user isn't
// authenticated. Lives on the same URL as the DAW itself, so after
// signing in via NextAuth's signIn() with callbackUrl=/music/studio,
// the user lands back here automatically and StudioPage flips to
// rendering the full DAW.
//
// Visually matches the rest of /music/studio (same dark surface,
// lime accent) so users don't feel like they got dumped on a random
// page mid-flow.

import { signIn } from "next-auth/react";
import Link from "next/link";

const C = {
  bg: "#0a0a0a",
  panel: "#141414",
  panelSoft: "#1c1c1c",
  border: "#2a2a2a",
  borderHover: "rgba(217,255,0,0.40)",
  text: "#f1f5f9",
  textSoft: "#cbd5e1",
  muted: "#64748b",
  accent: "#D9FF00",
  accentDark: "#A6CC00",
};

export default function StudioSignIn() {
  function startGoogle() {
    signIn("google", { callbackUrl: "/music/studio" });
  }
  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: "100%",
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 20,
          padding: 32,
          boxShadow: "0 28px 80px -20px rgba(0,0,0,0.7)",
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            color: C.accent,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          🎛️ Studio Pro
        </div>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          Sign in to use the audio studio
        </h1>
        <p
          style={{
            fontSize: 14,
            color: C.muted,
            margin: "12px 0 24px",
            lineHeight: 1.55,
          }}
        >
          The multi-track DAW + stem separation is for signed-in
          Studio users. Sign in with Google to continue — you&rsquo;ll
          land right back here.
        </p>
        <button
          onClick={startGoogle}
          style={{
            width: "100%",
            padding: "14px 18px",
            borderRadius: 12,
            background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
            color: "#0a0a0a",
            border: "none",
            fontSize: 14,
            fontWeight: 800,
            cursor: "pointer",
            fontFamily: "inherit",
            letterSpacing: "0.02em",
          }}
        >
          Continue with Google
        </button>
        <Link
          href="/music"
          style={{
            display: "block",
            marginTop: 14,
            textAlign: "center",
            fontSize: 12.5,
            color: C.muted,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          ← Back to /music
        </Link>
      </div>
    </div>
  );
}
