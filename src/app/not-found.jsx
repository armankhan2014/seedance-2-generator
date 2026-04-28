"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function NotFound() {
  const [visible, setVisible] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      fontFamily: "Inter, sans-serif",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 20px",
      position: "relative",
      overflow: "hidden",
    }}>

      {/* Ambient glow */}
      <div style={{
        position: "absolute",
        top: "30%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "600px",
        height: "400px",
        background: "radial-gradient(ellipse, rgba(139,92,246,0.12) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Content */}
      <div style={{
        position: "relative",
        textAlign: "center",
        maxWidth: "480px",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: "opacity 0.5s ease, transform 0.5s ease",
      }}>

        {/* Film-strip icon */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          marginBottom: "28px",
        }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{
              width: i === 2 ? "40px" : "20px",
              height: i === 2 ? "40px" : "20px",
              borderRadius: "6px",
              background: i === 2
                ? "rgba(139,92,246,0.2)"
                : "rgba(255,255,255,0.04)",
              border: i === 2
                ? "1px solid rgba(139,92,246,0.4)"
                : "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: i === 2 ? 1 : 0.4 + (i % 2) * 0.2,
            }}>
              {i === 2 && (
                <span style={{ fontSize: "1.1rem" }}>✕</span>
              )}
            </div>
          ))}
        </div>

        {/* 404 */}
        <div style={{
          fontSize: "clamp(5rem, 18vw, 8rem)",
          fontWeight: 900,
          lineHeight: 1,
          letterSpacing: "-0.04em",
          background: "linear-gradient(135deg, #a78bfa 0%, #7c3aed 50%, #4c1d95 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          marginBottom: "12px",
          userSelect: "none",
        }}>
          404
        </div>

        {/* Headline */}
        <h1 style={{
          margin: "0 0 12px",
          fontSize: "1.4rem",
          fontWeight: 700,
          color: "#e2e8f0",
          letterSpacing: "-0.02em",
        }}>
          Frame not found
        </h1>

        {/* Subtext */}
        <p style={{
          margin: "0 0 36px",
          fontSize: "0.9rem",
          color: "#64748b",
          lineHeight: 1.7,
        }}>
          This scene doesn't exist in your timeline. The page may have been moved, deleted, or never generated.
        </p>

        {/* CTA */}
        <Link href="/" style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "13px 28px",
          background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
          color: "#fff",
          borderRadius: "12px",
          fontWeight: 700,
          fontSize: "0.9rem",
          textDecoration: "none",
          boxShadow: "0 8px 32px rgba(139,92,246,0.3)",
          transition: "opacity 0.2s, transform 0.2s",
        }}
          onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "translateY(0)"; }}
        >
          ⚡ Back to Generate
        </Link>

        {/* Secondary link */}
        <div style={{ marginTop: "20px" }}>
          <Link href="/creations" style={{
            fontSize: "0.82rem",
            color: "#475569",
            textDecoration: "none",
            borderBottom: "1px solid rgba(71,85,105,0.4)",
            paddingBottom: "1px",
            transition: "color 0.2s",
          }}
            onMouseEnter={e => { e.currentTarget.style.color = "#94a3b8"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#475569"; }}
          >
            View my gallery →
          </Link>
        </div>

      </div>

      {/* Bottom label */}
      <p style={{
        position: "absolute",
        bottom: "24px",
        fontSize: "0.72rem",
        color: "#1e293b",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        userSelect: "none",
      }}>
        Seedance Studio
      </p>
    </div>
  );
}
