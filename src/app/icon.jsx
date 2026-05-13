// Dynamic PWA app icon — served at /icon. Next.js 16's file-convention
// auto-generates the matching <link rel="icon"> tag in the HTML head.
// Using ImageResponse so we don't need to ship a binary PNG; the icon
// is generated server-side once and CDN-cached forever.
//
// Easy to rebrand later: swap the SVG path or letter. For now it's a
// bold "S" on the brand dark background with the accent green colour.

import { ImageResponse } from "next/og";

export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a0a0a",
          color: "#c8f135",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 140,
          fontWeight: 900,
          letterSpacing: "-0.05em",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        S
      </div>
    ),
    { ...size }
  );
}
