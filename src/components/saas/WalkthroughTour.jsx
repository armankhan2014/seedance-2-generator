"use client";
//
// Walkthrough Tour — first-visit animated guide on /generate.
//
// Shows once, on the user's very first arrival at /generate. Teaches:
//   1. Type a short idea
//   2. Add one OR many reference images (multi-character story)
//   3. ✦ Expand my idea (label dynamically changes to "(with N images)")
//   4. The expanded prompt fills the textarea
//   5. Generate
//
// Designed in /demo/prompt-walkthrough (now ported, demo deleted). The
// tour is a centered modal overlay over /generate so the user can see
// the surrounding UI behind the dim backdrop — they're literally
// looking at the page they're about to use.
//
// Dismissal sets seedance_walkthrough_v1 in localStorage so it never
// auto-shows again. Parent (GenerateClient.jsx) owns the localStorage
// gate; this component just calls onClose() on Skip / Done.

import { useEffect, useRef, useState } from "react";
import { playClick } from "@/lib/clickSound";

const COLOR_BG = "#0a0a0a";
const COLOR_PANEL = "#0f0f0f";
const COLOR_BORDER = "#2a2a2a";
const COLOR_BORDER_HOVER = "rgba(200,241,53,0.40)";
const COLOR_TEXT = "#e0e0e0";
const COLOR_MUTED = "#888";
const COLOR_ACCENT = "#c8f135";

const SHORT_IDEA = "A cinematic close-up of an espresso pour at golden hour.";
const EXPANDED =
  "A cinematic close-up of an espresso pour at golden hour. Hot black espresso streams into a clear glass cup, warm sunlight streaming through wooden window blinds, dust motes drifting through golden beams. Shallow depth of field with anamorphic lens flare, 40% slow motion as the crema swirls on top. Quiet ambient room tone, the soft hiss of steam, ceramic clink. 35mm film grain, photorealistic.";

const STEPS = [
  { id: "type",     hint: "Type a short idea — even one sentence is enough.",                                                                      target: "textarea" },
  { id: "image",    hint: "Drop in reference photos — face, outfit, scene. Add more than one if your story has multiple characters.",              target: "image" },
  { id: "expand",   hint: "Button now reads “with 2 images” — tap it. Claude picks up every photo and writes the prompt around them.",             target: "expand" },
  { id: "expanded", hint: "Your prompt is now production-ready. You can edit before generating.",                                                  target: "textarea" },
  { id: "generate", hint: "Tap Generate. We'll process the video in the background.",                                                              target: "generate" },
  { id: "done",     hint: "That's it — you're ready to make videos.",                                                                              target: null },
];

// Slowed down again 2026-05-13 round 2 — Arman still felt it was too
// fast to follow. Real-typing speed on the short idea, comfortable
// reading pace on the long expansion. Total demo ≈ 30-32 s.
const TYPE_SHORT = { chunk: 1, ms: 55 };
const TYPE_LONG  = { chunk: 3, ms: 30 };

export default function WalkthroughTour({ onClose }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [text, setText] = useState("");
  const [expandClicked, setExpandClicked] = useState(false);
  const [imageCount, setImageCount] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const typeTimerRef = useRef(null);
  const advanceTimerRef = useRef(null);
  const textareaRef = useRef(null);

  // Keep the textarea scrolled to the bottom as typing progresses so
  // the latest chars are always visible (matters during the long
  // "expanded" step which overflows the 150 px cap).
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [text]);

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;

  // ESC dismisses the tour at any time.
  useEffect(() => {
    const onEsc = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  // Each step transition plays a soft tick — only inside the walkthrough.
  // Global click sounds on /generate were pulled per Arman 2026-05-13
  // ("I only need sound in the demo tutorial").
  useEffect(() => {
    playClick();
  }, [stepIdx]);

  useEffect(() => {
    clearTimeout(typeTimerRef.current);
    clearTimeout(advanceTimerRef.current);

    const stepTimers = [];

    // Each step now starts with a SETTLE pause before the animation
    // kicks in, so the user sees "STEP X starting on this element" and
    // can orient before content moves.
    const SETTLE = 700;

    if (step.id === "type") {
      setText("");
      setExpandClicked(false);
      setImageCount(0);
      stepTimers.push(setTimeout(() => {
        typeChunked(SHORT_IDEA, 0, TYPE_SHORT, () => {
          if (autoplay) advanceTimerRef.current = setTimeout(() => setStepIdx(1), 1800);
        });
      }, SETTLE));
    } else if (step.id === "image") {
      setText(SHORT_IDEA);
      setExpandClicked(false);
      setImageCount(0);
      stepTimers.push(setTimeout(() => setImageCount(1), SETTLE + 600));
      stepTimers.push(setTimeout(() => setImageCount(2), SETTLE + 2200));
      if (autoplay) stepTimers.push(setTimeout(() => setStepIdx(2), SETTLE + 4800));
    } else if (step.id === "expand") {
      setText(SHORT_IDEA);
      setImageCount(2);
      setExpandClicked(false);
      if (autoplay) {
        stepTimers.push(setTimeout(() => {
          // Tactile feedback for the simulated Expand auto-click.
          playClick();
          setExpandClicked(true);
          stepTimers.push(setTimeout(() => setStepIdx(3), 700));
        }, SETTLE + 2200));
      }
    } else if (step.id === "expanded") {
      setText("");
      setImageCount(2);
      stepTimers.push(setTimeout(() => {
        typeChunked(EXPANDED, 0, TYPE_LONG, () => {
          if (autoplay) advanceTimerRef.current = setTimeout(() => setStepIdx(4), 2200);
        });
      }, SETTLE));
    } else if (step.id === "generate") {
      setText(EXPANDED);
      setImageCount(2);
      if (autoplay) stepTimers.push(setTimeout(() => setStepIdx(5), SETTLE + 2800));
    } else if (step.id === "done") {
      setText(EXPANDED);
      setImageCount(2);
    }

    return () => {
      clearTimeout(typeTimerRef.current);
      clearTimeout(advanceTimerRef.current);
      stepTimers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, autoplay]);

  function typeChunked(full, i, { chunk, ms }, done) {
    if (i >= full.length) { setText(full); done?.(); return; }
    const next = Math.min(full.length, i + chunk);
    setText(full.slice(0, next));
    typeTimerRef.current = setTimeout(() => typeChunked(full, next, { chunk, ms }, done), ms);
  }

  function next() { setAutoplay(false); setStepIdx((s) => Math.min(s + 1, STEPS.length - 1)); }
  function prev() { setAutoplay(false); setStepIdx((s) => Math.max(s - 1, 0)); }
  function restart() { setAutoplay(true); setStepIdx(0); }

  const wordCount = (text.match(/\S+/g) || []).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How to make your first video"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(0,0,0,0.78)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "24px 12px 24px",
        overflowY: "auto",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        style={{
          maxWidth: 720,
          width: "100%",
          position: "relative",
          margin: "16px 0",
        }}
      >
        {/* Prominent Skip button — top-right, always visible. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Skip the tour"
          style={{
            position: "absolute",
            top: -4,
            right: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            background: COLOR_PANEL,
            border: `1px solid ${COLOR_BORDER}`,
            color: COLOR_TEXT,
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 8,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "all 0.15s",
            zIndex: 5,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "rgba(239,68,68,0.5)";
            e.currentTarget.style.color = "#fca5a5";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = COLOR_BORDER;
            e.currentTarget.style.color = COLOR_TEXT;
          }}
        >
          ✕ Skip tour
        </button>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 18, padding: "0 80px" }}>
          <div style={{ fontSize: 11, color: COLOR_ACCENT, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" }}>
            ✨ Quick tour
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: "6px 0 4px", color: COLOR_TEXT }}>
            How to make your first video
          </h1>
          <p style={{ fontSize: 13, color: COLOR_MUTED, margin: 0 }}>
            ~13 seconds. Skip anytime.
          </p>
        </div>

        {/* Hint card — clear "STEP X OF 5" label so users know where
            they are in the flow. The final "done" step shows "✓ ALL SET"
            instead of a step number. Arman flagged 2026-05-13 that
            numbered steps make the tour easier to follow. */}
        <div
          key={stepIdx}
          style={{
            background: COLOR_PANEL,
            border: `1px solid ${COLOR_BORDER_HOVER}`,
            borderRadius: 12,
            padding: "14px 16px",
            marginBottom: 16,
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            animation: "wt-slideIn 0.35s ease",
          }}
        >
          <div style={{
            flexShrink: 0,
            width: 38, height: 38, borderRadius: 10,
            background: "rgba(200,241,53,0.10)",
            border: `1px solid ${COLOR_BORDER_HOVER}`,
            color: COLOR_ACCENT,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 800,
          }}>
            {isLast ? "✓" : stepIdx + 1}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11,
              color: COLOR_ACCENT,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontWeight: 800,
              marginBottom: 4,
            }}>
              {isLast
                ? "✓ All set"
                : `Step ${stepIdx + 1} of ${STEPS.length - 1}`}
            </div>
            <div style={{
              fontSize: 13.5,
              lineHeight: 1.45,
              color: COLOR_TEXT,
            }}>
              {step.hint}
            </div>
          </div>
        </div>

        {/* Mock control panel */}
        <div style={{
          background: COLOR_PANEL,
          border: `1px solid ${COLOR_BORDER}`,
          borderRadius: 12,
          padding: 18,
          display: "flex", flexDirection: "column", gap: 16,
        }}>
          {/* Prompt textarea */}
          <div style={{ position: "relative" }}>
            <div style={{ fontSize: 10, color: COLOR_MUTED, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>
              Prompt
            </div>
            <div
              className={step.target === "textarea" ? "wt-target" : ""}
              style={{
                background: COLOR_BG,
                border: `1px solid ${step.target === "textarea" ? COLOR_BORDER_HOVER : COLOR_BORDER}`,
                borderRadius: 10,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Cap textarea at 150 px tall + enable internal scroll so
                  the long expanded prompt doesn't grow the field past
                  the footer (word count + Expand button) and bleed
                  visually behind it. Arman flagged 2026-05-13. */}
              <textarea
                ref={textareaRef}
                readOnly
                value={text}
                placeholder="Describe your video…"
                rows={5}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: COLOR_TEXT,
                  fontFamily: "inherit",
                  fontSize: 14,
                  lineHeight: 1.55,
                  padding: "12px 14px",
                  resize: "none",
                  minHeight: 110,
                  maxHeight: 150,
                  overflowY: "auto",
                  display: "block",
                  boxSizing: "border-box",
                }}
              />
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px 10px",
                borderTop: `1px solid ${COLOR_BORDER}`,
                minHeight: 44,
              }}>
                <span style={{ fontSize: 11, color: COLOR_MUTED, fontVariantNumeric: "tabular-nums" }}>
                  {wordCount.toLocaleString()} words
                </span>
                {wordCount > 0 && (
                  <button
                    type="button"
                    onClick={() => { setExpandClicked(true); next(); }}
                    disabled={step.id === "done"}
                    className={step.target === "expand" ? "wt-target-pulse" : ""}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "7px 12px",
                      background: expandClicked ? "rgba(200,241,53,0.15)" : COLOR_ACCENT,
                      color: expandClicked ? COLOR_MUTED : "#0a0a0a",
                      border: "none",
                      borderRadius: 7,
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      letterSpacing: "0.02em",
                      transform: step.target === "expand" ? "scale(1.02)" : "scale(1)",
                      transition: "transform 0.2s, background 0.2s",
                    }}
                  >
                    {expandClicked
                      ? "✦ Expanding…"
                      : imageCount === 0
                        ? "✦ Expand my idea"
                        : imageCount === 1
                          ? "✦ Expand my idea (with image)"
                          : `✦ Expand my idea (with ${imageCount} images)`
                    }
                  </button>
                )}
              </div>
            </div>
            {/* Step badges are anchored to the actual element so the user
                sees "this glowing button = step 2" without a floating chip
                that crashes into other UI below. */}
            {step.target === "expand" && <StepBadge n={stepIdx + 1} total={STEPS.length - 1} />}
            {step.target === "textarea" && step.id === "type" && <StepBadge n={stepIdx + 1} total={STEPS.length - 1} />}
          </div>

          {/* Image upload section — matches the REAL /generate layout:
              IMAGES (N/9) label, full-width yellow "Upload image" button,
              then a 5-column grid below for uploaded thumbnails labelled
              @image1, @image2, … with delete buttons. Arman wanted the
              walkthrough to mirror the actual page so first-time users
              see the exact buttons they'll click. */}
          <div
            className={step.target === "image" ? "wt-target-pulse" : ""}
            style={{
              position: "relative",
              transform: step.target === "image" ? "scale(1.01)" : "scale(1)",
              transition: "transform 0.25s",
            }}
          >
            {/* Section label */}
            <div style={{
              fontSize: 10, color: COLOR_MUTED, letterSpacing: "0.12em",
              textTransform: "uppercase", fontWeight: 600, marginBottom: 6,
            }}>
              Images ({imageCount}/9)
            </div>

            {/* Upload button (yellow-tinted, full width — matches live UI) */}
            <button
              type="button"
              disabled
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "rgba(200,241,53,0.10)",
                border: `1px solid ${
                  step.target === "image" ? COLOR_BORDER_HOVER : "rgba(200,241,53,0.25)"
                }`,
                color: COLOR_ACCENT,
                fontSize: 12.5,
                fontWeight: 700,
                borderRadius: 7,
                cursor: "default",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transition: "all 0.2s",
              }}
            >
              🖼 Upload image
            </button>

            {/* Thumbnail grid (only renders after the first image lands) */}
            {imageCount > 0 && (
              <div style={{
                marginTop: 8,
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 8,
              }}>
                {Array.from({ length: imageCount }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      position: "relative",
                      aspectRatio: "1 / 1",
                      borderRadius: 8,
                      overflow: "hidden",
                      border: `1px solid ${COLOR_BORDER_HOVER}`,
                      background: "#000",
                      animation: "wt-pop 0.35s ease",
                    }}
                  >
                    <img
                      src={`https://picsum.photos/seed/wt-ref-${i + 1}/200/200`}
                      alt={`image ${i + 1}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    {/* Delete button in corner */}
                    <div style={{
                      position: "absolute", top: 4, right: 4,
                      width: 18, height: 18, borderRadius: "50%",
                      background: "rgba(0,0,0,0.75)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      color: "#fff",
                      fontSize: 9, lineHeight: 1,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>×</div>
                    {/* @imageN label */}
                    <div style={{
                      position: "absolute", bottom: 3, left: 3,
                      background: "rgba(0,0,0,0.7)",
                      padding: "1px 5px",
                      borderRadius: 3,
                      fontSize: 8.5,
                      fontWeight: 800,
                      color: "#fff",
                      letterSpacing: "0.02em",
                    }}>@image{i + 1}</div>
                  </div>
                ))}
              </div>
            )}

            {step.target === "image" && <StepBadge n={stepIdx + 1} total={STEPS.length - 1} />}
          </div>

          {/* Generate */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={next}
              disabled={step.id === "done"}
              className={step.target === "generate" ? "wt-target-pulse" : ""}
              style={{
                width: "100%",
                padding: "12px 18px",
                background: COLOR_ACCENT,
                color: "#0a0a0a",
                border: "none",
                borderRadius: 8,
                fontSize: 14, fontWeight: 800,
                cursor: "pointer", fontFamily: "inherit",
                letterSpacing: "0.02em",
                transform: step.target === "generate" ? "scale(1.02)" : "scale(1)",
                transition: "transform 0.2s",
              }}
            >▶ Generate (120 credits)</button>
            {step.target === "generate" && <StepBadge n={stepIdx + 1} total={STEPS.length - 1} />}
          </div>
        </div>

        {/* Dots + nav */}
        <div style={{
          marginTop: 18, display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 12, flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", gap: 6 }}>
            {STEPS.map((_, i) => (
              <span
                key={i}
                style={{
                  width: i === stepIdx ? 22 : 7, height: 7,
                  borderRadius: 999,
                  background: i <= stepIdx ? COLOR_ACCENT : COLOR_BORDER,
                  transition: "all 0.25s",
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={prev}
              disabled={stepIdx === 0}
              style={{
                padding: "8px 14px", background: "transparent",
                border: `1px solid ${COLOR_BORDER}`, color: COLOR_MUTED,
                fontSize: 12, fontWeight: 700, borderRadius: 7,
                cursor: stepIdx === 0 ? "not-allowed" : "pointer",
                fontFamily: "inherit", opacity: stepIdx === 0 ? 0.4 : 1,
              }}
            >← Back</button>
            {isLast ? (
              <>
                <button
                  type="button"
                  onClick={restart}
                  style={{
                    padding: "8px 14px", background: "transparent",
                    border: `1px solid ${COLOR_BORDER}`, color: COLOR_TEXT,
                    fontSize: 12, fontWeight: 700, borderRadius: 7,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >↻ Replay</button>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "8px 18px", background: COLOR_ACCENT, color: "#0a0a0a",
                    border: "none", fontSize: 12, fontWeight: 800, borderRadius: 7,
                    cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.02em",
                  }}
                >Got it →</button>
              </>
            ) : (
              <button
                type="button"
                onClick={next}
                style={{
                  padding: "8px 16px", background: COLOR_ACCENT, color: "#0a0a0a",
                  border: "none", fontSize: 12, fontWeight: 800, borderRadius: 7,
                  cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.02em",
                }}
              >Next →</button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes wt-slideIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        /* Pulse now keeps a 2 px accent ring around the target at ALL
           times, with the radial halo expanding outward on top. The
           fixed ring is what makes "which element is the focus" obvious
           even between halo cycles. */
        @keyframes wt-pulse {
          0%, 100% { box-shadow: 0 0 0 2px rgba(200,241,53,0.85), 0 0 0 4px rgba(200,241,53,0); }
          50%      { box-shadow: 0 0 0 2px rgba(200,241,53,0.85), 0 0 0 16px rgba(200,241,53,0); }
        }
        @keyframes wt-badgeBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes wt-pop     { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }
        .wt-target       { animation: wt-pulse 1.8s ease-out infinite; border-radius: 10px; }
        .wt-target-pulse { animation: wt-pulse 1.4s ease-out infinite; }
      `}</style>
    </div>
  );
}

// StepBadge — small "STEP X/5" capsule that anchors to the top-left
// corner of the currently-highlighted target. Negative offset so it
// bleeds slightly outside the element's bounds, drawing the eye to it.
// Gently bobs so it reads as "look here". The badge replaces the old
// floating pointer chip because that chip was overlapping adjacent
// buttons (the image-step chip crashed into the thumbnail grid below,
// the expand-step chip crashed into the image section, etc.).
function StepBadge({ n, total }) {
  return (
    <span
      style={{
        position: "absolute",
        top: -11,
        left: -11,
        zIndex: 6,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px 3px 6px",
        background: "#0a0a0a",
        color: COLOR_ACCENT,
        border: `2px solid ${COLOR_ACCENT}`,
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 800,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        boxShadow: "0 6px 18px -4px rgba(200,241,53,0.55)",
        animation: "wt-badgeBounce 1.3s ease-in-out infinite",
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      <span style={{
        display: "inline-flex",
        alignItems: "center", justifyContent: "center",
        width: 18, height: 18,
        background: COLOR_ACCENT,
        color: "#0a0a0a",
        borderRadius: "50%",
        fontSize: 11, fontWeight: 900,
      }}>
        {n}
      </span>
      Step {n}/{total}
    </span>
  );
}
