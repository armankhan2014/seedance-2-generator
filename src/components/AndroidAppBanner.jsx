"use client";

// Slide-up banner that shows ONLY on Android web visitors, offering a
// direct APK install while the Play Store closed test runs its 14-day
// clock. Dismissed via localStorage so it doesn't pester repeat
// visitors. Hidden inside Capacitor (the app itself) since they're
// already in the app.
//
// Why client component: needs navigator.userAgent + localStorage,
// neither of which exist at SSR.

import { useEffect, useState } from "react";

const STORAGE_KEY = "seedance:android-banner-dismissed";
const APK_URL = "https://seedance.visualseffect.com/seedance.apk";

export default function AndroidAppBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Skip if not Android, inside the native app (Capacitor), or
    // already dismissed this session.
    try {
      const ua = navigator.userAgent || "";
      const isAndroid = /Android/i.test(ua);
      const isCapacitor = /Capacitor|VisualsEffectSeedanceApp/i.test(ua);
      const dismissed = localStorage.getItem(STORAGE_KEY) === "1";
      if (isAndroid && !isCapacitor && !dismissed) {
        // Small delay so it slides in after first paint instead of
        // racing it.
        const t = setTimeout(() => setVisible(true), 800);
        return () => clearTimeout(t);
      }
    } catch {
      // localStorage / navigator can throw in some embeds — just stay hidden.
    }
  }, []);

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Install Seedance for Android"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 9999,
        background: "#0a0a0a",
        border: "1px solid #1f2937",
        borderRadius: 18,
        padding: "16px 16px 16px 18px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        boxShadow: "0 18px 40px rgba(0,0,0,0.55)",
        animation: "seedanceBannerIn 320ms cubic-bezier(.2,.8,.2,1) both",
      }}
    >
      <style>{`
        @keyframes seedanceBannerIn {
          from { transform: translateY(140%); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      {/* Lime "S" tile — same look as the Play Store icon */}
      <div
        aria-hidden
        style={{
          width: 48,
          height: 48,
          minWidth: 48,
          borderRadius: 12,
          background: "#000",
          border: "1.5px solid #d4ff00",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#d4ff00",
          fontWeight: 900,
          fontSize: 28,
          lineHeight: 1,
        }}
      >
        S
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: "#fff",
          fontWeight: 700,
          fontSize: "0.95rem",
          letterSpacing: "-0.01em",
          marginBottom: 2,
        }}>
          Get the Seedance app
        </div>
        <div style={{
          color: "#94a3b8",
          fontSize: "0.78rem",
          lineHeight: 1.35,
        }}>
          Faster, easier video generation on your phone. 100 free credits.
        </div>
      </div>

      <a
        href={APK_URL}
        download
        onClick={dismiss}
        style={{
          background: "#d4ff00",
          color: "#000",
          fontWeight: 800,
          fontSize: "0.85rem",
          padding: "10px 14px",
          borderRadius: 10,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        Install
      </a>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          background: "transparent",
          border: "none",
          color: "#64748b",
          fontSize: 22,
          lineHeight: 1,
          padding: 4,
          marginLeft: -4,
          cursor: "pointer",
        }}
      >
        ×
      </button>
    </div>
  );
}
