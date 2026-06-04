"use client";

/**
 * /demo/reference-guide — Phase 1 demo of the Reference Image
 * Guidelines system. Standalone preview of ReferenceImageGuide so
 * Arman can drop test photos in and see the verdict before we wire
 * the component into the live /generate upload flow.
 *
 * Once approved, port `ReferenceImageGuide` into the actual image
 * upload point on /generate and delete this demo route.
 */

import { useState } from "react";
import ReferenceImageGuide from "@/components/saas/ReferenceImageGuide";

export default function ReferenceGuideDemoPage() {
  const [accepted, setAccepted] = useState(null);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#e5e1d8",
        color: "#1f2937",
        padding: "40px 24px 80px",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div
          style={{
            fontSize: 10, fontWeight: 800, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "#888", marginBottom: 8,
          }}
        >
          /demo/reference-guide · staging preview · Phase 1
        </div>
        <h1
          style={{
            fontSize: 24, fontWeight: 800, letterSpacing: "-0.01em",
            margin: "0 0 22px",
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

        {accepted && (
          <div
            style={{
              marginTop: 18, padding: "12px 14px", borderRadius: 10,
              border: "1px solid rgba(212,255,64,0.30)",
              background: "rgba(212,255,64,0.05)",
              fontSize: 13, color: "#bbb",
            }}
          >
            <strong style={{ color: "#d9ff00" }}>onAccept fired:</strong>{" "}
            <code style={{ color: "#f5f5f5" }}>{accepted.name}</code>{" "}
            <span style={{ color: "#888" }}>
              ({(accepted.size / 1024).toFixed(0)} KB · {accepted.type})
            </span>
            <div style={{ marginTop: 6, fontSize: 11, color: "#888" }}>
              In the real flow this is where we&rsquo;d upload to{" "}
              <code style={{ background: "#1a1a1a", padding: "1px 5px", borderRadius: 4 }}>
                /api/upload
              </code>{" "}
              and attach to the generation request.
            </div>
          </div>
        )}

        <div
          style={{
            marginTop: 32, padding: "14px 16px",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
            background: "rgba(255,255,255,0.02)",
            fontSize: 12, lineHeight: 1.6, color: "#bbb",
          }}
        >
          <strong style={{ color: "#d9ff00" }}>How to test:</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li>
              <strong>Good photo (passport-style):</strong> should land on a
              lime &ldquo;PASS&rdquo; verdict + a primary &ldquo;Use this photo&rdquo; button
            </li>
            <li>
              <strong>Sunglasses / side angle / hand on face:</strong> amber
              &ldquo;WARN&rdquo; verdict with specific issues + a &ldquo;Use anyway&rdquo; override
            </li>
            <li>
              <strong>Group photo (multiple people):</strong> red &ldquo;BLOCKED&rdquo;
              verdict with no override option
            </li>
            <li>
              <strong>Landscape / no face at all:</strong> red &ldquo;BLOCKED&rdquo;
              with &ldquo;No face detected&rdquo; reason
            </li>
            <li>
              <strong>Tiny face (selfie taken from far away):</strong> red
              &ldquo;BLOCKED&rdquo; with &ldquo;Face is too small&rdquo;
            </li>
            <li>
              The first run will download ~600 KB of TensorFlow + BlazeFace
              from the same origin. Subsequent uploads in the same session
              are instant.
            </li>
          </ul>
          <div style={{ marginTop: 10 }}>
            Once approved: port{" "}
            <code style={{ background: "#1a1a1a", padding: "1px 5px", borderRadius: 4 }}>
              ReferenceImageGuide
            </code>{" "}
            into the actual image upload in{" "}
            <code style={{ background: "#1a1a1a", padding: "1px 5px", borderRadius: 4 }}>
              src/app/GenerateClient.jsx
            </code>{" "}
            and delete this route.
          </div>
        </div>
      </div>
    </main>
  );
}
