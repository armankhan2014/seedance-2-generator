"use client";
import { useState, useEffect, useRef } from "react";
import { useSession, signIn } from "next-auth/react";

// ── Formatted prompt renderer ─────────────────────────────────────────────────
function FormattedPrompt({ text }) {
  const lines = text.split("\n");
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    // Skip empty lines — add a small spacer
    if (!line) {
      elements.push(<div key={i} style={{ height: "6px" }} />);
      i++;
      continue;
    }

    // Section header: **SECTION NAME**
    if (/^\*\*[A-Z &()–\-/]+\*\*$/.test(line)) {
      const heading = line.replace(/\*\*/g, "");
      elements.push(
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: "8px",
          marginTop: i === 0 ? "0" : "16px", marginBottom: "6px",
        }}>
          <div style={{
            height: "1px", width: "16px", flexShrink: 0,
            background: "rgba(139,92,246,0.5)",
          }} />
          <span style={{
            fontSize: "0.62rem", fontWeight: 800, color: "#8b5cf6",
            textTransform: "uppercase", letterSpacing: "0.1em",
            whiteSpace: "nowrap",
          }}>
            {heading}
          </span>
          <div style={{
            height: "1px", flex: 1,
            background: "rgba(139,92,246,0.2)",
          }} />
        </div>
      );
      i++;
      continue;
    }

    // Shot block header: SHOT N (time–time) — Title
    if (/^SHOT\s+\d+/i.test(line)) {
      // Collect all bullet lines that follow this shot header
      const shotLines = [];
      i++;
      while (i < lines.length && lines[i].trim().startsWith("•")) {
        shotLines.push(lines[i].trim());
        i++;
      }

      // Parse the header: SHOT N (time) — Title
      const headerMatch = line.match(/^(SHOT\s+\d+[^—–-]*)([—–-]+\s*(.*))?$/i);
      const shotLabel  = headerMatch ? headerMatch[1].trim() : line;
      const shotTitle  = headerMatch && headerMatch[3] ? headerMatch[3].trim() : "";

      // Colour code by shot number
      const shotNum = parseInt((line.match(/\d+/) || ["1"])[0], 10);
      const hue = [270, 210, 170, 30, 0, 320][(shotNum - 1) % 6];

      elements.push(
        <div key={`shot-${i}`} style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderLeft: `3px solid hsl(${hue},70%,55%)`,
          borderRadius: "8px",
          padding: "10px 12px",
          marginBottom: "8px",
        }}>
          {/* Shot header row */}
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: shotLines.length ? "8px" : "0" }}>
            <span style={{
              fontSize: "0.68rem", fontWeight: 800,
              color: `hsl(${hue},70%,65%)`,
              textTransform: "uppercase", letterSpacing: "0.06em",
              whiteSpace: "nowrap",
            }}>
              {shotLabel}
            </span>
            {shotTitle && (
              <span style={{
                fontSize: "0.82rem", fontWeight: 600, color: "#e2e8f0",
              }}>
                {shotTitle}
              </span>
            )}
          </div>

          {/* Bullet rows */}
          {shotLines.map((bl, bi) => {
            // Split "• Key: value" into key and value
            const inner = bl.replace(/^•\s*/, "");
            const colonIdx = inner.indexOf(":");
            const key   = colonIdx > -1 ? inner.slice(0, colonIdx).trim() : null;
            const value = colonIdx > -1 ? inner.slice(colonIdx + 1).trim() : inner;
            return (
              <div key={bi} style={{
                display: "flex", gap: "6px",
                fontSize: "0.78rem", lineHeight: 1.55,
                marginBottom: bi < shotLines.length - 1 ? "3px" : "0",
              }}>
                {key && (
                  <span style={{
                    color: "#64748b", fontWeight: 700,
                    minWidth: "52px", flexShrink: 0,
                    fontSize: "0.72rem", paddingTop: "1px",
                  }}>
                    {key}
                  </span>
                )}
                <span style={{ color: "#94a3b8" }}>{value}</span>
              </div>
            );
          })}
        </div>
      );
      continue;
    }

    // Bullet / list item (outside a shot block)
    if (line.startsWith("•") || line.startsWith("-")) {
      const inner = line.replace(/^[•\-]\s*/, "");
      elements.push(
        <div key={i} style={{
          display: "flex", gap: "8px",
          fontSize: "0.8rem", color: "#94a3b8",
          lineHeight: 1.6, marginBottom: "3px",
        }}>
          <span style={{ color: "#475569", flexShrink: 0 }}>•</span>
          <span>{inner}</span>
        </div>
      );
      i++;
      continue;
    }

    // Regular paragraph line — render inline bold (**text**) segments
    const renderInline = (txt) => {
      const parts = txt.split(/(\*\*[^*]+\*\*)/g);
      return parts.map((p, pi) => {
        if (/^\*\*[^*]+\*\*$/.test(p)) {
          return (
            <strong key={pi} style={{ color: "#c4b5fd", fontWeight: 700 }}>
              {p.replace(/\*\*/g, "")}
            </strong>
          );
        }
        return p;
      });
    };

    elements.push(
      <p key={i} style={{
        fontSize: "0.82rem", color: "#cbd5e1",
        lineHeight: 1.65, margin: "0 0 4px",
      }}>
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <div>{elements}</div>;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PromptBuilder({ onUse, onClose }) {
  const { data: session, status: sessionStatus } = useSession();

  // describe state
  const [freeText,  setFreeText]  = useState("");
  const [aiPrompt,  setAiPrompt]  = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState("");
  const [copied,    setCopied]    = useState(false);

  // credits state
  const [userCredits, setUserCredits] = useState(null);

  // fetch credits when logged in
  useEffect(() => {
    if (session?.user?.id) {
      fetch("/api/user/credits")
        .then(r => r.json())
        .then(d => setUserCredits(d.credits ?? 0))
        .catch(() => setUserCredits(0));
    }
  }, [session]);

  const overlayRef = useRef(null);

  // close on outside click
  useEffect(() => {
    const handler = (e) => { if (e.target === overlayRef.current) onClose(); };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [onClose]);

  // close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  async function handleAiBuild() {
    if (!freeText.trim()) return;
    setAiLoading(true);
    setAiError("");
    setAiPrompt("");
    setCopied(false);
    try {
      const r = await fetch("/api/prompt/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: freeText }),
      });
      const d = await r.json();
      if (d.prompt) setAiPrompt(d.prompt);
      else setAiError(d.error || "Could not build prompt — please try again.");
    } catch {
      setAiError("Network error — please try again.");
    }
    setAiLoading(false);
  }

  function handleCopy() {
    navigator.clipboard.writeText(aiPrompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  const S = {
    overlay: {
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px",
      backdropFilter: "blur(4px)",
    },
    modal: {
      background: "#111118",
      border: "1px solid rgba(139,92,246,0.25)",
      borderRadius: "20px",
      width: "100%",
      maxWidth: "620px",
      maxHeight: "90vh",
      overflowY: "auto",
      boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(139,92,246,0.1)",
      fontFamily: "Inter, sans-serif",
    },
    header: {
      padding: "22px 24px 20px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      position: "sticky", top: 0,
      background: "#111118",
      zIndex: 10,
    },
    title: {
      fontSize: "1rem", fontWeight: 800, color: "#e2e8f0",
      letterSpacing: "-0.02em", marginBottom: "4px",
    },
    subtitle: {
      fontSize: "0.78rem", color: "#475569",
    },
    body: { padding: "20px 24px" },
    label: {
      display: "block",
      fontSize: "0.68rem", fontWeight: 700, color: "#475569",
      textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "5px",
    },
    useBtn: (enabled) => ({
      width: "100%",
      padding: "12px",
      borderRadius: "10px",
      border: "none",
      background: enabled ? "linear-gradient(135deg,#8b5cf6,#7c3aed)" : "rgba(255,255,255,0.06)",
      color: enabled ? "#fff" : "#334155",
      fontSize: "0.9rem", fontWeight: 700,
      cursor: enabled ? "pointer" : "not-allowed",
      fontFamily: "inherit",
      marginTop: "14px",
      transition: "opacity 0.2s",
    }),
    textarea: {
      width: "100%",
      minHeight: "90px",
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "10px",
      padding: "10px 12px",
      color: "#e2e8f0",
      fontSize: "0.85rem",
      fontFamily: "inherit",
      resize: "vertical",
      outline: "none",
      lineHeight: 1.6,
      boxSizing: "border-box",
    },
    aiBtn: (enabled) => ({
      width: "100%",
      padding: "10px",
      borderRadius: "9px",
      border: "none",
      marginTop: "10px",
      background: enabled ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.04)",
      color: enabled ? "#a78bfa" : "#334155",
      fontSize: "0.85rem", fontWeight: 700,
      cursor: enabled ? "pointer" : "not-allowed",
      fontFamily: "inherit",
      transition: "all 0.15s",
    }),
  };

  return (
    <div style={S.overlay} ref={overlayRef}>
      <div style={S.modal}>

        {/* Header */}
        <div style={S.header}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <p style={S.title}>✨ Prompt Builder</p>
              <p style={S.subtitle}>No experience needed — build a Seedance-ready prompt in seconds.</p>
            </div>
            <button onClick={onClose} style={{
              background: "none", border: "none", color: "#475569",
              fontSize: "1.2rem", cursor: "pointer", padding: "2px 6px",
              lineHeight: 1, marginTop: "2px",
            }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={S.body}>
          {(() => {
            const isLoading = sessionStatus === "loading" || (session && userCredits === null);
            const isLoggedOut = sessionStatus === "unauthenticated";
            const hasNoCredits = session && userCredits !== null && userCredits <= 0;

            // ── Not logged in ──
            if (isLoggedOut) return (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                textAlign: "center", padding: "32px 16px", gap: "12px",
              }}>
                <div style={{ fontSize: "2rem" }}>🔒</div>
                <p style={{ fontSize: "0.9rem", fontWeight: 700, color: "#e2e8f0", margin: 0 }}>
                  Sign in to use AI Prompt Builder
                </p>
                <p style={{ fontSize: "0.78rem", color: "#475569", margin: 0, lineHeight: 1.6 }}>
                  Describe your idea in plain English and AI will write a full cinematic Seedance prompt for you.
                </p>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent("openSignIn"))}
                  style={{
                    marginTop: "8px", padding: "10px 24px",
                    background: "linear-gradient(135deg,#8b5cf6,#7c3aed)",
                    border: "none", borderRadius: "10px",
                    color: "#fff", fontSize: "0.85rem", fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Sign in with Google →
                </button>
              </div>
            );

            // ── Loading credits ──
            if (isLoading) return (
              <div style={{ padding: "40px 16px", textAlign: "center", color: "#475569", fontSize: "0.82rem" }}>
                Checking access…
              </div>
            );

            // ── No credits ──
            if (hasNoCredits) return (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                textAlign: "center", padding: "32px 16px", gap: "12px",
              }}>
                <div style={{ fontSize: "2rem" }}>⚡</div>
                <p style={{ fontSize: "0.9rem", fontWeight: 700, color: "#e2e8f0", margin: 0 }}>
                  Credits required
                </p>
                <p style={{ fontSize: "0.78rem", color: "#475569", margin: 0, lineHeight: 1.6 }}>
                  AI Prompt Builder is available to users with credits. Buy a credit pack to unlock it — credits never expire.
                </p>
                <a
                  href="/pricing"
                  style={{
                    marginTop: "8px", padding: "10px 24px",
                    background: "linear-gradient(135deg,#8b5cf6,#7c3aed)",
                    border: "none", borderRadius: "10px",
                    color: "#fff", fontSize: "0.85rem", fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit",
                    textDecoration: "none", display: "inline-block",
                  }}
                >
                  View Pricing →
                </a>
              </div>
            );

            // ── Has access — show normal UI ──
            return (
              <>
                <p style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: "10px", lineHeight: 1.6 }}>
                  Describe your vision in plain English. AI writes a full cinematic Seedance prompt.
                </p>
                <label style={S.label}>Your idea</label>
                <textarea
                  style={S.textarea}
                  placeholder={"e.g. A samurai running through cherry blossoms at night, slow motion, epic and cinematic"}
                  value={freeText}
                  onChange={e => setFreeText(e.target.value)}
                />

                <button
                  style={S.aiBtn(!!freeText.trim() && !aiLoading)}
                  disabled={!freeText.trim() || aiLoading}
                  onClick={handleAiBuild}
                >
                  {aiLoading ? "✨ Building your cinematic prompt…" : "✨ Build my prompt"}
                </button>

                {aiError && (
                  <div style={{
                    fontSize: "0.78rem", color: "#f87171", marginTop: "10px",
                    background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)",
                    borderRadius: "8px", padding: "10px 12px", lineHeight: 1.5,
                  }}>
                    {aiError}
                    {aiError.includes("credits") && (
                      <a href="/pricing" style={{ color: "#a78bfa", marginLeft: "6px", fontWeight: 700 }}>
                        Buy credits →
                      </a>
                    )}
                  </div>
                )}

                {aiPrompt && (
                  <>
                    <div style={{ marginTop: "16px" }}>
                      <div style={{
                        display: "flex", alignItems: "center",
                        justifyContent: "space-between", marginBottom: "8px",
                      }}>
                        <span style={{
                          fontSize: "0.65rem", fontWeight: 700, color: "#64748b",
                          textTransform: "uppercase", letterSpacing: "0.08em",
                        }}>
                          🎬 Your Seedance prompt
                        </span>
                        <button
                          onClick={handleCopy}
                          style={{
                            background: copied ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.05)",
                            border: `1px solid ${copied ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.1)"}`,
                            borderRadius: "6px",
                            color: copied ? "#4ade80" : "#64748b",
                            fontSize: "0.7rem", fontWeight: 700,
                            padding: "4px 10px", cursor: "pointer",
                            fontFamily: "inherit", transition: "all 0.2s",
                          }}
                        >
                          {copied ? "✓ Copied" : "Copy"}
                        </button>
                      </div>
                      <div style={{
                        background: "rgba(139,92,246,0.04)",
                        border: "1px solid rgba(139,92,246,0.18)",
                        borderRadius: "12px", padding: "16px 18px",
                        maxHeight: "420px", overflowY: "auto",
                      }}>
                        <FormattedPrompt text={aiPrompt} />
                      </div>
                    </div>
                    <button
                      style={S.useBtn(true)}
                      onClick={() => { onUse(aiPrompt); onClose(); }}
                    >
                      Use this prompt →
                    </button>
                  </>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
