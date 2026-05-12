"use client";
//
// /demo/smart-prompt — preview page for the Feature 1 Smart Prompt
// component before it gets ported into GenerateClient.jsx. Lets Arman
// click around, type short ideas, hit ✦ Expand, and see how the
// component behaves at each word-count boundary on both desktop and
// mobile.
//
// This page deletes itself once Feature 1 is live in production.

import { useState } from "react";
import SmartPrompt from "@/components/saas/SmartPrompt";

const DURATIONS = [5, 10, 15];

export default function SmartPromptDemoPage() {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(5);

  const tryExamples = [
    "a man drives through town",
    "a woman walks through a rainy Tokyo street at night",
    "a vintage car drives through an empty desert highway",
  ];

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#e0e0e0",
        padding: "40px 24px",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <header style={{ marginBottom: 32 }}>
          <p
            style={{
              margin: "0 0 6px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              color: "#c8f135",
            }}
          >
            Demo · Smart Prompt (Feature 1)
          </p>
          <h1
            style={{
              margin: 0,
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "#fff",
            }}
          >
            One textarea. One button. One step.
          </h1>
          <p
            style={{
              margin: "12px 0 0",
              fontSize: 14,
              color: "#888",
              lineHeight: 1.55,
            }}
          >
            Type a short idea below, then tap ✦ Expand my idea. The button only
            shows when you have 1–29 words. Try one of these to start:
          </p>
        </header>

        {/* Try-this row */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 18,
          }}
        >
          {tryExamples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setPrompt(ex)}
              style={{
                padding: "8px 14px",
                background: "rgba(200,241,53,0.06)",
                border: "1px solid rgba(200,241,53,0.32)",
                borderRadius: 999,
                color: "#c8f135",
                fontSize: 12.5,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              "{ex}"
            </button>
          ))}
        </div>

        {/* Duration picker — mimics the Settings panel on /generate */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 14,
            fontSize: 13,
            color: "#888",
          }}
        >
          <span style={{ letterSpacing: "0.05em" }}>Duration:</span>
          {DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDuration(d)}
              style={{
                padding: "6px 12px",
                background: duration === d ? "#c8f135" : "transparent",
                color: duration === d ? "#0a0a0a" : "#e0e0e0",
                border: `1px solid ${duration === d ? "#c8f135" : "#2a2a2a"}`,
                borderRadius: 6,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {d}s
            </button>
          ))}
        </div>

        {/* The component itself */}
        <SmartPrompt
          value={prompt}
          onChange={setPrompt}
          duration={duration}
          onUpgrade={() => alert("Would open the credits / upgrade modal in /generate.")}
        />

        {/* Diagnostic strip — shows what the integration will see when
            you wire it into GenerateClient.jsx. Hidden on the real
            page; here for sign-off only. */}
        <div
          style={{
            marginTop: 28,
            padding: "14px 16px",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid #2a2a2a",
            borderRadius: 12,
            fontSize: 12.5,
            color: "#888",
            lineHeight: 1.55,
          }}
        >
          <p style={{ margin: "0 0 8px", color: "#c8f135", fontWeight: 700 }}>
            What the parent sees
          </p>
          <code style={{ fontSize: 11.5, color: "#888" }}>
            duration: {duration}s · words: {prompt.match(/\S+/g)?.length || 0} ·
            chars: {prompt.length}
          </code>
          <p style={{ margin: "10px 0 0" }}>
            <strong style={{ color: "#e0e0e0" }}>Test scenarios:</strong>
          </p>
          <ul style={{ margin: "6px 0 0", padding: "0 0 0 20px" }}>
            <li>Empty → no button.</li>
            <li>1–29 words → ✦ Expand button shows.</li>
            <li>30+ words → button hides.</li>
            <li>
              Tap Expand → 1 credit debited (charged before the Anthropic call,
              refunded on failure — same pattern as /api/prompt/build).
            </li>
            <li>
              Server error → friendly red message in the footer that you can
              dismiss with the ✕.
            </li>
          </ul>
        </div>

        <footer
          style={{
            marginTop: 28,
            padding: "14px 16px",
            background: "rgba(200,241,53,0.04)",
            border: "1px solid rgba(200,241,53,0.18)",
            borderRadius: 12,
            fontSize: 13,
            color: "#c8f135",
            lineHeight: 1.55,
          }}
        >
          <strong>When you approve:</strong> the component drops into{" "}
          <code style={{ background: "rgba(0,0,0,0.3)", padding: "2px 6px", borderRadius: 4 }}>
            GenerateClient.jsx
          </code>{" "}
          line ~598, replacing the existing <code>&lt;textarea&gt;</code>. The
          old "✨ Build my prompt" button gets removed; "🎨 Build my reference"
          stays untouched. This demo route deletes itself on the same commit.
        </footer>
      </div>
    </main>
  );
}
