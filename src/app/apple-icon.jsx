// Apple touch icon — 180×180 PNG served at /apple-icon. Next.js
// auto-generates <link rel="apple-touch-icon"> in the HTML head.
// iOS uses THIS image (not the regular icon) when the user taps
// "Add to Home Screen". Lightly different padding than the Android
// icon because iOS doesn't apply its own mask.

import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          fontSize: 130,
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
