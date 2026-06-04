"use client";

/**
 * ReferenceImageGuide — Phase 2
 *
 * Visual teaching surface is now the user's own SEEDANCE REF poster
 * served same-origin from /public/reference-guide/seedance-ref.png.
 * The poster already covers every case (good/bad rows, more bad
 * examples, tips, recommended set) in one cohesive design — no
 * reason for the component to recreate it with placeholders.
 *
 * Below the poster sits the upload zone + BlazeFace quality check
 * pipeline, unchanged from prior phase.
 */

import { useEffect, useRef, useState } from "react";
import { detectFaces, loadImageElement, sampleLuminance } from "@/lib/face-detector";

const LIME = "#16a34a";
const AMBER = "#f59e0b";
const RED = "#dc2626";
const CREAM_BG = "#f5f1ea";
const CREAM_CARD = "#ffffff";
const INK = "#1f2937";
const MUTED = "#6b7280";

const POSTER_SRC = "/reference-guide/seedance-ref.png";

/* ─────────────────────────────────────────────────────────────────
 * BlazeFace verdict scoring (unchanged)
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
        background: CREAM_BG,
        color: INK,
        border: `1px solid rgba(0,0,0,0.08)`,
        borderRadius: 16,
        padding: 16,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        ...extraStyle,
      }}
    >
      {phase === "intro" && (
        <>
          {/* ── The poster ─ everything the user needs to learn is
              already on this one image. Hosted same-origin so it's
              cache-friendly + survives offline visits. */}
          <div style={{
            width: "100%",
            aspectRatio: "1536 / 1024",
            borderRadius: 12,
            overflow: "hidden",
            background: CREAM_CARD,
            border: "1px solid rgba(0,0,0,0.06)",
            marginBottom: 16,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={POSTER_SRC}
              alt="Seedance face reference guide — Good vs Bad examples"
              width={1400}
              height={933}
              loading="eager"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: "block",
              }}
            />
          </div>

          {/* ── Upload zone ──────────────────────────────────── */}
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
        border: `2px dashed ${isDragging ? LIME : "rgba(0,0,0,0.20)"}`,
        background: isDragging ? "rgba(22,163,74,0.06)" : CREAM_CARD,
        borderRadius: 12, padding: "22px 18px", textAlign: "center",
        cursor: "pointer", outline: "none",
        transition: "background 140ms ease, border-color 140ms ease",
      }}
    >
      <div style={{ fontSize: 26, lineHeight: 1, marginBottom: 6 }}>📸</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: INK }}>
        Upload your photo
      </div>
      <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }}>
        JPG, PNG, or WebP — we&rsquo;ll auto-check it against the rules above
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
      background: CREAM_CARD,
      border: "1px solid rgba(0,0,0,0.08)",
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={previewUrl} alt="" width={96} height={96}
        style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 4 }}>
          Checking your photo…
        </div>
        <div style={{ fontSize: 11, color: MUTED }}>
          One moment.
        </div>
        <div style={{
          marginTop: 8, height: 4, borderRadius: 999,
          background: "rgba(0,0,0,0.08)", overflow: "hidden",
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
  const tint = v === "pass" ? LIME : v === "warn" ? AMBER : RED;
  const title =
    v === "pass" ? "Looks good — ready to use" :
    v === "warn" ? "It'll work, but could be better" :
    "This photo won't work — please try another";
  return (
    <div style={{
      padding: 16, borderRadius: 12,
      background: CREAM_CARD,
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
          <div style={{ fontSize: 14, fontWeight: 700, color: INK, marginBottom: 6 }}>
            {title}
          </div>
          {verdict.issues.length > 0 && (
            <ul style={{ margin: "4px 0 0", paddingLeft: 16, color: "#374151", fontSize: 12, lineHeight: 1.5 }}>
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
            background: "transparent", color: MUTED,
            border: "1px solid rgba(0,0,0,0.16)",
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
              background: v === "pass" ? LIME : "rgba(22,163,74,0.10)",
              color: v === "pass" ? "#fff" : LIME,
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
