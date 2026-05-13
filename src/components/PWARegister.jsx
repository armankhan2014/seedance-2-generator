"use client";
//
// PWARegister — registers /sw.js on mount (production only). Local
// dev is skipped because the service worker's HTML caching conflicts
// with Next.js HMR and you end up debugging cached-stale UI for an
// hour wondering why your changes aren't showing.
//
// Mounted from src/app/layout.js so every page registers the same SW.
// The SW itself caches the shell + Next.js static bundles — see
// public/sw.js for the strategy.

import { useEffect } from "react";

export default function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    // Defer registration until after the page is interactive so it
    // doesn't compete with main-bundle parsing for CPU.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);
  return null;
}
