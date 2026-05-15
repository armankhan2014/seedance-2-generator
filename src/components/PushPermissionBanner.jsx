"use client";
import { useEffect, useState } from "react";
import {
  pushSupported,
  pushPermission,
  getActiveSubscription,
  enableStudioPush,
} from "@/lib/clientPush";

// Slide-in banner that asks for push permission AT THE MOMENT the
// user starts their first generation — never on page load.
//
// Show rules (computed every render):
//   • Browser supports push
//   • OS permission is "default" (not yet granted/denied)
//   • No active subscription
//   • Page mounted with `triggerKey` that changes (the parent passes
//     a new key every time the user kicks off a generation)
//   • User hasn't dismissed in the last 14 days (localStorage)
//
// Parent contract:
//   <PushPermissionBanner triggerKey={generationStartedAt} />
// Each time `triggerKey` changes (a fresh generation kick-off), the
// banner re-evaluates whether to show.

const DISMISS_KEY = "seedance.pushBannerDismissedAt";
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export default function PushPermissionBanner({ triggerKey }) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState("ask"); // ask | success | denied | error
  const [busy, setBusy] = useState(false);

  // Re-evaluate visibility on each triggerKey bump.
  useEffect(() => {
    if (!triggerKey) return;
    let alive = true;
    (async () => {
      if (!pushSupported()) return;
      if (pushPermission() !== "default") return;
      try {
        if (await getActiveSubscription()) return;
      } catch {
        /* fall through — still show banner */
      }
      // Honor the 14-day dismiss.
      const dismissed = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
      if (Number.isFinite(dismissed) && Date.now() - dismissed < DISMISS_TTL_MS) return;
      if (alive) {
        setStage("ask");
        setOpen(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [triggerKey]);

  async function onEnable() {
    if (busy) return;
    setBusy(true);
    const result = await enableStudioPush();
    setBusy(false);
    if (result.ok) {
      setStage("success");
      // Auto-dismiss the success toast after a beat.
      setTimeout(() => setOpen(false), 2400);
    } else if (result.reason === "denied") {
      setStage("denied");
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch {}
    } else if (result.reason === "unsupported" || result.reason === "no_vapid") {
      setOpen(false);
    } else {
      setStage("error");
    }
  }

  function onDecline() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Enable notifications"
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        maxWidth: 360,
        background: "#141414",
        border: "1px solid rgba(166,204,0,0.40)",
        borderRadius: 14,
        boxShadow: "0 22px 60px -20px rgba(0,0,0,0.7)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        zIndex: 1200,
        animation: "spushBanner 0.32s ease-out",
        color: "#f1f5f9",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "rgba(166,204,0,0.10)",
            border: "1px solid rgba(166,204,0,0.40)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          {stage === "success" ? "✓" : stage === "denied" ? "🔕" : stage === "error" ? "⚠️" : "🔔"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.35 }}>
            {stage === "ask" && "Don’t sit and wait for your video"}
            {stage === "success" && "Notifications enabled"}
            {stage === "denied" && "Notifications blocked"}
            {stage === "error" && "Couldn’t enable just now"}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, lineHeight: 1.55 }}>
            {stage === "ask" &&
              "We’ll ping you the second it’s ready — usually 60–120 seconds. Alt-tab freely."}
            {stage === "success" && "You’ll get a push the moment your render finishes."}
            {stage === "denied" &&
              "You can re-enable from your browser’s site settings. We’ll show in-app updates in the meantime."}
            {stage === "error" && "Network blip. Try again — your generation is still running."}
          </div>
        </div>
      </div>
      {stage === "ask" && (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onDecline}
            disabled={busy}
            style={btn("ghost")}
          >
            Not now
          </button>
          <button
            type="button"
            onClick={onEnable}
            disabled={busy}
            style={btn("primary", busy)}
          >
            {busy ? "…" : "Enable"}
          </button>
        </div>
      )}
      {(stage === "denied" || stage === "error") && (
        <button type="button" onClick={() => setOpen(false)} style={btn("ghost")}>
          Got it
        </button>
      )}
      <style>{`
        @keyframes spushBanner {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

function btn(kind, busy = false) {
  const primary = kind === "primary";
  return {
    flex: primary ? 1.4 : 1,
    background: primary ? "#A6CC00" : "transparent",
    border: `1px solid ${primary ? "#A6CC00" : "#2a2a2a"}`,
    color: primary ? "#0a0a0a" : "#cbd5e1",
    fontSize: 12.5,
    fontWeight: primary ? 800 : 600,
    padding: "8px 0",
    borderRadius: 8,
    cursor: busy ? "default" : "pointer",
    fontFamily: "inherit",
    opacity: busy ? 0.7 : 1,
  };
}
