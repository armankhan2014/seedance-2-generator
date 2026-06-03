"use client";

/**
 * ReferenceImageGuide
 *
 * Phase 1 of the Reference Image Guidelines system. Drops into any
 * face-reference upload point on the platform. Three responsibilities:
 *
 *   1. Visual guide — good-vs-bad example grid that teaches users
 *      what a passport-style reference looks like.
 *   2. Drag-drop upload zone — accepts any image file.
 *   3. Quality check on drop — runs BlazeFace client-side to detect
 *      face count, face size, angle (from eye/nose landmarks),
 *      brightness inside the face bbox. Maps results to a friendly
 *      verdict: pass / warn / block, each with a specific reason.
 *
 * `onAccept(file)` fires when the user accepts the image (either
 * automatically when checks pass, or via the "Use anyway" override
 * after a warning). The parent decides what to do with the file
 * (upload to /api/upload, attach to the generation request, etc).
 *
 * Brand lime accents (#d9ff00) for OK states, amber (#f59e0b) for
 * "could be better", red (#ef4444) for "won't work". Dark surface
 * matches the existing seedance saas design tokens.
 */

import { useEffect, useRef, useState } from "react";
import { detectFaces, loadImageElement, sampleLuminance } from "@/lib/face-detector";

const BRAND_LIME = "#d9ff00";
const AMBER = "#f59e0b";
const RED = "#ef4444";

/* ── Example slots ────────────────────────────────────────────────
 *
 * The good/bad galleries are intentionally CSS-rendered placeholder
 * cards instead of real photos for v1. Avoids licensing concerns and
 * lets the component ship the same day. Each card has a colour-coded
 * SVG icon + short caption so users can scan the rules without
 * reading prose. Drop real example photos into the `src` field on
 * each item once we have them.
 */
const GOOD_EXAMPLES = [
  { label: "Looking at camera", caption: "Direct front view, eyes visible" },
  { label: "Plain background", caption: "No clutter behind you" },
  { label: "Good lighting", caption: "Soft, even — no harsh shadows" },
  { label: "Full face shown", caption: "Forehead to chin in frame" },
];
const BAD_EXAMPLES = [
  { label: "Sunglasses", caption: "AI can't read your eyes" },
  { label: "Side angle", caption: "AI needs the full front of your face" },
  { label: "Too far away", caption: "Face is too small for detail" },
  { label: "Busy background", caption: "Other people / objects confuse it" },
];

/**
 * Score the BlazeFace result + computed luminance into a verdict.
 * Returns: { verdict: "pass" | "warn" | "block", issues: string[],
 *            details: object } so the UI can render a per-issue list.
 */
function scoreFace({ result, luminance }) {
  const issues = [];
  const details = {};

  // No face detected — hard blocker.
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

  // Multiple faces — hard blocker. AI gets confused which one to use.
  if (result.count > 1) {
    issues.push(`We see ${result.count} faces — use a photo with just one person.`);
    return { verdict: "block", issues, details };
  }

  // Face too small — strong warning. Real-world: 15-20% is usable;
  // <8% is unrecognisable. We block <8 and warn <20.
  if (p.areaPct < 8) {
    issues.push("Face is too small in the frame. Move closer to the camera.");
    return { verdict: "block", issues, details };
  } else if (p.areaPct < 20) {
    issues.push("Face is a bit small — a closer shot will help.");
  }

  // Angle check from eye + nose landmarks. We compute the
  // horizontal nose offset relative to the midpoint between the
  // eyes. >25% of inter-eye distance means strong side-angle.
  const { leftEye, rightEye, nose } = p.landmarks;
  if (leftEye && rightEye && nose) {
    const eyeMidX = (leftEye.x + rightEye.x) / 2;
    const eyeDist = Math.abs(leftEye.x - rightEye.x) || 1;
    const noseOffset = Math.abs(nose.x - eyeMidX) / eyeDist;
    details.noseOffset = noseOffset;
    if (noseOffset > 0.40) {
      issues.push("Try facing the camera directly — this looks like a side angle.");
      // Strong side angle alone is a warn, not a block, because some
      // models can still work with it.
    } else if (noseOffset > 0.25) {
      issues.push("Slight angle — looking straight at the camera works best.");
    }
  }

  // Lighting — luminance 0-1. <0.20 is very dark, >0.92 is blown.
  if (typeof luminance === "number") {
    details.luminance = luminance;
    if (luminance < 0.20) {
      issues.push("This photo looks dark on the face. Try better lighting.");
    } else if (luminance > 0.92) {
      issues.push("Highlights look blown out — try softer lighting.");
    }
  }

  // Confidence below 80% usually means heavy occlusion (hand, hat,
  // hair across face, or sunglasses if visible enough). Soft warn.
  if (p.confidence < 0.80) {
    issues.push("Make sure your full face is visible — no hands, hats, or sunglasses.");
  }

  if (issues.length === 0) return { verdict: "pass", issues: [], details };
  return { verdict: "warn", issues, details };
}

export default function ReferenceImageGuide({
  onAccept,                 // (file) => void — fires when user accepts
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
      // If the model fails to load at all, fall back to letting the
      // user proceed — don't punish them for our infra issue.
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
        <h2 style={{ fontSize: 14, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", margin: 0, color: "#888" }}>
          Reference photo
        </h2>
      </div>
      <p style={{ fontSize: 13, color: "#bbb", margin: "0 0 18px", lineHeight: 1.5 }}>
        For accurate face matching, use a clear passport-style portrait.
        We&rsquo;ll auto-check the photo for common issues like sunglasses,
        side angle, or busy backgrounds.
      </p>

      {/* ── Visual good/bad guide ───────────────────────────────── */}
      {phase === "intro" && (
        <>
          <GuideRow
            title="✓ Good"
            tint={BRAND_LIME}
            examples={GOOD_EXAMPLES}
            iconKind="check"
          />
          <GuideRow
            title="✗ Avoid"
            tint={RED}
            examples={BAD_EXAMPLES}
            iconKind="cross"
          />
        </>
      )}

      {/* ── Upload zone / result ────────────────────────────────── */}
      <div style={{ marginTop: 18 }}>
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
 * Sub-components below — kept inline because they're only used by
 * this guide and pulling them into a separate file would add 3
 * more imports for no encapsulation win.
 * ────────────────────────────────────────────────────────────────*/

function GuideRow({ title, tint, examples, iconKind }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 11, fontWeight: 800, letterSpacing: "0.10em",
        textTransform: "uppercase", color: tint, marginBottom: 8,
      }}>
        {title}
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 8,
      }}>
        {examples.map((ex) => (
          <div key={ex.label} style={{
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${tint}33`,
            borderRadius: 10, padding: "10px 12px",
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 12, fontWeight: 700, color: "#f5f5f5",
            }}>
              <BadgeIcon kind={iconKind} colour={tint} />
              {ex.label}
            </div>
            <div style={{ fontSize: 11, color: "#888", lineHeight: 1.4 }}>
              {ex.caption}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BadgeIcon({ kind, colour }) {
  if (kind === "check") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 16, height: 16, borderRadius: 999, background: colour, color: "#0a0a0a",
        fontSize: 10, fontWeight: 900, flexShrink: 0,
      }}>✓</span>
    );
  }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 16, height: 16, borderRadius: 999, background: colour, color: "#fff",
      fontSize: 10, fontWeight: 900, flexShrink: 0,
    }}>✗</span>
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
        borderRadius: 12, padding: "28px 18px", textAlign: "center",
        cursor: "pointer", outline: "none",
        transition: "background 140ms ease, border-color 140ms ease",
      }}
    >
      <div style={{ fontSize: 32, lineHeight: 1, marginBottom: 8 }}>📸</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#f5f5f5" }}>
        Drop a photo here, or tap to choose
      </div>
      <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
        JPG, PNG, or WebP up to 8 MB. We&rsquo;ll check it automatically.
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
