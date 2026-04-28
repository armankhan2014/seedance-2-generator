"use client";
import { useState, useEffect, useRef } from "react";

// ── Guided options ────────────────────────────────────────────────────────────
const SUBJECTS = [
  { value: "",                label: "Choose subject…" },
  { value: "a young woman",   label: "👩 Young woman" },
  { value: "a young man",     label: "👨 Young man" },
  { value: "a majestic lion", label: "🦁 Lion" },
  { value: "a white wolf",    label: "🐺 Wolf" },
  { value: "a dragon",        label: "🐉 Dragon" },
  { value: "a lone astronaut",label: "🧑‍🚀 Astronaut" },
  { value: "a warrior",       label: "⚔️ Warrior" },
  { value: "a futuristic city",label: "🌆 Futuristic city" },
  { value: "a vast ocean",    label: "🌊 Ocean" },
  { value: "a mountain peak", label: "🏔️ Mountain" },
  { value: "a dense forest",  label: "🌲 Forest" },
];

const SETTINGS = [
  { value: "",                         label: "Choose setting…" },
  { value: "at golden hour on a misty mountaintop", label: "🌅 Golden hour mountain" },
  { value: "in a neon-lit cyberpunk city at night",  label: "🌃 Cyberpunk city night" },
  { value: "on a deserted beach at sunset",          label: "🏖️ Beach sunset" },
  { value: "in a dark enchanted forest",             label: "🌑 Dark enchanted forest" },
  { value: "in outer space with distant galaxies",   label: "🌌 Outer space" },
  { value: "in a vast desert under a blazing sun",   label: "🏜️ Desert midday" },
  { value: "in a cozy rain-soaked alleyway",         label: "🌧️ Rainy alleyway" },
  { value: "in an ancient temple ruin",              label: "🏛️ Ancient temple" },
  { value: "on a snowy tundra under northern lights",label: "🌌 Northern lights tundra" },
  { value: "in a dramatic stormy sky",               label: "⛈️ Stormy sky" },
];

const ACTIONS = [
  { value: "",                               label: "Choose action…" },
  { value: "walking slowly forward",         label: "🚶 Walking forward" },
  { value: "running through the environment",label: "🏃 Running" },
  { value: "standing still as wind moves",   label: "🧍 Standing, wind effect" },
  { value: "looking directly into the camera",label: "👁️ Looking at camera" },
  { value: "rising into the air dramatically",label: "⬆️ Rising up" },
  { value: "turning around in slow motion",  label: "🔄 Slow turn" },
  { value: "emerging from shadows",          label: "🌑 Emerging from shadows" },
  { value: "dissolving into particles",      label: "✨ Dissolving to particles" },
];

const MOODS = [
  { value: "",                  label: "Choose mood…" },
  { value: "epic and cinematic",label: "🎬 Epic & cinematic" },
  { value: "dreamy and ethereal",label: "🌙 Dreamy & ethereal" },
  { value: "dark and mysterious",label: "🖤 Dark & mysterious" },
  { value: "peaceful and serene",label: "🕊️ Peaceful & serene" },
  { value: "energetic and intense",label: "⚡ Energetic & intense" },
  { value: "warm and nostalgic",label: "🌻 Warm & nostalgic" },
  { value: "cold and isolated",  label: "❄️ Cold & isolated" },
  { value: "magical and surreal",label: "🪄 Magical & surreal" },
];

const CAMERAS = [
  { value: "",                            label: "Choose camera…" },
  { value: "shot on a slow cinematic drone sweep", label: "🚁 Drone sweep" },
  { value: "extreme close-up portrait shot",       label: "🔍 Extreme close-up" },
  { value: "wide establishing shot",               label: "🌐 Wide establishing" },
  { value: "smooth tracking shot",                 label: "📹 Tracking shot" },
  { value: "slow motion, 240fps",                  label: "🐌 Slow motion" },
  { value: "handheld cinematic camera",            label: "🎥 Handheld cinematic" },
  { value: "low angle looking up",                 label: "⬇️ Low angle" },
  { value: "bird's eye view from above",           label: "🦅 Bird's eye" },
];

const STYLES = [
  { value: "",                        label: "Choose style…" },
  { value: "photorealistic, 8K, hyper-detailed", label: "📷 Photorealistic 8K" },
  { value: "cinematic film look, 35mm grain",    label: "🎞️ Cinematic film" },
  { value: "anime style, vibrant colours",       label: "✏️ Anime" },
  { value: "dark fantasy concept art",           label: "🐉 Dark fantasy art" },
  { value: "neon cyberpunk aesthetic",           label: "🌈 Neon cyberpunk" },
  { value: "vintage 1970s film aesthetic",       label: "📺 Vintage 70s film" },
  { value: "painterly impressionist style",      label: "🖌️ Impressionist" },
  { value: "high-contrast noir black and white", label: "⚫ Noir B&W" },
];

function buildGuidedPrompt({ subject, setting, action, mood, camera, style }) {
  const parts = [];
  if (subject) parts.push(subject);
  if (action)  parts.push(action);
  if (setting) parts.push(setting);
  if (camera)  parts.push(camera);
  if (mood)    parts.push(`${mood} atmosphere`);
  if (style)   parts.push(style);
  if (parts.length === 0) return "";
  return parts.join(", ") + ".";
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PromptBuilder({ onUse, onClose }) {
  const [tab, setTab] = useState("guided");

  // guided state
  const [subject, setSubject] = useState("");
  const [setting, setSetting] = useState("");
  const [action,  setAction]  = useState("");
  const [mood,    setMood]    = useState("");
  const [camera,  setCamera]  = useState("");
  const [style,   setStyle]   = useState("");

  // describe state
  const [freeText, setFreeText] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState("");

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

  const guidedPrompt = buildGuidedPrompt({ subject, setting, action, mood, camera, style });
  const guidedReady  = guidedPrompt.length > 0;

  async function handleAiBuild() {
    if (!freeText.trim()) return;
    setAiLoading(true);
    setAiError("");
    setAiPrompt("");
    try {
      const r = await fetch("/api/prompt/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: freeText }),
      });
      const d = await r.json();
      if (d.prompt) setAiPrompt(d.prompt);
      else setAiError(d.error || "Could not build prompt — try the Guided tab.");
    } catch {
      setAiError("Network error — please try again.");
    }
    setAiLoading(false);
  }

  const activePrompt = tab === "guided" ? guidedPrompt : aiPrompt;

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
      maxWidth: "560px",
      maxHeight: "90vh",
      overflowY: "auto",
      boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(139,92,246,0.1)",
      fontFamily: "Inter, sans-serif",
    },
    header: {
      padding: "22px 24px 0",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    },
    title: {
      fontSize: "1rem", fontWeight: 800, color: "#e2e8f0",
      letterSpacing: "-0.02em", marginBottom: "4px",
    },
    subtitle: {
      fontSize: "0.78rem", color: "#475569", marginBottom: "16px",
    },
    tabs: {
      display: "flex", gap: "4px",
    },
    tab: (active) => ({
      padding: "8px 16px",
      fontSize: "0.8rem", fontWeight: 700,
      border: "none", cursor: "pointer",
      borderRadius: "8px 8px 0 0",
      fontFamily: "inherit",
      background: active ? "rgba(139,92,246,0.15)" : "transparent",
      color: active ? "#a78bfa" : "#475569",
      borderBottom: active ? "2px solid #8b5cf6" : "2px solid transparent",
      transition: "all 0.15s",
    }),
    body: { padding: "20px 24px" },
    label: {
      display: "block",
      fontSize: "0.68rem", fontWeight: 700, color: "#475569",
      textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "5px",
    },
    select: {
      width: "100%",
      padding: "9px 12px",
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "9px",
      color: "#e2e8f0",
      fontSize: "0.85rem",
      fontFamily: "inherit",
      outline: "none",
      cursor: "pointer",
      appearance: "none",
      WebkitAppearance: "none",
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "12px",
      marginBottom: "16px",
    },
    preview: {
      background: "rgba(139,92,246,0.06)",
      border: "1px solid rgba(139,92,246,0.2)",
      borderRadius: "10px",
      padding: "12px 14px",
      marginTop: "16px",
    },
    previewLabel: {
      fontSize: "0.65rem", fontWeight: 700,
      color: "#64748b", textTransform: "uppercase",
      letterSpacing: "0.08em", marginBottom: "6px",
    },
    previewText: {
      fontSize: "0.82rem", color: "#c4b5fd",
      lineHeight: 1.6, fontStyle: "italic",
      minHeight: "36px",
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
          <div style={S.tabs}>
            <button style={S.tab(tab === "guided")}   onClick={() => setTab("guided")}>
              🎛️ Guided
            </button>
            <button style={S.tab(tab === "describe")} onClick={() => setTab("describe")}>
              💬 Describe it
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={S.body}>

          {/* ── GUIDED TAB ── */}
          {tab === "guided" && (
            <>
              <div style={S.grid}>
                {[
                  { label: "Subject / Character", val: subject, set: setSubject, opts: SUBJECTS },
                  { label: "Setting / Location",  val: setting, set: setSetting, opts: SETTINGS },
                  { label: "Action / Motion",     val: action,  set: setAction,  opts: ACTIONS  },
                  { label: "Mood / Atmosphere",   val: mood,    set: setMood,    opts: MOODS    },
                  { label: "Camera Style",        val: camera,  set: setCamera,  opts: CAMERAS  },
                  { label: "Visual Style",        val: style,   set: setStyle,   opts: STYLES   },
                ].map(({ label, val, set, opts }) => (
                  <div key={label}>
                    <label style={S.label}>{label}</label>
                    <div style={{ position: "relative" }}>
                      <select
                        value={val}
                        onChange={e => set(e.target.value)}
                        style={S.select}
                      >
                        {opts.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <span style={{
                        position: "absolute", right: "10px", top: "50%",
                        transform: "translateY(-50%)",
                        color: "#64748b", fontSize: "0.7rem", pointerEvents: "none",
                      }}>▾</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reset */}
              {guidedReady && (
                <button onClick={() => {
                  setSubject(""); setSetting(""); setAction("");
                  setMood(""); setCamera(""); setStyle("");
                }} style={{
                  background: "none", border: "none", color: "#475569",
                  fontSize: "0.75rem", cursor: "pointer", padding: 0,
                  fontFamily: "inherit",
                }}>
                  ↺ Reset selections
                </button>
              )}

              {/* Preview */}
              <div style={S.preview}>
                <p style={S.previewLabel}>Preview</p>
                <p style={S.previewText}>
                  {guidedReady ? guidedPrompt : "Select options above to see your prompt…"}
                </p>
              </div>

              <button
                style={S.useBtn(guidedReady)}
                disabled={!guidedReady}
                onClick={() => { onUse(guidedPrompt); onClose(); }}
              >
                Use this prompt →
              </button>
            </>
          )}

          {/* ── DESCRIBE TAB ── */}
          {tab === "describe" && (
            <>
              <p style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: "10px", lineHeight: 1.6 }}>
                Describe your vision in plain English. Our AI will turn it into an optimised Seedance prompt.
              </p>
              <label style={S.label}>Your idea</label>
              <textarea
                style={S.textarea}
                placeholder={"e.g. A wolf howling at the moon in a dark forest, feels dramatic and cinematic"}
                value={freeText}
                onChange={e => setFreeText(e.target.value)}
              />

              <button
                style={S.aiBtn(!!freeText.trim() && !aiLoading)}
                disabled={!freeText.trim() || aiLoading}
                onClick={handleAiBuild}
              >
                {aiLoading ? "✨ Building prompt…" : "✨ Build my prompt"}
              </button>

              {aiError && (
                <p style={{ fontSize: "0.78rem", color: "#f87171", marginTop: "8px" }}>{aiError}</p>
              )}

              {aiPrompt && (
                <>
                  <div style={S.preview}>
                    <p style={S.previewLabel}>Your Seedance prompt</p>
                    <p style={S.previewText}>{aiPrompt}</p>
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
          )}

        </div>
      </div>
    </div>
  );
}
