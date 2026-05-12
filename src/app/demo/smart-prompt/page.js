"use client";
//
// /demo/smart-prompt — full /generate interface mockup showing ALL
// four features from Arman's 2026-05-12 brief side-by-side so he can
// eyeball the entire UI before any of it ships to the live page:
//
//   F1 — Smart Prompt (✦ Expand my idea) — the textarea replacement
//   F2 — Story Builder tab teaser
//   F3 — Beginner Onboarding starter card (top of page)
//   F4 — Multiple Output Previews (2×2 grid on right)
//
// Mode tabs (Text / Image / Reference) and the image uploader from
// the real /generate are mirrored here too so the integration is
// obvious. Everything is mock — no credits charged, no API calls
// except the live /api/prompt/expand for F1.
//
// Page deletes itself the moment Arman signs off and we port to
// GenerateClient.jsx.

import { useRef, useState } from "react";
import SmartPrompt from "@/components/saas/SmartPrompt";

const MODES = [
  { id: "text-to-video", label: "Text to Video", icon: "⚡" },
  { id: "image-to-video", label: "Image to Video", icon: "🖼" },
  { id: "reference-to-video", label: "Reference to Video", icon: "🔁" },
];
const ASPECT_RATIOS = ["16:9", "9:16", "4:3", "3:4"];
const RESOLUTIONS = ["480p", "720p", "1080p"];
const DURATIONS = [5, 10, 15];
const QUALITIES = ["basic", "high"];

const ONBOARDING_EXAMPLES = [
  { text: "A woman walks through a rainy Tokyo street at night", tag: "City scene" },
  { text: "A man and his dog run along a beach at sunset", tag: "Outdoor action" },
  { text: "A vintage car drives through an empty desert highway", tag: "Cinematic drive" },
];

export default function DemoFullGeneratePage() {
  // ── Tab + prompt state ────────────────────────────────────────
  const [mode, setMode] = useState("text-to-video");
  const [prompt, setPrompt] = useState("");

  // ── Settings state ────────────────────────────────────────────
  const [aspect, setAspect] = useState("16:9");
  const [resolution, setResolution] = useState("720p");
  const [duration, setDuration] = useState(5);
  const [quality, setQuality] = useState("basic");

  // ── Image upload ──────────────────────────────────────────────
  // Real file picker — reads files locally with FileReader and shows
  // a data URL preview. No R2 upload from the demo (we're just
  // verifying layout). On the real /generate page the same picker
  // exists already and uploads to R2 via /api/upload.
  const [images, setImages] = useState([]); // [{ url, label, name }]
  const fileInputRef = useRef(null);

  // ── Onboarding card visibility ────────────────────────────────
  const [showOnboarding, setShowOnboarding] = useState(true);

  // ── Story mode toggle (Feature 2 preview) ─────────────────────
  const [storyMode, setStoryMode] = useState(false);

  // ── Build-my-reference modal (existing feature — preserved) ───
  // The 🎨 Build my reference button opens the existing ImageBuilder
  // modal on the live /generate page. We mock it here so the demo
  // shows the FULL prompt section layout (button + textarea + counter).
  const [showRefBuilder, setShowRefBuilder] = useState(false);

  // ── Generation simulation ─────────────────────────────────────
  const [variations, setVariations] = useState([]); // [{ id, label, selected }]
  const [generating, setGenerating] = useState(false);

  function simulateGenerate() {
    setGenerating(true);
    setVariations([
      { id: 1, label: "Variation 1", selected: false },
      { id: 2, label: "Variation 2", selected: false },
      { id: 3, label: "Variation 3", selected: false },
      { id: 4, label: "Variation 4", selected: false },
    ]);
    setTimeout(() => setGenerating(false), 1400);
  }

  function selectVariation(id) {
    setVariations((vs) =>
      vs.map((v) => ({ ...v, selected: v.id === id }))
    );
  }

  function openFilePicker() {
    if (images.length >= 9) return;
    fileInputRef.current?.click();
  }

  async function handleFilesPicked(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    // Cap how many new files we'll accept so the cap of 9 holds.
    const room = 9 - images.length;
    const toAdd = files.slice(0, room);
    const reads = toAdd.map(
      (f) =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              url: reader.result,
              label: `@image${images.length + 1}`,
              name: f.name,
            });
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(f);
        })
    );
    const results = (await Promise.all(reads)).filter(Boolean);
    // Re-label sequentially so @image1, @image2, … stays consistent
    // when the user adds a batch.
    setImages((prev) => {
      const merged = [...prev, ...results];
      return merged.map((img, i) => ({ ...img, label: `@image${i + 1}` }));
    });
    // Reset the input so picking the same file twice still fires
    // the change event.
    event.target.value = "";
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#e0e0e0",
        padding: "24px 18px 80px",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        {/* ───────── Header ───────── */}
        <header style={{ marginBottom: 22 }}>
          <p style={S.eyebrow}>Demo · full /generate interface (all 4 features)</p>
          <h1 style={S.h1}>Seedance v2.0 Playground</h1>
          <p style={S.subtitle}>
            Transform your text and images into high-quality cinematic videos using
            our advanced AI engine.
          </p>
        </header>

        {/* ───────── F3: Beginner Onboarding starter card ───────── */}
        {showOnboarding && (
          <section
            style={{
              position: "relative",
              padding: "18px 20px",
              marginBottom: 20,
              background: "linear-gradient(135deg, rgba(200,241,53,0.06) 0%, rgba(200,241,53,0.02) 100%)",
              border: "1px solid rgba(200,241,53,0.32)",
              borderRadius: 12,
            }}
          >
            <FeatureTag>FEATURE 3 · Onboarding (first visit only)</FeatureTag>
            <button
              onClick={() => setShowOnboarding(false)}
              aria-label="Dismiss"
              style={S.dismiss}
            >
              ×
            </button>
            <p style={{ margin: "0 0 4px", fontSize: 11, color: "#c8f135", fontWeight: 700, letterSpacing: "0.18em" }}>
              NEW HERE? START WITH ONE OF THESE
            </p>
            <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 700, color: "#fff" }}>
              Describe your idea → Hit Expand → Generate
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              {ONBOARDING_EXAMPLES.map((ex) => (
                <button
                  key={ex.text}
                  type="button"
                  onClick={() => {
                    setPrompt(ex.text);
                    setShowOnboarding(false);
                  }}
                  style={S.starter}
                >
                  <span style={{ display: "block", fontSize: 10, color: "#c8f135", letterSpacing: "0.18em", fontWeight: 700, marginBottom: 4 }}>
                    {ex.tag.toUpperCase()}
                  </span>
                  <span style={{ display: "block", fontSize: 13, color: "#e0e0e0", lineHeight: 1.4 }}>
                    "{ex.text}"
                  </span>
                  <span style={{ display: "block", marginTop: 8, fontSize: 11, color: "#888" }}>
                    Try this →
                  </span>
                </button>
              ))}
            </div>
            <p style={{ margin: "12px 0 0", fontSize: 11.5, color: "#888" }}>
              <strong style={{ color: "#c8f135" }}>1.</strong> Describe your idea
              {" → "}
              <strong style={{ color: "#c8f135" }}>2.</strong> Hit Expand
              {" → "}
              <strong style={{ color: "#c8f135" }}>3.</strong> Generate
            </p>
          </section>
        )}

        {/* ───────── F2: Story Builder mode toggle ───────── */}
        <div style={S.modeToggle}>
          <FeatureTag inline>FEATURE 2 · Story Builder mode (multi-shot)</FeatureTag>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setStoryMode(false)}
              style={{ ...S.modePill, ...(storyMode ? S.modePillOff : S.modePillOn) }}
            >
              Single shot
            </button>
            <button
              type="button"
              onClick={() => setStoryMode(true)}
              style={{ ...S.modePill, ...(storyMode ? S.modePillOn : S.modePillOff) }}
            >
              Story mode
            </button>
          </div>
        </div>

        {/* Main 2-column layout */}
        <div style={S.split}>
          {/* ============ LEFT — controls ============ */}
          <section style={S.panel}>
            {/* Mode tabs */}
            <div style={S.tabRow}>
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  style={{
                    ...S.tab,
                    ...(mode === m.id ? S.tabActive : {}),
                  }}
                >
                  <span style={{ marginRight: 6 }}>{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>

            {/* Prompt section */}
            <div style={{ marginTop: 18 }}>
              <div style={S.labelRow}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <label style={S.label}>PROMPT</label>
                  {/* 🎨 Build my reference — KEPT from the live page.
                      Per the brief: "Keep Build my reference exactly
                      as it is — that is a different feature." Demo
                      mocks the click with an info modal so Arman can
                      see where it sits in the layout. */}
                  <button
                    type="button"
                    onClick={() => setShowRefBuilder(true)}
                    style={S.refBuilderBtn}
                  >
                    🎨 Build my reference
                  </button>
                </div>
                <span style={S.wordCount}>
                  {prompt.match(/\S+/g)?.length || 0} / 20,000 words
                </span>
              </div>

              <FeatureTag inline>FEATURE 1 · ✦ Expand my idea (live)</FeatureTag>
              <div style={{ marginTop: 8 }}>
                <SmartPrompt
                  value={prompt}
                  onChange={setPrompt}
                  duration={duration}
                  placeholder={
                    mode === "reference-to-video"
                      ? "Use @image1, @video1, @audio1 to reference your files…"
                      : storyMode
                        ? "Describe shot 1 of your story…"
                        : "Describe your video…"
                  }
                  onUpgrade={() =>
                    alert("Would open the credits / upgrade modal in /generate.")
                  }
                />
              </div>
            </div>

            {/* Image uploader — visible for Image-to-Video + Reference */}
            {mode !== "text-to-video" && (
              <div style={{ marginTop: 18 }}>
                <div style={S.labelRow}>
                  <label style={S.label}>
                    {mode === "image-to-video" ? "IMAGE" : "IMAGES"} ({images.length}/9)
                  </label>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={handleFilesPicked}
                />
                <button
                  type="button"
                  onClick={openFilePicker}
                  style={S.uploadBtn}
                  disabled={images.length >= 9}
                >
                  📷 {images.length >= 9 ? "Max reached (9/9)" : "Upload image"}
                </button>
                {images.length > 0 && (
                  <div style={S.imageGrid}>
                    {images.map((img, i) => (
                      <div key={i} style={S.imageTile}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt="" style={S.imageThumb} />
                        <button
                          onClick={() =>
                            setImages((prev) =>
                              prev
                                .filter((_, idx) => idx !== i)
                                .map((img, idx) => ({ ...img, label: `@image${idx + 1}` }))
                            )
                          }
                          style={S.removeBtn}
                          aria-label="Remove"
                        >
                          ×
                        </button>
                        <span style={S.imageTag}>{img.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p style={{ margin: "8px 0 0", fontSize: 10.5, color: "#666" }}>
                  Demo upload — your photos stay on this device (we just preview
                  the layout). On the real /generate page the picker compresses
                  to ≤ 2048 px and uploads to R2 via /api/upload.
                </p>
              </div>
            )}

            {/* Story mode shot list (Feature 2 teaser) */}
            {storyMode && (
              <div style={{ marginTop: 18, padding: 14, background: "rgba(255,255,255,0.025)", border: "1px solid #2a2a2a", borderRadius: 10 }}>
                <FeatureTag inline>FEATURE 2 · Shot list preview (not built yet)</FeatureTag>
                <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#888", lineHeight: 1.5 }}>
                  In Story mode each shot becomes its own SmartPrompt with a character
                  picker (using coloured dots from the Cast panel). When you sign off
                  on F1, we build out Cast + Shot stack + Generate-all-shots here.
                </p>
              </div>
            )}

            {/* Settings grid */}
            <div style={{ marginTop: 22 }}>
              <FeatureTag inline>EXISTING · Settings (untouched)</FeatureTag>
              <div style={S.settingsGrid}>
                <Select label="ASPECT RATIO" value={aspect} options={ASPECT_RATIOS} onChange={setAspect} />
                <Select label="RESOLUTION" value={resolution} options={RESOLUTIONS} onChange={setResolution} />
                <Select label="DURATION" value={duration} options={DURATIONS} onChange={(v) => setDuration(Number(v))} format={(v) => `${v}s`} />
                <Select label="QUALITY" value={quality} options={QUALITIES} onChange={setQuality} format={(v) => v[0].toUpperCase() + v.slice(1)} />
              </div>
            </div>

            {/* Generate button */}
            <button
              type="button"
              onClick={simulateGenerate}
              disabled={
                generating ||
                (mode === "text-to-video" && !prompt.trim()) ||
                (mode !== "text-to-video" && images.length === 0)
              }
              style={{
                ...S.generateBtn,
                opacity:
                  generating ||
                  (mode === "text-to-video" && !prompt.trim()) ||
                  (mode !== "text-to-video" && images.length === 0)
                    ? 0.5
                    : 1,
              }}
            >
              {generating ? "✨ Generating…" : "Generate (120 Credits)"}
            </button>
          </section>

          {/* ============ RIGHT — preview ============ */}
          <section style={S.panel}>
            <FeatureTag inline>FEATURE 4 · Multiple output previews (2×2 grid)</FeatureTag>
            <div style={S.previewHeader}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#fff" }}>
                Preview
              </h3>
              {variations.some((v) => v.selected) && (
                <button
                  style={S.downloadBtn}
                  onClick={() => alert("Would download the selected variation.")}
                >
                  ⬇ Download selected
                </button>
              )}
            </div>

            {variations.length === 0 ? (
              <div style={S.emptyPreview}>
                <div style={{ fontSize: 32, opacity: 0.5 }}>🎬</div>
                <p style={{ margin: "10px 0 0", fontSize: 13, color: "#666" }}>
                  Hit Generate to see 4 variations here
                </p>
              </div>
            ) : (
              <div style={S.previewGrid}>
                {variations.map((v) => (
                  <div
                    key={v.id}
                    style={{
                      ...S.previewTile,
                      ...(v.selected ? S.previewTileSelected : {}),
                    }}
                  >
                    <div style={S.previewMedia}>
                      {generating ? (
                        <div style={S.shimmer}>generating…</div>
                      ) : (
                        <span style={{ fontSize: 22, opacity: 0.5 }}>▶</span>
                      )}
                    </div>
                    <div style={S.previewActions}>
                      <span style={{ fontSize: 11, color: "#888" }}>{v.label}</span>
                      {!generating && (
                        <button
                          onClick={() => selectVariation(v.id)}
                          style={{
                            ...S.selectBtn,
                            ...(v.selected ? S.selectBtnActive : {}),
                          }}
                        >
                          {v.selected ? "✓ Selected" : "Select"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p style={{ margin: "14px 0 0", fontSize: 11, color: "#666", lineHeight: 1.55 }}>
              The current page shows one video. F4 swaps this to 4 thumbnails — user
              picks their favourite, green-bordered, downloads it. The 4 variations
              come from running the same prompt with 4 random seeds.
            </p>
          </section>
        </div>

        {/* ───────── Footer notes ───────── */}
        <section
          style={{
            marginTop: 32,
            padding: 18,
            background: "rgba(200,241,53,0.04)",
            border: "1px solid rgba(200,241,53,0.18)",
            borderRadius: 12,
            color: "#cbd5e1",
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          <p style={{ margin: "0 0 10px", color: "#c8f135", fontWeight: 700 }}>
            How to use this demo
          </p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>
              <strong>Live:</strong> The Smart Prompt textarea (F1) actually calls{" "}
              <code style={S.code}>/api/prompt/expand</code> and charges 1 credit.
              Refunds on failure — same pattern as the existing /build route.
            </li>
            <li>
              <strong>Mock:</strong> Image upload, Generate, the 2×2 preview, Story
              mode toggle, and the onboarding card. Click around to see the layout
              you'd get when each ships.
            </li>
            <li>
              <strong>Untouched on real /generate:</strong> the existing
              PromptBuilder and ImageBuilder modals stay until F1 is ported. The
              "🎨 Build my reference" button is preserved per the brief.
            </li>
          </ul>
          <p style={{ margin: "16px 0 0" }}>
            <strong style={{ color: "#fff" }}>Tell me what to change.</strong> Any
            piece you want different — text, spacing, button order, the way Story
            mode looks, the onboarding card copy — just say. I'll update this demo
            until it's right, then port to the real page.
          </p>
        </section>

        {/* ───────── Build-my-reference info modal ───────── */}
        {showRefBuilder && (
          <div
            onClick={() => setShowRefBuilder(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              zIndex: 100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 460,
                padding: 24,
                background: "#111",
                border: "1px solid #2a2a2a",
                borderRadius: 14,
              }}
            >
              <FeatureTag>EXISTING FEATURE · unchanged in port</FeatureTag>
              <h2 style={{ margin: "0 0 10px", fontSize: 19, fontWeight: 700, color: "#fff" }}>
                🎨 Build my reference
              </h2>
              <p style={{ margin: "0 0 12px", fontSize: 13.5, color: "#cbd5e1", lineHeight: 1.55 }}>
                On the real <code style={S.code}>/generate</code> page this opens
                the existing <strong style={{ color: "#c8f135" }}>ImageBuilder</strong>{" "}
                modal — same one you already have. The brief explicitly says to
                keep this feature exactly as it is.
              </p>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: "#888", lineHeight: 1.55 }}>
                In the port: this button stays where it is, this modal stays
                where it is, nothing about the reference-image workflow changes.
                Only the textarea + "✨ Build my prompt" button get replaced by
                the SmartPrompt above.
              </p>
              <button
                onClick={() => setShowRefBuilder(false)}
                style={{
                  width: "100%",
                  padding: "10px 16px",
                  background: "#c8f135",
                  color: "#0a0a0a",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// ────────────────────────────────────────────────────────────────
// Small UI helpers
// ────────────────────────────────────────────────────────────────

function FeatureTag({ children, inline = false }) {
  return (
    <span
      style={{
        display: inline ? "inline-block" : "inline-block",
        padding: "3px 8px",
        marginBottom: inline ? 0 : 8,
        background: "rgba(200,241,53,0.08)",
        border: "1px solid rgba(200,241,53,0.32)",
        color: "#c8f135",
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        borderRadius: 4,
      }}
    >
      {children}
    </span>
  );
}

function Select({ label, value, options, onChange, format }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 10, color: "#888", letterSpacing: "0.16em", fontWeight: 600, marginBottom: 6 }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 10px",
          background: "#141414",
          border: "1px solid #2a2a2a",
          borderRadius: 8,
          color: "#e0e0e0",
          fontSize: 13,
          fontFamily: "inherit",
          cursor: "pointer",
          outline: "none",
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>{format ? format(o) : o}</option>
        ))}
      </select>
    </label>
  );
}

// ────────────────────────────────────────────────────────────────
// Style tokens (pure inline so this page is self-contained)
// ────────────────────────────────────────────────────────────────

const S = {
  eyebrow: {
    margin: "0 0 6px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.32em",
    textTransform: "uppercase",
    color: "#c8f135",
  },
  h1: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    color: "#fff",
  },
  subtitle: {
    margin: "10px 0 0",
    fontSize: 14,
    color: "#888",
    lineHeight: 1.55,
    maxWidth: 640,
  },
  dismiss: {
    position: "absolute",
    top: 10,
    right: 12,
    width: 26,
    height: 26,
    background: "transparent",
    border: "none",
    color: "#888",
    fontSize: 20,
    cursor: "pointer",
    fontFamily: "inherit",
    borderRadius: 4,
  },
  starter: {
    textAlign: "left",
    padding: "12px 14px",
    background: "rgba(255,255,255,0.025)",
    border: "1px solid #2a2a2a",
    borderRadius: 10,
    color: "#e0e0e0",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "background 0.15s, border-color 0.15s",
  },
  modeToggle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 18,
    padding: "10px 14px",
    background: "rgba(255,255,255,0.025)",
    border: "1px solid #2a2a2a",
    borderRadius: 10,
  },
  modePill: {
    padding: "6px 14px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    border: "1px solid #2a2a2a",
    transition: "background 0.15s, border-color 0.15s",
  },
  modePillOn: {
    background: "#c8f135",
    color: "#0a0a0a",
    borderColor: "#c8f135",
  },
  modePillOff: {
    background: "transparent",
    color: "#888",
  },
  split: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
    gap: 18,
  },
  panel: {
    padding: 18,
    background: "#111",
    border: "1px solid #2a2a2a",
    borderRadius: 14,
  },
  tabRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 4,
    padding: 4,
    background: "rgba(255,255,255,0.025)",
    border: "1px solid #2a2a2a",
    borderRadius: 8,
  },
  tab: {
    padding: "8px 10px",
    background: "transparent",
    border: "none",
    color: "#888",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    borderRadius: 6,
    transition: "background 0.15s, color 0.15s",
  },
  tabActive: {
    background: "#c8f135",
    color: "#0a0a0a",
  },
  labelRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  label: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.18em",
    color: "#888",
  },
  wordCount: {
    fontSize: 11,
    color: "#666",
    fontVariantNumeric: "tabular-nums",
  },
  refBuilderBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 8px",
    background: "rgba(200,241,53,0.10)",
    border: "1px solid rgba(200,241,53,0.32)",
    borderRadius: 6,
    color: "#c8f135",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.02em",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "background 0.15s",
  },
  uploadBtn: {
    width: "100%",
    padding: "11px 16px",
    background: "rgba(200,241,53,0.08)",
    border: "1px solid rgba(200,241,53,0.32)",
    borderRadius: 8,
    color: "#c8f135",
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    marginTop: 4,
  },
  imageGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
    gap: 8,
    marginTop: 10,
  },
  imageTile: {
    position: "relative",
    aspectRatio: "1/1",
    background: "#141414",
    borderRadius: 8,
    border: "1px solid #2a2a2a",
    overflow: "hidden",
  },
  imageThumb: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 4,
    border: "none",
    background: "rgba(239,68,68,0.9)",
    color: "#fff",
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  imageTag: {
    position: "absolute",
    bottom: 4,
    right: 4,
    padding: "2px 5px",
    background: "rgba(0,0,0,0.7)",
    color: "#fff",
    fontSize: 9,
    fontWeight: 700,
    borderRadius: 3,
  },
  settingsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 12,
    marginTop: 8,
  },
  generateBtn: {
    width: "100%",
    padding: "14px 20px",
    marginTop: 18,
    background: "linear-gradient(135deg, #c8f135 0%, #a4c826 100%)",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 10,
    color: "#0a0a0a",
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: "0.04em",
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: "0 8px 24px -8px rgba(200,241,53,0.4)",
    transition: "transform 0.1s",
  },
  previewHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    marginTop: 4,
  },
  downloadBtn: {
    padding: "7px 14px",
    background: "#c8f135",
    color: "#0a0a0a",
    border: "none",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  emptyPreview: {
    aspectRatio: "16/9",
    background: "#141414",
    border: "1px dashed #2a2a2a",
    borderRadius: 10,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  previewGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  previewTile: {
    background: "#141414",
    border: "1px solid #2a2a2a",
    borderRadius: 10,
    overflow: "hidden",
    transition: "border-color 0.18s, transform 0.15s",
  },
  previewTileSelected: {
    border: "2px solid #c8f135",
    boxShadow: "0 0 0 1px rgba(200,241,53,0.32)",
  },
  previewMedia: {
    aspectRatio: "16/9",
    background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#888",
    fontSize: 11,
  },
  shimmer: {
    fontSize: 10,
    color: "#888",
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    animation: "demo-shimmer 1.2s ease-in-out infinite alternate",
  },
  previewActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 10px",
  },
  selectBtn: {
    padding: "5px 12px",
    background: "transparent",
    border: "1px solid #2a2a2a",
    borderRadius: 6,
    color: "#888",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  selectBtnActive: {
    background: "rgba(200,241,53,0.08)",
    color: "#c8f135",
    borderColor: "rgba(200,241,53,0.5)",
  },
  code: {
    padding: "1px 5px",
    background: "rgba(0,0,0,0.4)",
    border: "1px solid #2a2a2a",
    borderRadius: 4,
    fontSize: 11.5,
    fontFamily: "monospace",
    color: "#c8f135",
  },
};
