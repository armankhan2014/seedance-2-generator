"use client";
// src/components/saas/ToastContainer.jsx
import { useState, useEffect, useCallback } from "react";
import { toastEmitter } from "@/lib/toast";

const ICONS = {
  success: "✓",
  error:   "✕",
  warning: "⚠",
  info:    "ℹ",
};

const COLORS = {
  success: { bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.35)", icon: "#10b981", bar: "#10b981" },
  error:   { bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.35)",  icon: "#ef4444", bar: "#ef4444" },
  warning: { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)", icon: "#f59e0b", bar: "#f59e0b" },
  info:    { bg: "rgba(217, 255, 0,0.12)", border: "rgba(217, 255, 0,0.35)", icon: "#D9FF00", bar: "#D9FF00" },
};

function Toast({ id, message, type, duration, onDismiss }) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const c = COLORS[type] ?? COLORS.info;

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(id), 280);
  }, [id, onDismiss]);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setVisible(true));
    const t = setTimeout(dismiss, duration);
    return () => clearTimeout(t);
  }, [dismiss, duration]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        padding: "12px 14px",
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: "12px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        backdropFilter: "blur(12px)",
        minWidth: "260px",
        maxWidth: "360px",
        position: "relative",
        overflow: "hidden",
        fontFamily: "Inter, sans-serif",
        // Slide-in / slide-out
        transform: exiting ? "translateX(110%)" : visible ? "translateX(0)" : "translateX(110%)",
        opacity: exiting ? 0 : visible ? 1 : 0,
        transition: "transform 0.28s cubic-bezier(0.34,1.56,0.64,1), opacity 0.28s ease",
      }}
    >
      {/* Icon */}
      <div style={{
        width: 22, height: 22, borderRadius: "50%",
        background: `${c.icon}22`,
        border: `1px solid ${c.icon}55`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: c.icon, fontSize: "0.7rem", fontWeight: 900, flexShrink: 0, marginTop: 1,
      }}>
        {ICONS[type]}
      </div>

      {/* Message */}
      <p style={{ margin: 0, fontSize: "0.82rem", color: "#FFFFFF", lineHeight: 1.5, flex: 1, paddingRight: 4 }}>
        {message}
      </p>

      {/* Close button */}
      <button
        onClick={dismiss}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "#64748b", fontSize: "1rem", lineHeight: 1,
          padding: 0, flexShrink: 0, marginTop: 1,
        }}
      >
        ×
      </button>

      {/* Auto-dismiss progress bar */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, height: "2px",
        background: c.bar, borderRadius: "0 0 12px 12px",
        animation: `toast-shrink ${duration}ms linear forwards`,
      }} />
    </div>
  );
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const unsub = toastEmitter.subscribe((t) => {
      setToasts((prev) => [...prev, t]);
    });
    return unsub;
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  if (toasts.length === 0) return (
    <style>{`
      @keyframes toast-shrink {
        from { width: 100%; }
        to   { width: 0%; }
      }
    `}</style>
  );

  return (
    <>
      <style>{`
        @keyframes toast-shrink {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
      <div style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        alignItems: "flex-end",
        pointerEvents: "none",
      }}>
        {toasts.map((t) => (
          <div key={t.id} style={{ pointerEvents: "all" }}>
            <Toast
              id={t.id}
              message={t.message}
              type={t.type}
              duration={t.duration}
              onDismiss={dismiss}
            />
          </div>
        ))}
      </div>
    </>
  );
}
