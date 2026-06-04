"use client";

/**
 * /demo/reference-guide-modal
 *
 * Preview of the pre-upload reference-photo popup. Shows the exact
 * wiring Arman will port into /generate after approval:
 *
 *   1. A mock "Upload Image" primary button.
 *   2. A small "ℹ Reference Tips" secondary button right next to it.
 *   3. Click Upload Image → if this is the first time this session
 *      AND the user hasn't ticked "don't show again", the modal
 *      auto-opens. After dismiss it doesn't re-open this session.
 *   4. Click ℹ Reference Tips → modal opens regardless (manual).
 *   5. Modal "Got it" closes + simulates triggering the file picker.
 *
 * Plus two reset buttons so we can re-test the first-time path
 * without having to clear browser storage manually.
 */

import { useState, useRef, useEffect } from "react";
import ReferenceImageGuideModal, {
  shouldAutoShowReferenceGuide,
  clearReferenceGuideSessionFlag,
  clearReferenceGuideDontShow,
} from "@/components/saas/ReferenceImageGuideModal";

// Light palette — matches the demo wrapper from /demo/reference-guide
// so the two demos feel like the same family.
const INK = "#1f2937";
const SUB = "#374151";
const MUTED = "#6b7280";
const GREEN = "#16a34a";
const HAIR = "rgba(0,0,0,0.10)";
const CARD = "#ffffff";

export default function ReferenceGuideModalDemoPage() {
  const [open, setOpen] = useState(false);
  const [lastFile, setLastFile] = useState(null);
  const [flagsState, setFlagsState] = useState({ session: false, dontShow: false });
  const fileInputRef = useRef(null);

  // Read storage flags on mount so the diagnostic strip can show
  // the current state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => {
      try {
        setFlagsState({
          session:  window.sessionStorage.getItem("ve_ref_guide_shown_session") === "1",
          dontShow: window.localStorage.getItem("ve_ref_guide_dont_show") === "1",
        });
      } catch { /* ignore */ }
    };
    refresh();
    // Refresh when the modal closes — flags may have changed.
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [open]);

  // === Upload click handler — the EXACT pattern to port into /generate ===
  // 1) Check shouldAutoShowReferenceGuide(). If true, open the modal
  //    and DON'T open the file picker yet — the modal's "Got it" CTA
  //    will trigger it after the user has seen the guidance.
  // 2) If false, go straight to the file picker.
  const handleUploadClick = () => {
    if (shouldAutoShowReferenceGuide()) {
      setOpen(true);
    } else {
      openFilePicker();
    }
  };

  // Manual "ℹ Reference Tips" — always opens, regardless of session.
  const handleTipsClick = () => setOpen(true);

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setLastFile({
      name: f.name,
      size: f.size,
      type: f.type,
    });
  };

  // Reset helpers so Arman can re-test the first-time path.
  const resetSession = () => {
    clearReferenceGuideSessionFlag();
    setFlagsState((s) => ({ ...s, session: false }));
  };
  const resetDontShow = () => {
    clearReferenceGuideDontShow();
    setFlagsState((s) => ({ ...s, dontShow: false }));
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#e5e1d8",
        color: INK,
        padding: "40px 24px 80px",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: MUTED,
          marginBottom: 8,
        }}>
          /demo/reference-guide-modal · staging preview
        </div>
        <h1 style={{
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: "-0.01em",
          margin: "0 0 22px",
          color: INK,
        }}>
          Pre-upload reference popup preview
        </h1>

        {/* ── MOCK UPLOAD AREA ────────────────────────────────────── */}
        <section style={{
          background: CARD,
          border: `1px solid ${HAIR}`,
          borderRadius: 12,
          padding: "22px 18px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 4 }}>
            Reference image (mock)
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>
            This is what users see in <code style={codePill}>/generate</code>.
            Click <strong>Upload Image</strong> to see the auto-popup behaviour.
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              onClick={handleUploadClick}
              style={{
                flex: "1 1 220px",
                background: GREEN,
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "12px 18px",
                fontSize: 14,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: "0 4px 12px rgba(22,163,74,0.25)",
              }}
            >
              📤 Upload Image
            </button>
            <button
              type="button"
              onClick={handleTipsClick}
              style={{
                background: "transparent",
                color: GREEN,
                border: `1.5px solid ${GREEN}`,
                borderRadius: 10,
                padding: "11px 14px",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}
            >
              ℹ Reference Tips
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onFile}
            style={{ display: "none" }}
          />

          {lastFile && (
            <div style={{
              marginTop: 16,
              padding: "10px 12px",
              borderRadius: 8,
              background: `${GREEN}14`,
              border: `1px solid ${GREEN}44`,
              fontSize: 12.5,
              color: SUB,
            }}>
              <strong style={{ color: GREEN }}>File picker fired:</strong>{" "}
              <code style={codePill}>{lastFile.name}</code>{" "}
              <span style={{ color: MUTED }}>
                ({(lastFile.size / 1024).toFixed(0)} KB · {lastFile.type})
              </span>
            </div>
          )}
        </section>

        {/* ── DIAGNOSTIC STRIP ────────────────────────────────────── */}
        <section style={{
          marginTop: 22,
          background: CARD,
          border: `1px solid ${HAIR}`,
          borderRadius: 12,
          padding: "16px 18px",
          fontSize: 12.5,
          color: SUB,
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: INK, marginBottom: 10 }}>
            Storage flags
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
            <FlagPill label="sessionStorage · shown this session" set={flagsState.session} />
            <FlagPill label="localStorage · don't show again"      set={flagsState.dontShow} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            <button type="button" onClick={resetSession} style={resetBtn}>
              Reset session flag
            </button>
            <button type="button" onClick={resetDontShow} style={resetBtn}>
              Reset &ldquo;don&rsquo;t show&rdquo; flag
            </button>
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
            Both flags reset → click <strong>Upload Image</strong> → modal auto-opens.
            Dismiss it → click <strong>Upload Image</strong> again → modal skipped, file picker
            fires directly. Tick &ldquo;Don&rsquo;t show this every session&rdquo; + Got it →
            modal stays skipped even after closing the tab + returning.
            <strong> ℹ Reference Tips</strong> always re-opens it regardless.
          </p>
        </section>

        {/* ── PORT NOTES ──────────────────────────────────────────── */}
        <section style={{
          marginTop: 22,
          background: CARD,
          border: `1px solid ${HAIR}`,
          borderRadius: 12,
          padding: "16px 18px",
          fontSize: 12.5,
          color: SUB,
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: GREEN, marginBottom: 6 }}>
            How to port into /generate
          </div>
          <ol style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.55 }}>
            <li>
              Import <code style={codePill}>ReferenceImageGuideModal</code> +{" "}
              <code style={codePill}>shouldAutoShowReferenceGuide</code>.
            </li>
            <li>
              Replace the existing <code style={codePill}>onClick</code> on the
              upload button with the <code style={codePill}>handleUploadClick</code>{" "}
              pattern: check the gate, open the modal if true, else go straight to
              the file picker.
            </li>
            <li>
              Wire the modal&rsquo;s <code style={codePill}>onGotIt</code> to{" "}
              <code style={codePill}>fileInputRef.current?.click()</code> so the
              picker opens after the user has seen the guidance.
            </li>
            <li>
              Add the small <code style={codePill}>ℹ Reference Tips</code> button
              next to the upload button. Its onClick just opens the modal
              unconditionally.
            </li>
            <li>
              Delete <code style={codePill}>/demo/reference-guide-modal</code>{" "}
              once everything is wired live.
            </li>
          </ol>
        </section>
      </div>

      <ReferenceImageGuideModal
        open={open}
        onClose={() => setOpen(false)}
        onGotIt={() => {
          setOpen(false);
          // Defer slightly so the modal close animation feels natural
          // before the OS file picker takes over.
          setTimeout(openFilePicker, 120);
        }}
      />
    </main>
  );
}

function FlagPill({ label, set }) {
  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "5px 10px",
      borderRadius: 999,
      background: set ? "rgba(22,163,74,0.10)" : "rgba(0,0,0,0.04)",
      border: `1px solid ${set ? "rgba(22,163,74,0.35)" : "rgba(0,0,0,0.10)"}`,
      color: set ? "#15803d" : "#6b7280",
      fontSize: 11.5,
      fontWeight: 700,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: 999,
        background: set ? "#16a34a" : "#9ca3af",
      }} />
      {label} · <strong>{set ? "SET" : "unset"}</strong>
    </div>
  );
}

const codePill = {
  background: "#f3f4f6",
  color: "#111827",
  padding: "1px 6px",
  borderRadius: 4,
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
  fontSize: "0.92em",
};

const resetBtn = {
  background: "#fff",
  color: "#374151",
  border: "1px solid rgba(0,0,0,0.16)",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};
