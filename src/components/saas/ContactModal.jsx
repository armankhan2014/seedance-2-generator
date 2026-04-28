"use client";
import { useState } from "react";

export default function ContactModal({ onClose }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", message: "" });
  const [status, setStatus] = useState("idle"); // idle | sending | success | error

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(4px)",
          zIndex: 999,
        }}
      />

      {/* Modal */}
      <div style={{
        position: "fixed",
        top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        zIndex: 1000,
        background: "#111118",
        border: "1px solid rgba(139,92,246,0.25)",
        borderRadius: "16px",
        padding: "32px",
        width: "90%",
        maxWidth: "440px",
        boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
        fontFamily: "Inter,sans-serif",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "#fff" }}>
            Contact Us
          </h2>
          <button
            onClick={onClose}
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#94a3b8", width: "32px", height: "32px", cursor: "pointer", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
            ✕
          </button>
        </div>

        {status === "success" ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>✅</div>
            <p style={{ color: "#a78bfa", fontWeight: 600, fontSize: "1rem", margin: "0 0 8px" }}>Message sent!</p>
            <p style={{ color: "#64748b", fontSize: "0.85rem", margin: 0 }}>We'll get back to you soon.</p>
            <button
              onClick={onClose}
              style={{ marginTop: "20px", background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", border: "none", borderRadius: "8px", color: "#fff", padding: "10px 24px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Name row */}
            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  First Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="Arman"
                  value={form.firstName}
                  onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "#fff",
                    padding: "10px 12px",
                    fontSize: "0.875rem",
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Last Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="Khan"
                  value={form.lastName}
                  onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "#fff",
                    padding: "10px 12px",
                    fontSize: "0.875rem",
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                />
              </div>
            </div>

            {/* Message */}
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Message
              </label>
              <textarea
                required
                placeholder="Describe your issue or question..."
                rows={5}
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "#fff",
                  padding: "10px 12px",
                  fontSize: "0.875rem",
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {status === "error" && (
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#f87171" }}>
                Something went wrong. Please try again.
              </p>
            )}

            <button
              type="submit"
              disabled={status === "sending"}
              style={{
                background: status === "sending" ? "rgba(139,92,246,0.5)" : "linear-gradient(135deg,#8b5cf6,#7c3aed)",
                border: "none",
                borderRadius: "8px",
                color: "#fff",
                padding: "12px",
                fontSize: "0.9rem",
                fontWeight: 700,
                cursor: status === "sending" ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                marginTop: "4px",
              }}>
              {status === "sending" ? "Sending…" : "Send Message"}
            </button>
          </form>
        )}
      </div>
    </>
  );
}
