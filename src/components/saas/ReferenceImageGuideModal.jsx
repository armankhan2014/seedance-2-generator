"use client";

/**
 * ReferenceImageGuideModal
 *
 * Pre-upload popup that teaches users what makes a good face
 * reference photo BEFORE they pick a file. Reuses the existing
 * SEEDANCE REF poster from /public/reference-guide/seedance-ref.png
 * as the visual teaching surface; wraps it in a modal/bottom-sheet
 * shell with auto-show + dismiss persistence + a clear "Got it"
 * CTA that returns control to the caller so the upload flow can
 * resume (open the file picker, etc).
 *
 * Persistence (per Arman's spec):
 *   • Session storage flag ("shown this session") — set on first
 *     auto-show so the modal doesn't re-fire on every upload click
 *     in the same tab.
 *   • Local storage flag ("don't show this again") — set when the
 *     user ticks the checkbox + clicks Got it. Survives across
 *     sessions; the only way to get the modal back is the explicit
 *     "ℹ Reference Tips" button.
 *
 * Responsive:
 *   • Desktop / large viewport → centred modal, max-width 720px.
 *   • Mobile / under 700px → slides up from the bottom as a sheet,
 *     full width, rounded top corners only.
 *
 * Accessibility:
 *   • Escape closes the modal (focuses the previously-focused
 *     element).
 *   • Backdrop click closes.
 *   • Focus trapped to within the dialog while open.
 *   • aria-modal, role="dialog", aria-labelledby on the title.
 */

import { useEffect, useId, useRef, useState } from "react";

const POSTER_SRC = "/reference-guide/seedance-ref.png";

// Storage keys — kept here so the trigger helpers can read/write them
// without re-importing the modal component.
export const REF_GUIDE_SESSION_KEY = "ve_ref_guide_shown_session";
export const REF_GUIDE_DONT_SHOW_KEY = "ve_ref_guide_dont_show";

// Light palette used inside the dialog (matches the cream component).
const CREAM_BG = "#f5f1ea";
const CREAM_CARD = "#ffffff";
const INK = "#1f2937";
const SUB = "#374151";
const MUTED = "#6b7280";
const GREEN = "#16a34a";

/**
 * Helper: should we auto-open the modal right now for this user?
 * Returns true when:
 *   • The user hasn't ticked "don't show again" (localStorage), AND
 *   • The modal hasn't already been shown this session
 *     (sessionStorage).
 *
 * Always safe to call on the server — returns false when window
 * isn't available.
 */
export function shouldAutoShowReferenceGuide() {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(REF_GUIDE_DONT_SHOW_KEY) === "1") return false;
    if (window.sessionStorage.getItem(REF_GUIDE_SESSION_KEY) === "1") return false;
  } catch {
    return true; // storage blocked → default to showing
  }
  return true;
}

/** Helper: explicitly clear the "shown this session" flag so the
 *  modal can fire again on the next upload click. Used by the
 *  /demo/reference-guide-modal reset button. */
export function clearReferenceGuideSessionFlag() {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(REF_GUIDE_SESSION_KEY); } catch { /* ignore */ }
}

/** Helper: clear "don't show again" persistence too. */
export function clearReferenceGuideDontShow() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(REF_GUIDE_DONT_SHOW_KEY); } catch { /* ignore */ }
}

export default function ReferenceImageGuideModal({
  open,
  onClose,
  onGotIt,
  // When true (default), mark sessionStorage on every open so the
  // calling code's `shouldAutoShowReferenceGuide()` returns false
  // for the rest of the tab's lifetime.
  recordSessionShown = true,
}) {
  const [dontShow, setDontShow] = useState(false);
  const dialogRef = useRef(null);
  const prevFocusRef = useRef(null);
  const titleId = useId();

  // Lock body scroll + remember the focused element so we can return
  // focus when the dialog closes.
  //
  // iOS Safari quirk: `overflow: hidden` on body doesn't actually
  // stop scrolling in Safari for iOS — the only reliable trick is
  // `position: fixed; top: -<scrollY>` and then restoring the
  // scroll position on close. Without this, when the user
  // dismisses the bottom sheet, the page underneath has jumped to
  // the top.
  useEffect(() => {
    if (!open) return;
    prevFocusRef.current = typeof document !== "undefined" ? document.activeElement : null;
    if (typeof document === "undefined") return;
    const scrollY = window.scrollY;
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const prevWidth = document.body.style.width;
    const prevOverflow = document.body.style.overflow;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    // Mark session-shown immediately so a second .open() in the same
    // tab doesn't auto-fire (the caller's gate already used this).
    if (recordSessionShown) {
      try { window.sessionStorage.setItem(REF_GUIDE_SESSION_KEY, "1"); } catch { /* ignore */ }
    }
    return () => {
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      document.body.style.width = prevWidth;
      document.body.style.overflow = prevOverflow;
      // Restore the scroll position the user was at before the modal
      // opened. `instant` (not smooth) so it's invisible.
      window.scrollTo({ top: scrollY, left: 0, behavior: "instant" });
    };
  }, [open, recordSessionShown]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Return focus to the previously-focused element after close.
  useEffect(() => {
    if (open) return;
    const el = prevFocusRef.current;
    if (el && typeof el.focus === "function") {
      try { el.focus(); } catch { /* ignore */ }
    }
  }, [open]);

  if (!open) return null;

  const persistAndClose = () => {
    if (dontShow) {
      try { window.localStorage.setItem(REF_GUIDE_DONT_SHOW_KEY, "1"); } catch { /* ignore */ }
    }
  };

  const handleGotIt = () => {
    persistAndClose();
    onGotIt?.();
  };
  const handleDismiss = () => {
    persistAndClose();
    onClose?.();
  };

  return (
    <div
      // Backdrop
      onClick={handleDismiss}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 80,
        // 250 ms fade-in
        animation: "ref-modal-fade 220ms ease-out",
      }}
    >
      <style>{`
        @keyframes ref-modal-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes ref-modal-rise {
          from { transform: translateY(24px); opacity: 0.6; }
          to   { transform: translateY(0); opacity: 1; }
        }
        @media (min-width: 700px) {
          .ref-modal-shell {
            align-self: center !important;
            border-radius: 16px !important;
            max-width: 720px !important;
            margin: 24px !important;
          }
        }
      `}</style>

      <div
        ref={dialogRef}
        className="ref-modal-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxHeight: "94vh",
          overflowY: "auto",
          // iOS Safari: keep momentum scrolling inside the sheet
          // smooth, and stop overscroll from reaching the locked
          // body underneath.
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          background: CREAM_BG,
          color: INK,
          // Mobile bottom-sheet: rounded top corners only. Desktop
          // overrides via @media above.
          borderRadius: "20px 20px 0 0",
          // Bottom padding respects the iPhone home-indicator safe
          // area so the Got it CTA never sits under the gesture bar.
          padding: "20px 18px max(20px, env(safe-area-inset-bottom, 20px))",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          boxShadow: "0 -8px 32px rgba(0,0,0,0.4)",
          animation: "ref-modal-rise 280ms cubic-bezier(0.2, 0.9, 0.2, 1)",
        }}
      >
        {/* Mobile drag handle — visual cue this is a bottom sheet. */}
        <div style={{
          width: 44, height: 4, borderRadius: 999,
          background: "rgba(0,0,0,0.18)",
          margin: "0 auto 14px",
          display: "block",
        }} />

        {/* Header row — title + close X */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <h2
              id={titleId}
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: "-0.005em",
                color: INK,
              }}
            >
              📸 How to get the best results
            </h2>
            <p style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: MUTED,
              lineHeight: 1.4,
            }}>
              Use these tips so the AI matches your face accurately.
              Sunglasses, hats, and beards are fine — what matters is
              that you&rsquo;re close, clear, and looking at the camera.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Close"
            style={{
              flexShrink: 0,
              width: 32, height: 32, borderRadius: 999,
              background: "rgba(0,0,0,0.06)",
              color: SUB,
              border: "none",
              fontSize: 18, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ×
          </button>
        </div>

        {/* The poster — Arman's approved SEEDANCE REF artwork. */}
        <div style={{
          width: "100%",
          aspectRatio: "1536 / 1024",
          borderRadius: 12,
          overflow: "hidden",
          background: CREAM_CARD,
          border: "1px solid rgba(0,0,0,0.06)",
          marginTop: 12,
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={POSTER_SRC}
            alt="Seedance face reference guide — Good vs Bad examples"
            width={1400}
            height={933}
            loading="lazy"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: "block",
            }}
          />
        </div>

        {/* Don't-show-again checkbox */}
        <label style={{
          marginTop: 16,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12.5,
          color: SUB,
          cursor: "pointer",
          userSelect: "none",
        }}>
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            style={{ accentColor: GREEN, width: 16, height: 16 }}
          />
          Don&rsquo;t show this every session
        </label>

        {/* Got it CTA. The old "Show full guide ↗" secondary link
            sent users to /demo/reference-guide which contained dev-
            facing test notes and confused a real user (2026-06-05).
            Link removed; the staging route /demo/reference-guide
            was deleted in the same commit. */}
        <div style={{
          marginTop: 14,
          display: "flex",
          justifyContent: "flex-end",
        }}>
          <button
            type="button"
            onClick={handleGotIt}
            style={{
              flex: "1 1 240px",
              maxWidth: 360,
              background: GREEN,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "12px 18px",
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: "0.01em",
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: "0 4px 12px rgba(22,163,74,0.30)",
            }}
          >
            Got it — Let me upload my photo
          </button>
        </div>
      </div>
    </div>
  );
}
