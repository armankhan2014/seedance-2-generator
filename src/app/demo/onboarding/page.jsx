"use client";
//
// DEMO — Beginner Onboarding on first visit to /generate.
//
// Goal: brand-new user lands on /generate, sees a single friendly card
// with 3 starter examples and a Skip button. Tapping a starter pre-fills
// the prompt + switches to the right mode + (for image/story starters)
// pre-seeds the cast or opens the upload picker. Once dismissed (via
// Skip or by tapping any starter), the card never shows again
// — gated by a localStorage flag `seedance_onboarded_v1`.
//
// This demo mocks the full /generate chrome so Arman can see where the
// card sits and how it dismisses to reveal the regular controls.

import { useState } from "react";

const COLOR_BG = "#0a0a0a";
const COLOR_PANEL = "#0f0f0f";
const COLOR_PANEL_SOFT = "#141414";
const COLOR_BORDER = "#2a2a2a";
const COLOR_BORDER_HOVER = "rgba(200,241,53,0.40)";
const COLOR_TEXT = "#e0e0e0";
const COLOR_MUTED = "#888";
const COLOR_ACCENT = "#c8f135";

// ── 3 starter examples ────────────────────────────────────────────────────
const STARTERS = [
  {
    id: "coffee",
    emoji: "🎬",
    title: "Cinematic Coffee Pour",
    blurb: "Hot espresso pouring into a glass cup, golden hour light, slow motion.",
    mode: "text-to-video",
    duration: 5,
    prompt:
      "A cinematic close-up of rich black espresso pouring into a clear glass cup, sunlight streaming through warm wooden window blinds, golden hour light catching the steam — shallow depth of field, anamorphic lens, slow motion at 40% speed. 35mm film grain, shallow focus on the rim of the glass.",
  },
  {
    id: "bring-alive",
    emoji: "📸",
    title: "Bring Your Photo to Life",
    blurb: "Upload any still — we'll make the wind move, the light shift.",
    mode: "image-to-video",
    duration: 5,
    requiresImage: true,
    prompt:
      "Bring this photo to life with subtle natural motion — gentle wind through hair and fabric, soft light shifting across the face, eyes blinking slowly, a small smile forming. Keep the subject's face, clothing, and background IDENTICAL to the reference. Cinematic, photorealistic, no anime or cartoon styling.",
  },
  {
    id: "three-shot-story",
    emoji: "🎭",
    title: "3-Shot Story",
    blurb: "Multi-shot scene with face-locked cast across every shot.",
    mode: "story",
    badge: "STORY",
    seedsStory: true,
  },
];

export default function OnboardingDemo() {
  // Demo state — track whether the onboarding card is showing.
  // In production this is read from localStorage on mount.
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [pickedStarterId, setPickedStarterId] = useState(null);

  // Mock /generate state — just enough to demonstrate the starter dismissal.
  const [mode, setMode] = useState("text-to-video");
  const [prompt, setPrompt] = useState("");

  function pickStarter(starter) {
    setPickedStarterId(starter.id);
    setMode(starter.mode);
    setPrompt(starter.prompt || "");
    // Dismiss the onboarding so the user sees the regular page.
    setTimeout(() => setShowOnboarding(false), 500);
  }
  function skipOnboarding() {
    setShowOnboarding(false);
  }
  function resetDemo() {
    setShowOnboarding(true);
    setPickedStarterId(null);
    setMode("text-to-video");
    setPrompt("");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLOR_BG,
        color: COLOR_TEXT,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Top nav (mock) */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "rgba(10,10,10,0.85)",
          backdropFilter: "blur(10px)",
          borderBottom: `1px solid ${COLOR_BORDER}`,
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: COLOR_ACCENT,
              color: "#0a0a0a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            S
          </div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Seedance</div>
          <span
            style={{
              fontSize: 11,
              color: COLOR_ACCENT,
              fontWeight: 700,
              marginLeft: 12,
              letterSpacing: "0.08em",
            }}
          >
            DEMO · Onboarding
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            type="button"
            onClick={resetDemo}
            style={{
              padding: "5px 10px",
              background: "transparent",
              border: `1px solid ${COLOR_BORDER}`,
              color: COLOR_MUTED,
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ↻ Reset demo
          </button>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              background: "rgba(200,241,53,0.10)",
              border: `1px solid ${COLOR_BORDER_HOVER}`,
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            💎 <span>250 credits</span>
          </div>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "#2a2a2a",
              fontSize: 12,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            A
          </div>
        </div>
      </header>

      <main style={{ padding: "32px 16px 80px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          {/* Hero */}
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <h1
              style={{
                fontSize: 30,
                fontWeight: 800,
                margin: "0 0 8px",
                background: `linear-gradient(135deg, ${COLOR_ACCENT}, #fff)`,
                WebkitBackgroundClip: "text",
                color: "transparent",
                letterSpacing: "-0.02em",
              }}
            >
              Seedance Studio
            </h1>
            <p
              style={{
                fontSize: 13,
                color: COLOR_MUTED,
                maxWidth: 540,
                margin: "0 auto",
                lineHeight: 1.6,
              }}
            >
              The next generation of AI video creation.
            </p>
          </div>

          {/* ── ONBOARDING CARD (first visit only) ────────────────────── */}
          {showOnboarding && (
            <div
              style={{
                background: `linear-gradient(135deg, rgba(200,241,53,0.07), rgba(200,241,53,0.02))`,
                border: `1px solid ${COLOR_BORDER_HOVER}`,
                borderRadius: 14,
                padding: "22px 24px 18px",
                marginBottom: 24,
                position: "relative",
                animation: "fadein 0.4s ease",
              }}
            >
              {/* Skip button — top right */}
              <button
                type="button"
                onClick={skipOnboarding}
                style={{
                  position: "absolute",
                  top: 14,
                  right: 14,
                  padding: "4px 10px",
                  background: "transparent",
                  border: `1px solid ${COLOR_BORDER}`,
                  color: COLOR_MUTED,
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 6,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Skip ✕
              </button>

              {/* Heading */}
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: COLOR_ACCENT,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    fontWeight: 800,
                    marginBottom: 4,
                  }}
                >
                  ✨ Welcome
                </div>
                <h2
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    margin: "2px 0 4px",
                  }}
                >
                  Let's make your first video.
                </h2>
                <p
                  style={{
                    fontSize: 13,
                    color: COLOR_MUTED,
                    margin: 0,
                    lineHeight: 1.55,
                  }}
                >
                  Pick a starter to see how it works, or skip to dive
                  straight in.
                </p>
              </div>

              {/* 3 starters */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 12,
                }}
                className="starter-grid"
              >
                {STARTERS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => pickStarter(s)}
                    style={{
                      textAlign: "left",
                      padding: "14px 14px 12px",
                      background:
                        pickedStarterId === s.id
                          ? "rgba(200,241,53,0.12)"
                          : COLOR_PANEL_SOFT,
                      border: `1px solid ${
                        pickedStarterId === s.id ? COLOR_ACCENT : COLOR_BORDER
                      }`,
                      borderRadius: 10,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      color: COLOR_TEXT,
                      transition: "all 0.12s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          background: "rgba(200,241,53,0.08)",
                          border: `1px solid ${COLOR_BORDER}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 16,
                        }}
                      >
                        {s.emoji}
                      </div>
                      <span
                        style={{
                          fontSize: 9.5,
                          color: COLOR_ACCENT,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          fontWeight: 800,
                          padding: "2px 6px",
                          border: `1px solid ${COLOR_BORDER_HOVER}`,
                          borderRadius: 4,
                          background: "rgba(200,241,53,0.05)",
                        }}
                      >
                        {s.badge || s.mode.replace("-to-video", "")}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        marginBottom: 4,
                        color: COLOR_TEXT,
                      }}
                    >
                      {s.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: COLOR_MUTED,
                        lineHeight: 1.5,
                        minHeight: 36,
                      }}
                    >
                      {s.blurb}
                    </div>
                    <div
                      style={{
                        marginTop: 10,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: COLOR_ACCENT,
                      }}
                    >
                      Try this →
                    </div>
                  </button>
                ))}
              </div>

              {/* Subtle footer hint */}
              <div
                style={{
                  marginTop: 14,
                  fontSize: 11,
                  color: COLOR_MUTED,
                  textAlign: "center",
                }}
              >
                Each starter costs the same as a regular generation. You can
                edit the prompt before hitting Generate.
              </div>
            </div>
          )}

          {/* ── Regular /generate page (mock — only what's needed to show context) ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 24,
              opacity: showOnboarding ? 0.4 : 1,
              transition: "opacity 0.3s",
              pointerEvents: showOnboarding ? "none" : "auto",
            }}
            className="generate-grid"
          >
            {/* Left controls */}
            <section
              style={{
                background: COLOR_PANEL,
                border: `1px solid ${COLOR_BORDER}`,
                borderRadius: 12,
                padding: 22,
                display: "flex",
                flexDirection: "column",
                gap: 18,
              }}
            >
              {/* Generator badge */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 8,
                    background: "rgba(200,241,53,0.10)",
                    border: `1px solid ${COLOR_BORDER_HOVER}`,
                    color: COLOR_ACCENT,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                  }}
                >
                  ✨
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                    }}
                  >
                    Seedance Generator
                  </div>
                  <div style={{ fontSize: 10, color: COLOR_MUTED }}>
                    Minimal Video Engine
                  </div>
                </div>
              </div>

              {/* Mode pills */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  padding: 4,
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${COLOR_BORDER}`,
                  borderRadius: 8,
                  gap: 2,
                }}
              >
                {[
                  { id: "text-to-video", label: "Text" },
                  { id: "image-to-video", label: "Image" },
                  { id: "reference-to-video", label: "Reference" },
                  { id: "story", label: "Story", badge: "NEW" },
                ].map((m) => {
                  const active = mode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      style={{
                        padding: "8px 6px",
                        background: active ? COLOR_ACCENT : "transparent",
                        color: active ? "#0a0a0a" : COLOR_MUTED,
                        border: "none",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        position: "relative",
                      }}
                    >
                      {m.label}
                      {m.badge && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 8.5,
                            fontWeight: 800,
                            padding: "1px 4px",
                            borderRadius: 3,
                            background: active ? "#0a0a0a" : COLOR_ACCENT,
                            color: active ? COLOR_ACCENT : "#0a0a0a",
                            verticalAlign: "middle",
                            letterSpacing: "0.05em",
                          }}
                        >
                          {m.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Prompt area (with the picked starter pre-filled) */}
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: COLOR_MUTED,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                    marginBottom: 6,
                  }}
                >
                  Prompt
                </div>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe your video…"
                  rows={6}
                  style={{
                    width: "100%",
                    background: "#0a0a0a",
                    border: `1px solid ${COLOR_BORDER}`,
                    color: COLOR_TEXT,
                    fontFamily: "inherit",
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    padding: "12px 14px",
                    borderRadius: 8,
                    resize: "vertical",
                    minHeight: 110,
                    outline: "none",
                  }}
                />
                {pickedStarterId && !showOnboarding && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "8px 10px",
                      background: "rgba(200,241,53,0.06)",
                      border: `1px solid ${COLOR_BORDER_HOVER}`,
                      borderRadius: 6,
                      fontSize: 11.5,
                      color: COLOR_ACCENT,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    ✓ Loaded the starter — edit freely before generating.
                  </div>
                )}
              </div>

              {/* Big Generate (mocked) */}
              <button
                type="button"
                onClick={() => window.alert("Mock — would call /api/seedance with the prompt above.")}
                disabled={!prompt.trim()}
                style={{
                  padding: "12px 18px",
                  background: COLOR_ACCENT,
                  color: "#0a0a0a",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: prompt.trim() ? "pointer" : "not-allowed",
                  fontFamily: "inherit",
                  letterSpacing: "0.02em",
                  opacity: prompt.trim() ? 1 : 0.55,
                }}
              >
                ▶ Generate (120 credits)
              </button>
            </section>

            {/* Right preview placeholder */}
            <section
              style={{
                background: COLOR_PANEL,
                border: `1px solid ${COLOR_BORDER}`,
                borderRadius: 12,
                padding: 22,
                minHeight: 380,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: COLOR_MUTED,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  marginBottom: 14,
                }}
              >
                Preview
              </div>
              <div
                style={{
                  width: "100%",
                  aspectRatio: "16/9",
                  background: "rgba(255,255,255,0.03)",
                  border: `1px dashed ${COLOR_BORDER}`,
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: COLOR_MUTED,
                  fontSize: 13,
                }}
              >
                Your video appears here
              </div>
            </section>
          </div>

          {/* Notes */}
          <div
            style={{
              marginTop: 28,
              padding: 18,
              background: COLOR_PANEL,
              border: `1px solid ${COLOR_BORDER}`,
              borderRadius: 12,
              fontSize: 12.5,
              color: COLOR_MUTED,
              lineHeight: 1.7,
            }}
          >
            <div
              style={{
                color: COLOR_TEXT,
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              How it works
            </div>
            • Shown ONCE on first visit. Dismissed via Skip OR by tapping any starter card.<br />
            • Once dismissed, gated by <code style={codeStyle}>seedance_onboarded_v1</code> in localStorage — never shows again for that user.<br />
            • Tapping a starter pre-fills the prompt, switches mode, and for the Story starter also seeds 2 example cast members + 3 demo shots.<br />
            • <b>↻ Reset demo</b> in the top right re-shows the card so Arman can swap copy + layout.
          </div>
        </div>
      </main>

      <style>{`
        @keyframes fadein {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 760px) {
          .starter-grid { grid-template-columns: 1fr !important; }
          .generate-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

const codeStyle = {
  background: "#1a1a1a",
  border: "1px solid #2a2a2a",
  borderRadius: 4,
  padding: "1px 6px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 11,
  color: "#c8f135",
};
