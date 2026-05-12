"use client";
//
// SmartPrompt — the one-textarea-fits-all replacement for the old
// "describe your video" textarea + the separate PromptBuilder modal.
//
// Behaviour (per the brief on 2026-05-12):
//   1. User types a SHORT idea.
//   2. When the textarea has between 1 and 29 words, a "✦ Expand my
//      idea" button appears in the textarea footer.
//   3. Tap → spinner inside the button → POST /api/prompt/expand →
//      response replaces the textarea content with a 3–6 sentence
//      cinematic prompt.
//   4. User can edit it further or hit Generate.
//
// The button hides at 0 words (nothing to expand) and at 30+ words
// (user knows what they're doing — don't bother them).
//
// Duration awareness: reads the parent's currently-selected duration
// (5 / 10 / 15) and sends it to the API so the expansion is the
// right length for the clip.
//
// Designed to be a drop-in for the existing textarea in
// GenerateClient.jsx — props match the existing prompt/setPrompt
// state so swap-in is a one-line change.

import { useMemo, useState } from "react";

const COLOR_BG = "#141414";
const COLOR_BG_DEEP = "#111";
const COLOR_BORDER = "#2a2a2a";
const COLOR_TEXT = "#e0e0e0";
const COLOR_MUTED = "#888";
const COLOR_ACCENT = "#c8f135";
const COLOR_DANGER = "#ef4444";

const WORD_RE = /\S+/g;

/**
 * Smart textarea with an inline AI-expand affordance.
 *
 * @param {string}   value          — controlled value (the prompt text)
 * @param {function} onChange       — called with the new value on edit / expand
 * @param {number}   duration       — 5 | 10 | 15 (currently selected video length)
 * @param {string[]} images         — optional array of uploaded image URLs (R2).
 *                                    When present, Claude sees the photos and
 *                                    references real details (clothing, faces,
 *                                    environment) using 【@image1】 / 【@image2】
 *                                    notation instead of inventing placeholders.
 * @param {string}   placeholder    — textarea placeholder
 * @param {number}   maxWords       — soft cap; we display the count, never block typing
 * @param {boolean}  disabled       — disables the textarea + button (e.g. while generating)
 * @param {function} onUpgrade      — called when the API returns upgradeRequired: true
 *                                    (lets the parent open the credits / sign-in modal)
 */
export default function SmartPrompt({
  value = "",
  onChange,
  duration = 5,
  images = [],
  placeholder = "Describe your video…",
  maxWords = 20000,
  disabled = false,
  onUpgrade,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Track the SHORT idea the user expanded from so they can
  // re-expand later — typically after uploading an image AFTER the
  // first expansion. Without this, the original short idea would be
  // lost the moment expansion replaced the textarea, and the user
  // would have to re-type it from memory to get an image-aware
  // version. Arman flagged this on 2026-05-12.
  const [lastIdea, setLastIdea] = useState(null);
  // Snapshot of images at the time of the last expansion. If the
  // user uploads / removes images since then, we surface a
  // "Re-expand with new image(s)" affordance so the prompt can
  // pick up the new context.
  const [lastImagesKey, setLastImagesKey] = useState(null);

  const wordCount = useMemo(() => {
    if (!value) return 0;
    const m = value.match(WORD_RE);
    return m ? m.length : 0;
  }, [value]);

  // Stable key for the current image set — used to detect when
  // images have changed since the last expand.
  const imagesKey = useMemo(() => (images || []).join("|"), [images]);

  // Button visibility rules (updated 2026-05-12 — Arman flagged the
  // button vanishing at ~93 words, which used to be the "user knows what
  // they want" cutoff):
  //   • 0 words → hide (nothing to expand)
  //   • Any non-empty input → show ✦ Expand. No upper word cap.
  // The Re-expand label still activates whenever the user has expanded
  // once AND added/removed images since — uses the stored original idea
  // so they don't have to re-type after uploading a reference. Both
  // conditions can now be true simultaneously (re-expand wins the label).
  const showExpand = wordCount >= 1;
  const showReExpand =
    wordCount > 0 &&
    lastIdea &&
    lastImagesKey !== null &&
    imagesKey !== lastImagesKey &&
    (images?.length || 0) > 0;
  const showFirstExpand = showExpand && !showReExpand;

  // Label adapts so the user knows what Claude will see BEFORE
  // they tap. Matches the parent's mode awareness.
  const imageCount = images?.length || 0;
  let buttonLabel;
  if (busy) {
    buttonLabel = "Expanding…";
  } else if (showReExpand) {
    buttonLabel = `✦ Re-expand with ${imageCount === 1 ? "image" : `${imageCount} images`}`;
  } else if (imageCount > 0) {
    buttonLabel = `✦ Expand my idea (with ${imageCount === 1 ? "image" : `${imageCount} images`})`;
  } else {
    buttonLabel = "✦ Expand my idea";
  }

  async function handleExpand() {
    if (busy || !showExpand) return;
    // For re-expand, send the stored short idea instead of the
    // current expanded text. First expand sends value verbatim.
    const sourceIdea = showReExpand ? lastIdea : value.trim();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/prompt/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: sourceIdea,
          duration,
          // Forward any uploaded image URLs so the server can fetch
          // them and pass them to Claude vision. Parent typically
          // sets this to imagesList from /generate when the user
          // is in Image-to-Video or Reference-to-Video mode.
          images: Array.isArray(images) ? images : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.upgradeRequired && onUpgrade) onUpgrade(data);
        // Plain-English errors per the brief's "User experience" rules.
        throw new Error(data.error || "Couldn't expand — try again.");
      }
      if (data.prompt) {
        onChange?.(data.prompt);
        // Remember what we expanded from + which images were in play.
        // Powers the Re-expand button when the user adds/removes
        // images after the first expansion.
        setLastIdea(sourceIdea);
        setLastImagesKey(imagesKey);
      }
    } catch (err) {
      setError(err.message || "Couldn't expand — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "relative",
        background: COLOR_BG,
        border: `1px solid ${COLOR_BORDER}`,
        borderRadius: 12,
        transition: "border-color 0.15s",
      }}
    >
      <textarea
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled || busy}
        rows={8}
        spellCheck={true}
        style={{
          display: "block",
          width: "100%",
          background: "transparent",
          border: "none",
          outline: "none",
          color: COLOR_TEXT,
          fontFamily: "inherit",
          fontSize: 15,
          lineHeight: 1.55,
          padding: "16px 18px",
          resize: "vertical",
          minHeight: 160,
          // Make room for the footer bar visually so the user doesn't
          // accidentally hide their text behind the action row.
          paddingBottom: 12,
        }}
      />

      {/* Footer bar — sits flush with the textarea. Holds the word
          counter on the left and the Expand button on the right.
          Always rendered so layout doesn't jump when the button
          appears / disappears. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "8px 12px 10px",
          borderTop: `1px solid ${COLOR_BORDER}`,
          minHeight: 44,
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: COLOR_MUTED,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {wordCount.toLocaleString()} / {maxWords.toLocaleString()} words
        </span>

        {/* Right side: error message (when present) OR Expand button
            (when 1–29 words) OR nothing. */}
        {error ? (
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              background: "transparent",
              border: "none",
              color: COLOR_DANGER,
              fontSize: 12,
              cursor: "pointer",
              padding: "6px 10px",
              fontFamily: "inherit",
            }}
            aria-label="Dismiss error"
          >
            {error}  ✕
          </button>
        ) : showExpand ? (
          <button
            type="button"
            onClick={handleExpand}
            disabled={busy || disabled}
            title={
              showReExpand
                ? `Re-expand using your original idea: "${lastIdea}" plus the ${imageCount} image${imageCount === 1 ? "" : "s"} now uploaded.`
                : imageCount > 0
                  ? `Expand using your idea plus the ${imageCount} image${imageCount === 1 ? "" : "s"} you uploaded.`
                  : "Expand your short idea into a full cinematic prompt."
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              background: busy ? "rgba(200,241,53,0.10)" : COLOR_ACCENT,
              color: busy ? COLOR_MUTED : "#0a0a0a",
              border: `1px solid ${
                busy ? "rgba(200,241,53,0.30)" : COLOR_ACCENT
              }`,
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: "0.02em",
              cursor: busy ? "default" : "pointer",
              fontFamily: "inherit",
              transition: "background 0.15s, border-color 0.15s",
            }}
          >
            {busy ? (
              <>
                <Spinner />
                <span>{buttonLabel}</span>
              </>
            ) : (
              <span>{buttonLabel}</span>
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        border: `2px solid currentColor`,
        borderTopColor: "transparent",
        display: "inline-block",
        animation: "smartprompt-spin 0.7s linear infinite",
      }}
    >
      <style>{`@keyframes smartprompt-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}
