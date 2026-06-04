"use client";

/**
 * /demo/reference-guide — Phase 2 demo of the Reference Image
 * Guidelines system. Hosts the ReferenceImageGuide preview that
 * uses the SEEDANCE REF poster as the visual teaching surface.
 *
 * All chrome on this page is light-themed to match the cream
 * surface — dark-theme leftover colours have been swapped for
 * readable slate inks on white cards.
 */

import { useState } from "react";
import ReferenceImageGuide from "@/components/saas/ReferenceImageGuide";

// Light-theme palette — matches what's used inside the component
// so the demo wrapper reads as a single coherent design.
const INK     = "#1f2937"; // slate-800 — headings + body
const SUB     = "#374151"; // slate-700 — paragraph + list text
const MUTED   = "#6b7280"; // slate-500 — labels + tertiary text
const GREEN   = "#15803d"; // darker green for accent on cream
const HAIR    = "rgba(0,0,0,0.10)"; // panel border
const CARD    = "#ffffff"; // panel surface
const CODE_BG = "#f3f4f6"; // gray-100 — code chip background
const CODE_FG = "#111827"; // gray-900 — code chip text

const codePill = {
  background: CODE_BG,
  color: CODE_FG,
  padding: "1px 6px",
  borderRadius: 4,
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
  fontSize: "0.92em",
};

export default function ReferenceGuideDemoPage() {
  const [accepted, setAccepted] = useState(null);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#e5e1d8",
        color: INK,
        padding: "40px 24px 80px",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {/* Demo banner — readable medium-grey on cream */}
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: MUTED,
            marginBottom: 8,
          }}
        >
          /demo/reference-guide · staging preview · Phase 2
        </div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: "-0.01em",
            margin: "0 0 22px",
            color: INK,
          }}
        >
          Reference Photo Guide preview
        </h1>

        <ReferenceImageGuide
          onAccept={(file) => {
            setAccepted({
              name: file.name,
              size: file.size,
              type: file.type,
            });
          }}
        />

        {/* "onAccept fired" panel — light theme */}
        {accepted && (
          <div
            style={{
              marginTop: 18,
              padding: "12px 14px",
              borderRadius: 10,
              border: `1px solid ${GREEN}44`,
              background: "rgba(21,128,61,0.06)",
              fontSize: 13,
              color: SUB,
            }}
          >
            <strong style={{ color: GREEN }}>onAccept fired:</strong>{" "}
            <code style={{ ...codePill }}>{accepted.name}</code>{" "}
            <span style={{ color: MUTED }}>
              ({(accepted.size / 1024).toFixed(0)} KB · {accepted.type})
            </span>
            <div style={{ marginTop: 6, fontSize: 11, color: MUTED }}>
              In the real flow this is where we&rsquo;d upload to{" "}
              <code style={codePill}>/api/upload</code>{" "}
              and attach to the generation request.
            </div>
          </div>
        )}

        {/* "How to test" panel — light theme, readable contrast */}
        <div
          style={{
            marginTop: 32,
            padding: "16px 18px",
            border: `1px solid ${HAIR}`,
            borderRadius: 10,
            background: CARD,
            fontSize: 12.5,
            lineHeight: 1.55,
            color: SUB,
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          <strong style={{ color: GREEN, fontSize: 13 }}>How to test:</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li>
              <strong style={{ color: INK }}>Good photo (passport-style):</strong>{" "}
              should land on a green &ldquo;PASS&rdquo; verdict + a primary
              &ldquo;Use this photo&rdquo; button
            </li>
            <li>
              <strong style={{ color: INK }}>Sunglasses / side angle / hand on face:</strong>{" "}
              amber &ldquo;WARN&rdquo; verdict with specific issues + a
              &ldquo;Use anyway&rdquo; override
            </li>
            <li>
              <strong style={{ color: INK }}>Group photo (multiple people):</strong>{" "}
              red &ldquo;BLOCKED&rdquo; verdict with no override option
            </li>
            <li>
              <strong style={{ color: INK }}>Landscape / no face at all:</strong>{" "}
              red &ldquo;BLOCKED&rdquo; with &ldquo;No face detected&rdquo; reason
            </li>
            <li>
              <strong style={{ color: INK }}>Tiny face (selfie taken from far away):</strong>{" "}
              red &ldquo;BLOCKED&rdquo; with &ldquo;Face is too small&rdquo;
            </li>
            <li>
              The first run will download ~600&nbsp;KB of TensorFlow + BlazeFace
              from the same origin. Subsequent uploads in the same session are
              instant.
            </li>
          </ul>
          <div style={{ marginTop: 10, color: SUB }}>
            Once approved: port{" "}
            <code style={codePill}>ReferenceImageGuide</code>{" "}
            into the actual image upload in{" "}
            <code style={codePill}>src/app/GenerateClient.jsx</code>{" "}
            and delete this route.
          </div>
        </div>
      </div>
    </main>
  );
}
