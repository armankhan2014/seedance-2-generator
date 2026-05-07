"use client";
import { useState } from "react";

export default function BackupNowButton() {
  const [state, setState] = useState("idle"); // idle | loading | success | error
  const [message, setMessage] = useState("");
  const [actionsUrl, setActionsUrl] = useState("");

  async function trigger() {
    if (state === "loading") return;
    setState("loading");
    setMessage("");
    setActionsUrl("");
    try {
      const res = await fetch("/api/admin/backup-now", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setState("success");
      setMessage("Backup started — runs in ~30 seconds.");
      setActionsUrl(data.actionsUrl || "");
      // Reset to idle after a few seconds so the button is usable again
      setTimeout(() => setState("idle"), 8000);
    } catch (err) {
      setState("error");
      setMessage(err.message || "Could not start backup.");
      setTimeout(() => setState("idle"), 6000);
    }
  }

  const colors = {
    idle:    { bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.5)", fg: "#4ade80" },
    loading: { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.15)", fg: "#94a3b8" },
    success: { bg: "rgba(34,197,94,0.25)", border: "rgba(34,197,94,0.6)", fg: "#86efac" },
    error:   { bg: "rgba(248,113,113,0.18)", border: "rgba(248,113,113,0.5)", fg: "#fca5a5" },
  }[state];

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <button
        type="button"
        onClick={trigger}
        disabled={state === "loading"}
        title="Trigger an immediate cloud backup of the database"
        style={{
          padding: "8px 14px",
          borderRadius: 8,
          border: `1px solid ${colors.border}`,
          background: colors.bg,
          color: colors.fg,
          fontSize: 13,
          fontWeight: 700,
          cursor: state === "loading" ? "wait" : "pointer",
          fontFamily: "inherit",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          transition: "all 0.15s",
        }}
      >
        {state === "loading" ? (
          <>
            <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            Starting backup…
          </>
        ) : state === "success" ? (
          <>✓ Backup started</>
        ) : state === "error" ? (
          <>✕ Backup failed</>
        ) : (
          <>☁️ Backup now</>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </button>
      {message && (
        <div style={{ fontSize: 11, color: colors.fg, maxWidth: 260, textAlign: "right", lineHeight: 1.4 }}>
          {message}
          {actionsUrl && (
            <>
              {" "}
              <a href={actionsUrl} target="_blank" rel="noopener noreferrer" style={{ color: colors.fg, textDecoration: "underline" }}>
                Watch run →
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
