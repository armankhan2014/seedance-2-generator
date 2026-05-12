"use client";
import { useEffect } from "react";

// Tawk.to with custom mobile positioning so the chat bubble doesn't
// overlap the MobileBottomNav (Studio tab is bottom-right, Tawk
// bubble is bottom-right — same corner).
//
// Two-layer fix:
//   1. Tawk_API.customStyle.visibility — the OFFICIAL Tawk API for
//      widget positioning. Set BEFORE the script loads. Mobile uses
//      yOffset 90 (clear of the ~70 px bottom nav + iPhone home bar).
//   2. CSS overrides as a belt-and-braces fallback in case the API
//      changes or doesn't apply on first load — also catches every
//      div/iframe Tawk renders at body level.

export default function TawkTo() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.Tawk_API) return;
    // Skip Tawk in dev — its bundled JS throws benign console.errors
    // that Next.js dev mode catches and surfaces as full-screen error
    // overlays, which is disruptive while building. Tawk wouldn't reach
    // a real support agent from localhost anyway. Production unchanged.
    if (process.env.NODE_ENV !== "production") return;

    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();

    // ── Layer 1: Tawk's official customStyle API ──────────────
    // Must be set BEFORE the embed script runs. position 'br' =
    // bottom-right; xOffset / yOffset are in pixels from that corner.
    window.Tawk_API.customStyle = {
      visibility: {
        desktop: { position: "br", xOffset: 20, yOffset: 20 },
        mobile:  { position: "br", xOffset: 10, yOffset: 90 },
      },
    };

    const s1 = document.createElement("script");
    const s0 = document.getElementsByTagName("script")[0];
    s1.async = true;
    s1.src = "https://embed.tawk.to/69f87996986f9c1c33e853ff/1jnp9lsvt";
    s1.charset = "UTF-8";
    s1.setAttribute("crossorigin", "*");
    s0.parentNode.insertBefore(s1, s0);

    // ── Layer 2: CSS belt-and-braces ─────────────────────────
    // Broad selectors covering every variant Tawk renders. We can't
    // style inside the cross-origin iframe but we CAN style the
    // iframe element + any wrapper div. !important is required —
    // Tawk writes its inline styles directly on these.
    if (document.getElementById("tawk-mobile-lift")) return;
    const styleEl = document.createElement("style");
    styleEl.id = "tawk-mobile-lift";
    styleEl.textContent = `
      @media (max-width: 720px) {
        iframe[title*="chat" i],
        iframe[title*="tawk" i],
        iframe[src*="tawk" i],
        iframe[id^="tawkchat" i],
        body > div[id^="tawkchat" i],
        body > div[class*="tawk" i],
        body > div.tawk-min-container,
        body > div[class*="widget-visible" i] {
          bottom: calc(80px + env(safe-area-inset-bottom, 0px)) !important;
        }
      }
    `;
    document.head.appendChild(styleEl);
  }, []);

  return null;
}
