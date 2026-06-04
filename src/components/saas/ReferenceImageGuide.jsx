"use client";

/**
 * ReferenceImageGuide — Phase 1.6
 *
 * Visual redesign per Arman's feedback: drop the busy tile grid,
 * keep three big illustrated example "photos":
 *
 *   1) BAD  — distant figure, busy background (full body shot)
 *   2) BAD  — group photo with cluttered scene
 *   3) GOOD — passport-style close-up, clear face
 *
 * Each card is a single big illustration with one short label and
 * an obvious check / cross badge. No grids, no rows of tiny tiles,
 * no technical chrome. Users see three pictures and immediately
 * understand the difference.
 *
 * Upload + face quality check stays available below the visuals
 * but is intentionally secondary — the visual lesson does the
 * teaching.
 */

import { useEffect, useRef, useState } from "react";
import { detectFaces, loadImageElement, sampleLuminance } from "@/lib/face-detector";

const LIME = "#d9ff00";
const RED = "#ef4444";

/* ─────────────────────────────────────────────────────────────────
 * The three example illustrations.
 *
 * Each is a large viewBox-300x300 SVG painted to look like a real
 * reference photo — soft gradients, simple silhouettes, recognisable
 * scenes. No abstract chrome. Inline so the component ships zero
 * external assets.
 * ────────────────────────────────────────────────────────────────*/

function PhotoBadDistant() {
  return (
    <svg viewBox="0 0 300 300" width="100%" height="100%" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="sky-d" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#5a87b5" />
          <stop offset="100%" stopColor="#c8d7e3" />
        </linearGradient>
        <linearGradient id="ground-d" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#6b6452" />
          <stop offset="100%" stopColor="#3a3528" />
        </linearGradient>
      </defs>
      {/* Sky */}
      <rect width="300" height="220" fill="url(#sky-d)" />
      {/* Ground */}
      <rect y="220" width="300" height="80" fill="url(#ground-d)" />
      {/* Distant buildings (silhouettes — implies busy scene) */}
      <rect x="10"  y="160" width="40"  height="60" fill="#2e2e2e" />
      <rect x="55"  y="175" width="35"  height="45" fill="#363636" />
      <rect x="95"  y="140" width="50"  height="80" fill="#2a2a2a" />
      <rect x="150" y="170" width="30"  height="50" fill="#333" />
      <rect x="185" y="150" width="55"  height="70" fill="#2b2b2b" />
      <rect x="245" y="180" width="45"  height="40" fill="#363636" />
      {/* Distant trees for texture */}
      <circle cx="60" cy="200" r="14" fill="#1f3022" />
      <circle cx="220" cy="210" r="12" fill="#1f3022" />
      <circle cx="265" cy="205" r="11" fill="#1f3022" />
      {/* The TINY full-body figure — barely a person */}
      <g transform="translate(150 215)">
        <circle cx="0" cy="0" r="5" fill="#222" />          {/* head */}
        <rect x="-4" y="5" width="8" height="14" fill="#1c1c1c" />  {/* torso */}
        <line x1="0" y1="19" x2="-5" y2="32" stroke="#1c1c1c" strokeWidth="2.5" />  {/* leg */}
        <line x1="0" y1="19" x2="5"  y2="32" stroke="#1c1c1c" strokeWidth="2.5" />  {/* leg */}
        <line x1="0" y1="9"  x2="-7" y2="16" stroke="#1c1c1c" strokeWidth="2" />    {/* arm */}
        <line x1="0" y1="9"  x2="7"  y2="16" stroke="#1c1c1c" strokeWidth="2" />    {/* arm */}
      </g>
      {/* Hint of clouds */}
      <ellipse cx="50"  cy="55" rx="38" ry="9" fill="#f0f0f0" opacity="0.55" />
      <ellipse cx="220" cy="40" rx="44" ry="10" fill="#f0f0f0" opacity="0.55" />
    </svg>
  );
}

function PhotoBadGroup() {
  return (
    <svg viewBox="0 0 300 300" width="100%" height="100%" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="room-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#8a6d4a" />
          <stop offset="100%" stopColor="#3a2d1f" />
        </linearGradient>
      </defs>
      {/* Room interior */}
      <rect width="300" height="300" fill="url(#room-g)" />
      {/* Cluttered decor — picture frames + plant */}
      <rect x="20"  y="40" width="48" height="36" fill="#5a4630" stroke="#1c1308" strokeWidth="3" />
      <rect x="80"  y="55" width="44" height="32" fill="#5a4630" stroke="#1c1308" strokeWidth="3" />
      <rect x="220" y="30" width="60" height="44" fill="#5a4630" stroke="#1c1308" strokeWidth="3" />
      {/* Plant */}
      <g transform="translate(15 260)">
        <rect x="0" y="0" width="22" height="20" fill="#3d2817" />
        <ellipse cx="11" cy="-2" rx="22" ry="14" fill="#2f4a26" />
        <ellipse cx="3"  cy="-6" rx="12" ry="10" fill="#3a5a2c" />
        <ellipse cx="20" cy="-4" rx="11" ry="9"  fill="#3a5a2c" />
      </g>
      {/* The cluster of FIVE heads — clearly multiple people */}
      <g>
        {/* back row, slightly higher */}
        <PersonBust cx="80"  cy="160" skin="#a8856a" shirt="#3d4a5a" />
        <PersonBust cx="135" cy="155" skin="#c7a387" shirt="#4d3b2e" />
        <PersonBust cx="195" cy="160" skin="#8c6748" shirt="#5a5a3e" />
        {/* front row, two slightly lower in frame */}
        <PersonBust cx="105" cy="200" skin="#b9967c" shirt="#3a3a3a" />
        <PersonBust cx="170" cy="205" skin="#a17a5b" shirt="#6b3d3d" />
      </g>
    </svg>
  );
}

/* Helper: one person bust (head + neck + shoulders) used in the group photo */
function PersonBust({ cx, cy, skin, shirt }) {
  return (
    <g>
      {/* shoulders / shirt */}
      <ellipse cx={cx} cy={cy + 50} rx="36" ry="22" fill={shirt} />
      {/* neck */}
      <rect x={cx - 6} y={cy + 22} width="12" height="14" fill={skin} />
      {/* head */}
      <circle cx={cx} cy={cy} r="18" fill={skin} />
      {/* hair top */}
      <path
        d={`M ${cx - 18} ${cy - 4} Q ${cx} ${cy - 24} ${cx + 18} ${cy - 4} L ${cx + 18} ${cy - 10} Q ${cx} ${cy - 20} ${cx - 18} ${cy - 10} Z`}
        fill="#1f1813"
      />
      {/* eyes */}
      <circle cx={cx - 6} cy={cy + 1} r="1.6" fill="#1a1a1a" />
      <circle cx={cx + 6} cy={cy + 1} r="1.6" fill="#1a1a1a" />
      {/* mouth */}
      <path d={`M ${cx - 4} ${cy + 10} Q ${cx} ${cy + 12} ${cx + 4} ${cy + 10}`} stroke="#5a3a2a" strokeWidth="1.2" fill="none" />
    </g>
  );
}

function PhotoGoodPassport() {
  return (
    <svg viewBox="0 0 300 300" width="100%" height="100%" role="img" aria-hidden="true">
      <defs>
        <radialGradient id="bg-g" cx="50%" cy="40%" r="70%">
          <stop offset="0%"  stopColor="#e9e3d5" />
          <stop offset="100%" stopColor="#aea693" />
        </radialGradient>
      </defs>
      {/* Plain neutral background — passport-style */}
      <rect width="300" height="300" fill="url(#bg-g)" />
      {/* Big shoulders, fills the bottom of the frame */}
      <ellipse cx="150" cy="320" rx="160" ry="60" fill="#3a4a5a" />
      {/* Neck */}
      <rect x="138" y="185" width="24" height="32" fill="#caa382" />
      {/* Hair back (sits behind head) */}
      <ellipse cx="150" cy="115" rx="76" ry="62" fill="#231a14" />
      {/* HEAD — large, fills most of the canvas like a real passport photo */}
      <circle cx="150" cy="130" r="68" fill="#caa382" />
      {/* Hair top */}
      <path
        d="M 78 110 Q 150 28 222 110 Q 222 80 200 60 Q 150 30 100 60 Q 78 80 78 110 Z"
        fill="#1c130d"
      />
      {/* Eyebrows */}
      <path d="M 116 124 Q 128 119 142 124" stroke="#1c130d" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M 158 124 Q 172 119 184 124" stroke="#1c130d" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* Eyes */}
      <ellipse cx="129" cy="135" rx="6.5" ry="4.5" fill="#fff" />
      <ellipse cx="171" cy="135" rx="6.5" ry="4.5" fill="#fff" />
      <circle  cx="129" cy="136" r="3" fill="#3a2a18" />
      <circle  cx="171" cy="136" r="3" fill="#3a2a18" />
      <circle  cx="130" cy="135" r="1" fill="#fff" />
      <circle  cx="172" cy="135" r="1" fill="#fff" />
      {/* Nose */}
      <path d="M 150 142 Q 144 158 148 168 Q 150 170 152 168 Q 156 158 150 142" fill="#b08866" />
      {/* Mouth */}
      <path d="M 132 178 Q 150 188 168 178" stroke="#7a3a2a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M 132 178 Q 150 184 168 178" fill="#9a4a3a" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * Verdict math (unchanged — uses BlazeFace results)
 * ────────────────────────────────────────────────────────────────*/

function scoreFace({ result, luminance }) {
  const issues = [];
  if (!result || result.count === 0 || !result.primary) {
    return { verdict: "block", issues: ["No face detected. Try a clear, front-facing portrait."] };
  }
  const p = result.primary;
  if (result.count > 1) {
    issues.push(`We see ${result.count} faces — use a photo with just one person.`);
    return { verdict: "block", issues };
  }
  if (p.areaPct < 8) {
    issues.push("Face is too small. Move closer to the camera.");
    return { verdict: "block", issues };
  } else if (p.areaPct < 20) {
    issues.push("Face is a bit small — a closer shot will help.");
  }
  const { leftEye, rightEye, nose } = p.landmarks;
  if (leftEye && rightEye && nose) {
    const eyeMidX = (leftEye.x + rightEye.x) / 2;
    const eyeDist = Math.abs(leftEye.x - rightEye.x) || 1;
    const noseOffset = Math.abs(nose.x - eyeMidX) / eyeDist;
    if (noseOffset > 0.40)      issues.push("Face the camera directly — looks like a side angle.");
    else if (noseOffset > 0.25) issues.push("Slight angle — looking straight at the camera works best.");
  }
  if (typeof luminance === "number") {
    if (luminance < 0.20) issues.push("Photo looks dark on the face — try better lighting.");
    else if (luminance > 0.92) issues.push("Highlights blown out — try softer lighting.");
  }
  if (p.confidence < 0.80) {
    issues.push("Make sure your full face is visible — no hands, hats, or sunglasses.");
  }
  if (issues.length === 0) return { verdict: "pass", issues: [] };
  return { verdict: "warn", issues };
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
  const [phase, setPhase] = useState("intro");
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
    if (!f.type.startsWith("image/")) { setError("That's not an image file."); return; }
    if (f.size > maxFileMB * 1024 * 1024) { setError(`Over ${maxFileMB} MB. Try smaller.`); return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(f);
    setFile(f); setPreviewUrl(url); setPhase("checking"); setVerdict(null);
    try {
      const img = await loadImageElement(url);
      const result = await detectFaces(img);
      const luminance = result?.primary ? sampleLuminance(img, result.primary.bbox) : null;
      setVerdict(scoreFace({ result, luminance }));
      setPhase("result");
    } catch (err) {
      console.warn("[ReferenceImageGuide] check failed:", err);
      setVerdict({ verdict: "pass", issues: ["Couldn't auto-check — proceeding."] });
      setPhase("result");
    }
  };

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null); setPreviewUrl(null); setVerdict(null); setPhase("intro"); setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };
  const accept = () => { if (file && onAccept) onAccept(file); };

  return (
    <div
      className={className}
      style={{
        background: "#0f0f0f",
        color: "#f5f5f5",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 16,
        padding: 24,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        ...extraStyle,
      }}
    >
      {/* ── Big simple headline ─────────────────────────────────── */}
      <h2 style={{
        fontSize: 20, fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.01em",
      }}>
        Use a photo like this
      </h2>
      <p style={{ fontSize: 13, color: "#888", margin: "0 0 22px", lineHeight: 1.5 }}>
        A close-up where your face fills the frame.
      </p>

      {phase === "intro" && (
        <>
          {/* ── Three big photo examples ─────────────────────────── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
            marginBottom: 24,
          }}>
            <ExampleCard
              kind="bad"
              label="Too far · busy background"
              Illustration={PhotoBadDistant}
            />
            <ExampleCard
              kind="bad"
              label="Group photo · full body"
              Illustration={PhotoBadGroup}
            />
            <ExampleCard
              kind="good"
              label="Close-up · passport-style"
              Illustration={PhotoGoodPassport}
            />
          </div>

          {/* ── Upload affordance ─────────────────────────────────── */}
          <DropZone
            isDragging={isDragging}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); handlePick(e.dataTransfer.files?.[0]); }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onPick={() => inputRef.current?.click()}
            error={error}
          />
        </>
      )}

      {phase === "checking" && previewUrl && <CheckingState previewUrl={previewUrl} />}
      {phase === "result"   && previewUrl && verdict && (
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
        onChange={(e) => handlePick(e.target.files?.[0])}
        style={{ display: "none" }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * Sub-components
 * ────────────────────────────────────────────────────────────────*/

function ExampleCard({ kind, label, Illustration }) {
  const isGood = kind === "good";
  const tint = isGood ? LIME : RED;
  return (
    <figure style={{ margin: 0 }}>
      <div style={{
        position: "relative",
        aspectRatio: "1 / 1",
        borderRadius: 14,
        overflow: "hidden",
        border: `2px solid ${tint}`,
        boxShadow: `0 0 0 4px ${tint}1a`,
        background: "#0a0a0a",
      }}>
        <Illustration />
        {/* Big corner badge — ✓ for good, ✗ for bad. */}
        <div style={{
          position: "absolute",
          top: 10, right: 10,
          width: 32, height: 32, borderRadius: 999,
          background: tint, color: isGood ? "#0a0a0a" : "#fff",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, fontWeight: 900,
          boxShadow: "0 4px 12px rgba(0,0,0,0.55)",
        }}>
          {isGood ? "✓" : "✗"}
        </div>
        {/* For BAD examples, layer a translucent red wash + diagonal
            cross-out for a stronger "no" signal. */}
        {!isGood && (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(239,68,68,0.10)",
            pointerEvents: "none",
          }} />
        )}
      </div>
      <figcaption style={{
        textAlign: "center",
        marginTop: 8,
        fontSize: 12.5,
        fontWeight: 700,
        color: isGood ? LIME : "#bbb",
      }}>
        {label}
      </figcaption>
    </figure>
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
        border: `2px dashed ${isDragging ? LIME : "rgba(255,255,255,0.18)"}`,
        background: isDragging ? "rgba(212,255,64,0.06)" : "rgba(255,255,255,0.02)",
        borderRadius: 12, padding: "26px 18px", textAlign: "center",
        cursor: "pointer", outline: "none",
        transition: "background 140ms ease, border-color 140ms ease",
      }}
    >
      <div style={{ fontSize: 28, lineHeight: 1, marginBottom: 8 }}>📸</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#f5f5f5" }}>
        Upload your photo
      </div>
      <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
        JPG, PNG, or WebP — we&rsquo;ll check it for you
      </div>
      {error && (
        <div style={{ marginTop: 10, fontSize: 12, color: RED }}>
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
          Checking your photo…
        </div>
        <div style={{ fontSize: 11, color: "#888" }}>
          One moment.
        </div>
        <div style={{
          marginTop: 8, height: 4, borderRadius: 999,
          background: "rgba(255,255,255,0.08)", overflow: "hidden",
        }}>
          <div style={{
            width: "40%", height: "100%", background: LIME,
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
  const tint = v === "pass" ? LIME : v === "warn" ? "#f59e0b" : RED;
  const title =
    v === "pass" ? "Looks good — ready to use" :
    v === "warn" ? "It'll work, but could be better" :
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
          Try another
        </button>
        {v !== "block" && (
          <button
            type="button"
            onClick={onUseAnyway}
            style={{
              background: v === "pass" ? LIME : "rgba(212,255,64,0.10)",
              color: v === "pass" ? "#0a0a0a" : LIME,
              border: `1px solid ${LIME}`,
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
