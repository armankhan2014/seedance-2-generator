"use client";

/**
 * ReferenceImageGuide — Phase 1.7
 *
 * Visual rewrite to match Arman's reference poster: cream background,
 * "GOOD – USE THESE" on the left in green, "BAD – AVOID THESE" on the
 * right in red, each section is a row of real-looking portrait photos
 * with a one-line label below. Bottom strip: tip checklist.
 *
 * Photos: i.pravatar.cc — free portrait avatar service, returns
 * passport-style headshots by ID. The BAD column reuses the SAME four
 * IDs as GOOD but with CSS filters / overlays applied to simulate
 * quality issues (blur, dark, overexposed, sunglasses). Same model in
 * both columns makes the contrast obvious.
 *
 * Upload + face-quality check stays available below the visual guide
 * but is intentionally secondary — the visual lesson does the teaching.
 */

import { useEffect, useRef, useState } from "react";
import { detectFaces, loadImageElement, sampleLuminance } from "@/lib/face-detector";

const LIME = "#16a34a";   // muted green for "GOOD" — matches the cream surface
const RED  = "#dc2626";   // crisp red for "BAD"
const CREAM_BG  = "#f5f1ea";
const CREAM_CARD = "#ffffff";
const INK = "#1f2937";
const MUTED = "#6b7280";

// Pravatar avatar IDs we trust to render as clean passport portraits.
// All Caucasian male / brown skin tone variants picked from the
// curated set so the "GOOD" row looks coherent.
const FACE_IDS = [12, 33, 51, 68];
const pravatar = (id) => `https://i.pravatar.cc/400?img=${id}`;

/* ─────────────────────────────────────────────────────────────────
 * Example rows. The same image URL appears in both columns — the
 * BAD column applies CSS filters / overlay markup to degrade it.
 * ────────────────────────────────────────────────────────────────*/

const GOOD_ROW = [
  { id: FACE_IDS[0], label: "Clear & sharp",      sub: "High res, in focus" },
  { id: FACE_IDS[1], label: "Good lighting",       sub: "Soft, even daylight" },
  { id: FACE_IDS[2], label: "Plain background",    sub: "Nothing behind you" },
  { id: FACE_IDS[3], label: "Looking forward",     sub: "Eyes on the camera" },
];

const BAD_ROW = [
  { id: FACE_IDS[0], label: "Blurry",       sub: "Out of focus", filter: "blur(7px)" },
  { id: FACE_IDS[1], label: "Too dark",     sub: "Poor lighting", filter: "brightness(0.25)" },
  { id: FACE_IDS[2], label: "Overexposed",  sub: "Highlights blown", filter: "brightness(1.85) saturate(0.35) contrast(0.85)" },
  { id: FACE_IDS[3], label: "Sunglasses",   sub: "Eyes covered", overlay: "sunglasses" },
];

const MORE_BAD_ROW = [
  { id: 47, label: "Side angle",     sub: "Not facing camera",   transform: "rotate(-22deg) scale(0.95)" },
  { id: 56, label: "Too far away",   sub: "Face too small in frame", transform: "scale(0.45) translate(0, 10%)", bg: "#cdcfd1" },
  { id: 32, label: "Multiple faces", sub: "Use a solo photo",   overlay: "duplicate" },
  { id: 21, label: "Heavy filter",   sub: "Alters real features", filter: "hue-rotate(-18deg) saturate(2.2) sepia(0.4) contrast(1.15)" },
];

const TIPS = [
  "Use a real, recent photo — no heavy edits or filters",
  "Face fills most of the frame, forehead to chin visible",
  "Look straight at the camera, no tilt",
  "Soft even lighting, no harsh shadows",
  "Plain background — nobody else in the frame",
];

/* ─────────────────────────────────────────────────────────────────
 * Verdict math (BlazeFace) — unchanged from prior phase.
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
        padding: "28px 24px 24px",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        ...extraStyle,
      }}
    >
      {/* ── Centered headline ───────────────────────────────────── */}
      <h2 style={{
        margin: 0,
        textAlign: "center",
        fontSize: 22,
        fontWeight: 900,
        letterSpacing: "0.01em",
        color: INK,
      }}>
        Face Reference Guide
      </h2>
      <p style={{
        textAlign: "center",
        fontSize: 13,
        color: MUTED,
        margin: "6px 0 22px",
      }}>
        Good vs Bad examples for best results
      </p>

      {phase === "intro" && (
        <>
          {/* ── First row: GOOD on left, BAD on right ───────────── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 22,
            marginBottom: 22,
          }}>
            <ExampleColumn
              kind="good"
              title="USE THESE"
              rows={[GOOD_ROW]}
            />
            <ExampleColumn
              kind="bad"
              title="AVOID THESE"
              rows={[BAD_ROW]}
            />
          </div>

          {/* ── Second row: MORE BAD examples (full-width) ─────── */}
          <ExampleColumn
            kind="bad"
            title="MORE BAD EXAMPLES"
            rows={[MORE_BAD_ROW]}
            fullWidth
          />

          {/* ── Tips panel ───────────────────────────────────── */}
          <div style={{
            marginTop: 22,
            background: CREAM_CARD,
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 12,
            padding: "16px 18px",
          }}>
            <div style={{
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: INK,
              marginBottom: 10,
            }}>
              💡 Tips for best results
            </div>
            <ul style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "6px 18px",
            }}>
              {TIPS.map((t) => (
                <li key={t} style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  fontSize: 12.5,
                  color: "#374151",
                  lineHeight: 1.4,
                }}>
                  <span style={{
                    flexShrink: 0,
                    color: LIME,
                    fontWeight: 900,
                    marginTop: 1,
                  }}>✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* ── Upload zone ──────────────────────────────────── */}
          <div style={{ marginTop: 18 }}>
            <DropZone
              isDragging={isDragging}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); handlePick(e.dataTransfer.files?.[0]); }}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onPick={() => inputRef.current?.click()}
              error={error}
            />
          </div>
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

function ExampleColumn({ kind, title, rows, fullWidth }) {
  const colour = kind === "good" ? LIME : RED;
  const icon   = kind === "good" ? "✓" : "✗";
  const headerLabel =
    kind === "good"
      ? "GOOD"
      : "BAD";
  return (
    <section>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 10,
      }}>
        <div style={{
          width: 24,
          height: 24,
          borderRadius: 999,
          background: colour,
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 900,
        }}>
          {icon}
        </div>
        <div style={{
          fontSize: 14,
          fontWeight: 900,
          letterSpacing: "0.04em",
          color: colour,
        }}>
          {headerLabel} – {title}
        </div>
      </div>

      {rows.map((row, ri) => (
        <div
          key={ri}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${row.length}, 1fr)`,
            gap: 10,
          }}
        >
          {row.map((item, ci) => (
            <ExamplePhotoCard
              key={ci}
              item={item}
              kind={kind}
              fullWidth={fullWidth}
            />
          ))}
        </div>
      ))}
    </section>
  );
}

function ExamplePhotoCard({ item, kind, fullWidth }) {
  const colour = kind === "good" ? LIME : RED;
  return (
    <figure style={{ margin: 0 }}>
      <div style={{
        position: "relative",
        width: "100%",
        aspectRatio: "1 / 1",
        borderRadius: 10,
        overflow: "hidden",
        background: item.bg || "#e5e7eb",
        boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pravatar(item.id)}
          alt=""
          width={400}
          height={400}
          loading="lazy"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            filter: item.filter,
            transform: item.transform,
            transformOrigin: "center",
          }}
        />
        {/* Sunglasses overlay — a single dark bar across the eyes */}
        {item.overlay === "sunglasses" && (
          <div style={{
            position: "absolute",
            left: "18%", right: "18%",
            top: "38%", height: "14%",
            borderRadius: 6,
            background: "linear-gradient(180deg, #111 0%, #2a2a2a 50%, #111 100%)",
            boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
          }} />
        )}
        {/* Duplicate-face overlay — render a smaller copy of the face
            next to the primary one to convey "multiple faces". */}
        {item.overlay === "duplicate" && (
          <div style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pravatar(item.id)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pravatar(item.id + 1)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        )}
      </div>
      <figcaption style={{
        marginTop: 6,
        fontSize: fullWidth ? 12 : 12.5,
        fontWeight: 800,
        color: colour,
        lineHeight: 1.25,
      }}>
        {item.label}
      </figcaption>
      {item.sub && (
        <div style={{
          fontSize: 10.5,
          color: MUTED,
          marginTop: 1,
          lineHeight: 1.3,
        }}>
          {item.sub}
        </div>
      )}
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
        JPG, PNG, or WebP — we&rsquo;ll check it against the rules above
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
  const tint = v === "pass" ? LIME : v === "warn" ? "#f59e0b" : RED;
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
