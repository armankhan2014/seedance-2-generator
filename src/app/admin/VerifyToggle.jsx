"use client";
import { useState } from "react";

export default function VerifyToggle({ email, initial }) {
  const [verified, setVerified] = useState(!!initial);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (loading) return;
    const next = !verified;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/verify-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, verified: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setVerified(next);
    } catch (err) {
      alert(`Could not update: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={verified ? "Click to unverify" : "Click to verify"}
      style={{
        padding: "4px 10px",
        borderRadius: 6,
        border: "1px solid",
        background: verified ? "rgba(233,30,140,0.15)" : "rgba(255,255,255,0.04)",
        borderColor: verified ? "rgba(233,30,140,0.5)" : "rgba(255,255,255,0.1)",
        color: verified ? "#f9a8d4" : "#94a3b8",
        fontSize: 11,
        fontWeight: 700,
        cursor: loading ? "wait" : "pointer",
        opacity: loading ? 0.6 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        transition: "all 0.15s",
        fontFamily: "inherit",
      }}
    >
      {loading ? (
        <span style={{ display: "inline-block", width: 10, height: 10, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
      ) : verified ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="#e91e8c" xmlns="http://www.w3.org/2000/svg">
          <path d="M23 12l-2.44-2.79.34-3.69-3.61-.82-1.89-3.2L12 2.96 8.6 1.5 6.71 4.69 3.1 5.5l.34 3.7L1 12l2.44 2.79-.34 3.7 3.61.82 1.89 3.2L12 21.04l3.4 1.46 1.89-3.19 3.61-.82-.34-3.69z" />
          <path d="M10 17l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9z" fill="white" />
        </svg>
      ) : null}
      {verified ? "Verified" : "Verify"}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}
