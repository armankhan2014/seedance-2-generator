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

        // appUrlOpen — fires when the OS routes a deep link to this app
        // (magic-link emails, App Links from share sheets, custom-scheme
        // marketing URLs, etc.). Capacitor delivers the URL but does NOT
        // navigate the WebView automatically; without this we'd silently
        // ignore the link and the user would stay on whatever page the
        // WebView happened to be on. Critical for magic-link auth to set
        // the session cookie in the WebView's cookie jar.
        trackHandle(App.addListener("appUrlOpen", ({ url }) => {
          if (typeof url !== "string") return;
          let target;
          try {
            const parsed = new URL(url);
            // Same-origin URL on the live host → navigate via path so
            // we don't trigger a fresh page load if the route is local.
            if (parsed.host === window.location.host) {
              target = parsed.pathname + parsed.search + parsed.hash;
            } else if (parsed.protocol === "seedance:") {
              // Custom scheme marketing link — map to a real path.
              target = "/" + url.replace(/^seedance:\/?\/?/, "");
            } else {
              return;
            }
          } catch {
            return;
          }
          // Use location.href so server-side cookies (NextAuth callbacks)
          // are picked up on the navigation. SPA router would skip the
          // callback handler entirely.
          window.location.href = target;
        }));
      } catch (e) {
        console.warn("[CapacitorBridge] App listeners failed:", e?.message);
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
