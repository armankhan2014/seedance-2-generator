"use client";
//
// CapacitorBridge — single mount point for everything the web side
// needs to do when running INSIDE the native iOS/Android app:
//
//   1. Android hardware back button → navigate via history.back()
//      instead of exiting the app on first press. Only exits when
//      there's nothing left in the WebView history.
//
//   2. Device push-token registration on launch → posts the FCM /
//      APNS token to /api/devices/register so the server can send
//      "your video is ready" pushes later.
//
//   3. App state events (resume / pause) — future hook for syncing
//      generation status when the user comes back to the app.
//
// In a regular browser this entire component is a no-op because
// window.Capacitor is undefined. No bundle bloat — every method
// gated behind optional chaining.

import { useEffect } from "react";

export default function CapacitorBridge() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const Capacitor = window.Capacitor;
    if (!Capacitor?.isNativePlatform?.()) return;

    const App = Capacitor.Plugins?.App;
    const Push = Capacitor.Plugins?.PushNotifications;

    const subs = [];

    // Capacitor 7's plugin addListener returns the handle either as a Promise
    // OR synchronously depending on plugin version — wrap with Promise.resolve
    // so .then() works for both. A buggy direct .then() crashes React render.
    const trackHandle = (result) => {
      Promise.resolve(result).then((h) => h && subs.push(h)).catch(() => {});
    };

    // ── 1. Android back-button handler ────────────────────────────
    if (App?.addListener) {
      try {
        trackHandle(App.addListener("backButton", ({ canGoBack }) => {
          if (canGoBack || window.history.length > 1) {
            window.history.back();
          } else {
            // We're at the root with nothing to go back to — exit.
            App.exitApp?.();
          }
        }));
      } catch (e) {
        console.warn("[CapacitorBridge] backButton listener failed:", e?.message);
      }
    }

    // ── 2. Push-token registration ────────────────────────────────
    // Defer the prompt until the user has signed in — asking for
    // notifications on first launch is the most-rejected iOS UX
    // pattern. We just register the listeners here; the prompt
    // itself is triggered manually after the first successful
    // generation (where notification value is obvious).
    if (Push?.addListener) {
      try {
        trackHandle(Push.addListener("registration", async (token) => {
          try {
            await fetch("/api/devices/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                token: token.value,
                platform: Capacitor.getPlatform?.() || "unknown",
                appVersion: "1.0",
              }),
            });
          } catch (e) {
            console.warn("[CapacitorBridge] push token register failed:", e?.message);
          }
        }));

        trackHandle(Push.addListener("registrationError", (err) => {
          console.warn("[CapacitorBridge] push registration error:", err?.error);
        }));
      } catch (e) {
        console.warn("[CapacitorBridge] push listeners failed:", e?.message);
      }
    }

    return () => {
      subs.forEach((s) => s?.remove?.());
    };
  }, []);

  return null;
}
