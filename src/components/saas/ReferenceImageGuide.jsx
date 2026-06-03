"use client";

/**
 * ReferenceImageGuide — Phase 1.5
 *
 * Visual-first version. The teaching surface now uses inline SVG
 * portrait illustrations for every example so users learn what a
 * good reference looks like by SEEING it, not by uploading and
 * trial-and-erroring. Upload + quality check stays below the
 * visual guide as a secondary action.
 *
 * Brand lime accents (#d9ff00) for OK states, amber for "could be
 * better", red for "won't work". Dark surface matches the existing
 * seedance saas design tokens. Inline SVG = no external assets, no
 * licensing concerns, ships instantly.
 */

import { useEffect, useRef, useState } from "react";
import { detectFaces, loadImageElement, sampleLuminance } from "@/lib/face-detector";

const BRAND_LIME = "#d9ff00";
const AMBER = "#f59e0b";
const RED = "#ef4444";

/* ─────────────────────────────────────────────────────────────────
 * SVG portrait illustrations
 *
 * Each kind renders the SAME base portrait (centred head, shoulders,
 * eyes, nose, mouth) and then layers the scenario-specific overlay
 * (sunglasses bar, side rotation, distance scale, background noise,
 * etc.). Keeping the base consistent makes the comparison stark —
 * users see the SAME face and instantly read which constraint is
 * being violated.
 * ────────────────────────────────────────────────────────────────*/

function PortraitSvg({ kind = "good", size = 96 }) {
  // Background tint per scenario.
  const bg = kind === "good" ? "#1f3022" : "#2a1f1f";

  // Side-angle / tilt rotation.
  const rotate = kind === "side-angle" ? "rotate(-30 50 50)" : "";

  // Distance scaling — "too-far" shrinks the whole portrait
  // toward the centre to convey a face that's small in frame.
  const distanceScale = kind === "too-far" ? 0.45 : 1.0;
  const distanceTransform =
    kind === "too-far"
      ? `translate(${50 * (1 - distanceScale)} ${52 * (1 - distanceScale)}) scale(${distanceScale})`
      : "";

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-hidden="true"
      style={{ display: "block", borderRadius: 10 }}
    >
      {/* Background. Bad scenarios get a darker red tint, good gets
          a soft green tint — instant pre-attentive cue. */}
      <rect width="100" height="100" fill={bg} />

      {/* Busy-background overlay — scribbles + extra silhouettes
          so the example reads as "cluttered scene". */}
      {kind === "busy-bg" && (
        <g opacity="0.4">
          <circle cx="20" cy="20" r="6" fill="#6a6a6a" />
          <circle cx="78" cy="22" r="4" fill="#6a6a6a" />
          <circle cx="14" cy="62" r="5" fill="#6a6a6a" />
          <circle cx="86" cy="70" r="6" fill="#6a6a6a" />
          <rect x="6" y="40" width="10" height="3" fill="#6a6a6a" />
          <rect x="84" y="48" width="10" height="3" fill="#6a6a6a" />
          <path d="M5 90 L95 90" stroke="#5a5a5a" strokeWidth="1.5" />
          {/* Extra silhouette shoulders to imply other people. */}
          <ellipse cx="14" cy="100" rx="14" ry="10" fill="#3d3d3d" />
          <ellipse cx="86" cy="100" rx="14" ry="10" fill="#3d3d3d" />
        </g>
      )}

      {/* Bad-lighting overlay — strong directional shadow. */}
      {kind === "bad-light" && (
        <rect x="0" y="0" width="50" height="100" fill="rgba(0,0,0,0.55)" />
      )}

      {/* Multiple-faces overlay — render a SECOND head behind the
          primary one. */}
      {kind === "multiple" && (
        <g>
          <circle cx="78" cy="42" r="18" fill="#3d3d3d" />
          <circle cx="73" cy="40" r="2" fill="#fff" />
          <circle cx="84" cy="40" r="2" fill="#fff" />
          <path
            d="M70 52 Q78 56 86 52"
            stroke="#aaa"
            strokeWidth="1.5"
            fill="none"
          />
        </g>
      )}

      {/* The portrait itself — transformed for tilt / distance. */}
      <g transform={`${rotate} ${distanceTransform}`.trim()}>
        {/* Shoulders */}
        <path
          d="M18 100 Q18 70 50 70 Q82 70 82 100 Z"
          fill="#3d3d3d"
        />
        {/* Head */}
        <circle cx="50" cy="42" r="22" fill="#4a4a4a" />
        {/* Hair shape (just a darker arc on top) */}
        <path
          d="M28 36 Q50 14 72 36 L72 30 Q50 18 28 30 Z"
          fill="#2a2a2a"
        />

        {/* Eyes (omitted when sunglasses overlay is on top) */}
        {kind !== "sunglasses" && (
          <>
            <circle cx="42" cy="42" r="2.4" fill="#fff" />
            <circle cx="58" cy="42" r="2.4" fill="#fff" />
            <circle cx="42" cy="42" r="0.9" fill="#222" />
            <circle cx="58" cy="42" r="0.9" fill="#222" />
          </>
        )}

        {/* Nose */}
        <line
          x1="50" y1="44" x2="50" y2="50"
          stroke="#bbb" strokeWidth="1.4" strokeLinecap="round"
        />

        {/* Mouth */}
        <path
          d="M44 56 Q50 60 56 56"
          stroke="#bbb" strokeWidth="1.5"
          fill="none" strokeLinecap="round"
        />
      </g>

      {/* Sunglasses overlay — black bar covering both eyes. */}
      {kind === "sunglasses" && (
        <g>
          <rect x="34" y="38" width="32" height="8" rx="3" fill="#0a0a0a" />
          <line
            x1="34" y1="42" x2="66" y2="42"
            stroke="#222" strokeWidth="1"
          />
        </g>
      )}

      {/* "Too-far" — frame the tiny portrait so the empty space
          around it reads as wasted distance. */}
      {kind === "too-far" && (
        <g opacity="0.5">
          <rect
            x="6" y="6" width="88" height="88"
            fill="none" stroke="#6a6a6a"
            strokeWidth="1" strokeDasharray="3 3"
          />
        </g>
      )}
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * Example catalogue — visual scenario + caption.
 * ────────────────────────────────────────────────────────────────*/

const GOOD_EXAMPLES = [
  { kind: "good", label: "Looking forward",  caption: "Both eyes visible, face squared to camera" },
  { kind: "good", label: "Plain background", caption: "Nothing distracting behind you" },
  { kind: "good", label: "Even lighting",    caption: "Soft daylight — no harsh shadows" },
  { kind: "good", label: "Face fills frame", caption: "Forehead to chin clearly visible" },
];

const BAD_EXAMPLES = [
  { kind: "sunglasses",  label: "No sunglasses",   caption: "AI needs to see your eyes" },
  { kind: "side-angle",  label: "Don't tilt",      caption: "Face the camera straight on" },
  { kind: "too-far",     label: "Don't stand far", caption: "Move closer — fill the frame" },
  { kind: "busy-bg",     label: "No clutter",      caption: "Skip group photos + busy backgrounds" },
  { kind: "bad-light",   label: "No hard shadows", caption: "Avoid half-lit faces" },
  { kind: "multiple",    label: "One person only", caption: "Crop out everyone else" },
];

/* ─────────────────────────────────────────────────────────────────
 * Quality scoring — same logic as v1, just packaged neatly.
 * ────────────────────────────────────────────────────────────────*/

function scoreFace({ result, luminance }) {
  const issues = [];
  const details = {};
  if (!result || result.count === 0 || !result.primary) {
    return {
      verdict: "block",
      issues: ["No face detected in this photo. Try a clear, front-facing portrait."],
      details: {},
    };
  }
  const p = result.primary;
  details.faceCount = result.count;
  details.faceAreaPct = p.areaPct;
  details.confidence = p.confidence;
  if (result.count > 1) {
    issues.push(`We see ${result.count} faces — use a photo with just one person.`);
    return { verdict: "block", issues, details };
  }
  if (p.areaPct < 8) {
    issues.push("Face is too small in the frame. Move closer to the camera.");
    return { verdict: "block", issues, details };
  } else if (p.areaPct < 20) {
    issues.push("Face is a bit small — a closer shot will help.");
  }
  const { leftEye, rightEye, nose } = p.landmarks;
  if (leftEye && rightEye && nose) {
    const eyeMidX = (leftEye.x + rightEye.x) / 2;
    const eyeDist = Math.abs(leftEye.x - rightEye.x) || 1;
    const noseOffset = Math.abs(nose.x - eyeMidX) / eyeDist;
    details.noseOffset = noseOffset;
    if (noseOffset > 0.40) {
      issues.push("Try facing the camera directly — this looks like a side angle.");
    } else if (noseOffset > 0.25) {
      issues.push("Slight angle — looking straight at the camera works best.");
    }
  }
  if (typeof luminance === "number") {
    details.luminance = luminance;
    if (luminance < 0.20) {
      issues.push("This photo looks dark on the face. Try better lighting.");
    } else if (luminance > 0.92) {
      issues.push("Highlights look blown out — try softer lighting.");
    }
  }
  if (p.confidence < 0.80) {
    issues.push("Make sure your full face is visible — no hands, hats, or sunglasses.");
  }
  if (issues.length === 0) return { verdict: "pass", issues: [], details };
  return { verdict: "warn", issues, details };
}

/* ─────────────────────────────────────────────────────────────────
 * Main component
 * ────────────────────────────────────────────────────────────────*/

export default function ReferenceImageGuide({
  onAccept,
  maxFileMB = 8,
  className,
  style: extraStyle,
}) {
  const [phase, setPhase] = useState("intro"); // intro | checking | result
  const [error, setError] = useState(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const handlePick = async (f) => {
    setError(null);
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("That's not an image file. Try a JPG, PNG, or WebP.");
      return;
    }
    if (f.size > maxFileMB * 1024 * 1024) {
      setError(`That file is over ${maxFileMB} MB. Try a smaller one.`);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(f);
    setFile(f);
    setPreviewUrl(url);
    setPhase("checking");
    setVerdict(null);
    try {
      const img = await loadImageElement(url);
      const result = await detectFaces(img);
      const luminance = result?.primary
        ? sampleLuminance(img, result.primary.bbox)
        : null;
      const scored = scoreFace({ result, luminance });
      setVerdict(scored);
      setPhase("result");
    } catch (err) {
      console.warn("[ReferenceImageGuide] check failed:", err);
      setVerdict({
        verdict: "pass",
        issues: ["Couldn't auto-check the photo — proceeding anyway."],
        details: {},
      });
      setPhase("result");
    }
  };

  const onFileInput = (e) => handlePick(e.target.files?.[0]);
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handlePick(e.dataTransfer.files?.[0]);
  };
  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setVerdict(null);
    setPhase("intro");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };
  const accept = () => { if (file && onAccept) onAccept(file); };

  return (
    <div
      className={className}
      style={{
        background: "#0a0a0a",
        color: "#f5f5f5",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        padding: 22,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        ...extraStyle,
      }}
    >
      {/* ── Header ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{
          width: 7, height: 7, borderRadius: 999,
          background: BRAND_LIME, boxShadow: `0 0 8px ${BRAND_LIME}`,
        }} />
        <h2 style={{
          fontSize: 14, fontWeight: 800, letterSpacing: "0.12em",
          textTransform: "uppercase", margin: 0, color: "#888",
        }}>
          Reference photo guide
        </h2>
      </div>
      <p style={{
        fontSize: 13, color: "#bbb",
        margin: "0 0 22px", lineHeight: 1.55,
      }}>
        For accurate face matching, use a clear passport-style portrait.
        Match the <strong style={{ color: BRAND_LIME }}>green</strong> examples
        below — avoid the <strong style={{ color: RED }}>red</strong> ones.
      </p>

      {/* ── HERO: Side-by-side comparison ───────────────────────── */}
      <HeroComparison />

      {/* ── Detailed rule tiles ────────────────────────────────── */}
      {phase === "intro" && (
        <>
          <RowHeader label="Like this" colour={BRAND_LIME} icon="✓" />
          <TileGrid examples={GOOD_EXAMPLES} colour={BRAND_LIME} icon="✓" />

          <RowHeader label="Not like this" colour={RED} icon="✗" />
          <TileGrid examples={BAD_EXAMPLES} colour={RED} icon="✗" />
        </>
      )}

      {/* ── Upload zone / check states ─────────────────────────── */}
      <div style={{ marginTop: 22 }}>
        {phase === "intro" && (
          <DropZone
            isDragging={isDragging}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onPick={() => inputRef.current?.click()}
            error={error}
          />
        )}
        {phase === "checking" && previewUrl && (
          <CheckingState previewUrl={previewUrl} />
        )}
        {phase === "result" && previewUrl && verdict && (
          <ResultState
            previewUrl={previewUrl}
            verdict={verdict}
            onUseAnyway={accept}
            onTryAgain={reset}
          />
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onFileInput}
          style={{ display: "none" }}
        />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * Sub-components
 * ────────────────────────────────────────────────────────────────*/

function HeroComparison() {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginBottom: 18,
    }}>
      <HeroSide
        kind="good"
        title="Like this"
        sub="Clear, front-facing portrait"
        colour={BRAND_LIME}
        icon="✓"
      />
      <HeroSide
        kind="sunglasses"
        title="Not this"
        sub="Sunglasses + side angle + clutter"
        colour={RED}
        icon="✗"
        bgScribble
      />
    </div>
  );
}

function HeroSide({ kind, title, sub, colour, icon, bgScribble }) {
  return (
    <div style={{
      position: "relative",
      border: `1px solid ${colour}55`,
      borderRadius: 12,
      padding: "18px 14px 14px",
      background: `linear-gradient(180deg, ${colour}10 0%, transparent 70%)`,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
    }}>
      <div style={{
        position: "absolute", top: 10, right: 10,
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 8px", borderRadius: 999,
        background: `${colour}22`, color: colour,
        fontSize: 10, fontWeight: 900, letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}>
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 14, height: 14, borderRadius: 999,
          background: colour, color: "#0a0a0a", fontSize: 10, fontWeight: 900,
        }}>{icon}</span>
        {kind === "good" ? "Good" : "Avoid"}
      </div>
      <PortraitSvg kind={kind} size={120} />
      <div style={{
        marginTop: 10, fontSize: 14, fontWeight: 800, color: "#f5f5f5",
      }}>
        {title}
      </div>
      <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function RowHeader({ label, colour, icon }) {
  return (
    <div style={{
      marginTop: 18, marginBottom: 8,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 18, height: 18, borderRadius: 999,
        background: colour, color: "#0a0a0a",
        fontSize: 11, fontWeight: 900,
      }}>{icon}</span>
      <span style={{
        fontSize: 11, fontWeight: 800, letterSpacing: "0.12em",
        textTransform: "uppercase", color: colour,
      }}>
        {label}
      </span>
    </div>
  );
}

function TileGrid({ examples, colour, icon }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
      gap: 8,
    }}>
      {examples.map((ex) => (
        <div key={ex.kind + ex.label} style={{
          position: "relative",
          background: "rgba(255,255,255,0.025)",
          border: `1px solid ${colour}30`,
          borderRadius: 10, padding: 10,
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <div style={{
            position: "absolute", top: 6, right: 6,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 16, height: 16, borderRadius: 999,
            background: colour, color: "#0a0a0a",
            fontSize: 10, fontWeight: 900,
          }}>{icon}</div>
          <PortraitSvg kind={ex.kind} size={64} />
          <div style={{
            marginTop: 4, fontSize: 12, fontWeight: 700, color: "#f5f5f5",
          }}>
            {ex.label}
          </div>
          <div style={{ fontSize: 10.5, color: "#888", lineHeight: 1.4 }}>
            {ex.caption}
          </div>
        </div>
      ))}
    </div>
  );
}

function DropZone({ isDragging, onDrop, onDragOver, onDragLeave, onPick, error }) {
  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={onPick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onPick(); }}
      style={{
        border: `2px dashed ${isDragging ? BRAND_LIME : "rgba(255,255,255,0.18)"}`,
        background: isDragging ? "rgba(212,255,64,0.06)" : "rgba(255,255,255,0.02)",
        borderRadius: 12, padding: "26px 18px", textAlign: "center",
        cursor: "pointer", outline: "none",
        transition: "background 140ms ease, border-color 140ms ease",
      }}
    >
      <div style={{ fontSize: 30, lineHeight: 1, marginBottom: 8 }}>📸</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#f5f5f5" }}>
        Drop a photo here, or tap to choose
      </div>
      <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
        JPG / PNG / WebP up to 8 MB. We&rsquo;ll auto-check it against the rules above.
      </div>
      {error && (
        <div style={{ marginTop: 12, fontSize: 12, color: RED }}>
          {error}
        </div>
      )}
    </div>
  );
}

function CheckingState({ previewUrl }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: 16, borderRadius: 12,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.10)",
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={previewUrl} alt="" width={96} height={96}
        style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#f5f5f5", marginBottom: 4 }}>
          Analysing your photo…
        </div>
        <div style={{ fontSize: 11, color: "#888" }}>
          One moment — first run downloads ~600 KB of face-detection model.
        </div>
        <div style={{
          marginTop: 8, height: 4, borderRadius: 999,
          background: "rgba(255,255,255,0.08)", overflow: "hidden",
        }}>
          <div style={{
            width: "40%", height: "100%", background: BRAND_LIME,
            animation: "ref-guide-slide 1.4s ease-in-out infinite",
          }} />
        </div>
        <style>{`@keyframes ref-guide-slide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }`}</style>
      </div>
    </div>
  );
}

function ResultState({ previewUrl, verdict, onUseAnyway, onTryAgain }) {
  const v = verdict.verdict;
  const tint = v === "pass" ? BRAND_LIME : v === "warn" ? AMBER : RED;
  const title =
    v === "pass" ? "Looks good — ready to use" :
    v === "warn" ? "Could be better, but it'll work" :
    "This photo won't work — please try another";
  return (
    <div style={{
      padding: 16, borderRadius: 12,
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${tint}55`,
    }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl} alt="" width={96} height={96}
          style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "3px 9px", borderRadius: 999,
            background: `${tint}22`, color: tint,
            fontSize: 10, fontWeight: 800, letterSpacing: "0.08em",
            textTransform: "uppercase", marginBottom: 6,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: tint }} />
            {v === "pass" ? "Pass" : v === "warn" ? "Warning" : "Blocked"}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#f5f5f5", marginBottom: 6 }}>
            {title}
          </div>
          {verdict.issues.length > 0 && (
            <ul style={{ margin: "4px 0 0", paddingLeft: 16, color: "#bbb", fontSize: 12, lineHeight: 1.5 }}>
              {verdict.issues.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
          )}
        </div>
      </div>
      <div style={{
        marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap",
        justifyContent: "flex-end",
      }}>
        <button
          type="button"
          onClick={onTryAgain}
          style={{
            background: "transparent", color: "#bbb",
            border: "1px solid rgba(255,255,255,0.16)",
            borderRadius: 8, padding: "8px 14px",
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Try another photo
        </button>
        {v !== "block" && (
          <button
            type="button"
            onClick={onUseAnyway}
            style={{
              background: v === "pass" ? BRAND_LIME : "rgba(212,255,64,0.10)",
              color: v === "pass" ? "#0a0a0a" : BRAND_LIME,
              border: `1px solid ${BRAND_LIME}`,
              borderRadius: 8, padding: "8px 16px",
              fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              letterSpacing: "0.02em",
            }}
          >
            {v === "pass" ? "Use this photo" : "Use anyway"}
          </button>
        )}
      </div>
    </div>
  );
}
