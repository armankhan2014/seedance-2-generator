"use client";
import { useEffect } from "react";

// Tawk.to lifts itself ~80 px above the bottom edge on mobile so it
// stops overlapping the Studio tab in MobileBottomNav (bottom-right
// in both cases). Desktop position is untouched. The selectors cover
// every state Tawk renders in (minimized bubble, status message,
// chat-card popover).

export default function TawkTo() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Avoid loading twice (e.g. hot-reload)
    if (window.Tawk_API) return;

    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();

    const s1 = document.createElement("script");
    const s0 = document.getElementsByTagName("script")[0];
    s1.async = true;
    s1.src = "https://embed.tawk.to/69f87996986f9c1c33e853ff/1jnp9lsvt";
    s1.charset = "UTF-8";
    s1.setAttribute("crossorigin", "*");
    s0.parentNode.insertBefore(s1, s0);

    // Mobile-only positioning override. We can't style inside the
    // Tawk iframe (cross-origin), but we CAN style the iframe element
    // itself + its wrapper from our document. !important is required
    // because Tawk writes positioning as inline styles on those
    // elements, which would otherwise win.
    if (document.getElementById("tawk-mobile-lift")) return;
    const styleEl = document.createElement("style");
    styleEl.id = "tawk-mobile-lift";
    styleEl.textContent = `
      @media (max-width: 720px) {
        /* Tawk's minimised chat bubble + status message + expanded
           card are each their own iframe with title containing "chat"
           or "tawk". Lift them all by the mobile bottom nav's height
           (~70 px) plus the iPhone home-bar safe area. */
        iframe[title*="chat" i],
        iframe[title*="tawk" i],
        iframe[src*="tawk.to" i] {
          bottom: calc(80px + env(safe-area-inset-bottom, 0px)) !important;
        }
        /* Some Tawk versions render a wrapper div above the iframe;
           lift that too as a belt-and-braces safety net. */
        div.tawk-min-container,
        div[class*="widget-visible" i] {
          bottom: calc(80px + env(safe-area-inset-bottom, 0px)) !important;
        }
      }
    `;
    document.head.appendChild(styleEl);
  }, []);

  return null;
}
