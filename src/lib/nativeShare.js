"use client";
//
// nativeShare — share/download helper that uses the right surface
// depending on where the site is running.
//
//   Inside the native app (iOS / Android via Capacitor):
//     → calls window.Capacitor.Plugins.Share which opens the OS
//       share sheet (Instagram, WhatsApp, Mail, Save to Photos, etc.)
//
//   Inside a regular browser:
//     → tries navigator.share() (modern mobile browsers — basically
//       the same OS share sheet that the native app gets)
//     → falls back to copying the URL to clipboard if not available
//
// This is the single function every "Share" / "Save" button on the
// site should call. No need for separate code paths per platform.
//
// Usage:
//   import { nativeShare, isNativeApp } from "@/lib/nativeShare";
//   await nativeShare({
//     title: "My Seedance video",
//     url: "https://seedance.visualseffect.com/v/abc123",
//   });

export function isNativeApp() {
  if (typeof window === "undefined") return false;
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

/**
 * Share something via the native share sheet (or browser fallback).
 *
 * @param {Object} opts
 * @param {string} [opts.title]   Title that appears at the top of the share sheet.
 * @param {string} [opts.text]    Free text. Goes into the message body for
 *                                Mail / SMS / WhatsApp targets.
 * @param {string} [opts.url]     URL to share. Most apps unwrap this into a
 *                                preview card.
 * @param {string} [opts.dialogTitle]  Title of the share-sheet dialog itself
 *                                     (Android only — iOS ignores).
 * @returns {Promise<{ok: boolean, via: string}>}
 */
export async function nativeShare(opts = {}) {
  const { title, text, url, dialogTitle = "Share" } = opts;
  if (typeof window === "undefined") {
    return { ok: false, via: "ssr" };
  }

  // 1) Native app path — Capacitor Share plugin.
  const Share = window.Capacitor?.Plugins?.Share;
  if (isNativeApp() && Share?.share) {
    try {
      await Share.share({ title, text, url, dialogTitle });
      return { ok: true, via: "capacitor" };
    } catch (err) {
      // User dismissed sheet or plugin missing — fall through.
      console.warn("[nativeShare] Capacitor Share failed:", err?.message);
    }
  }

  // 2) Web Share API — works on iOS Safari, Android Chrome, Edge etc.
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return { ok: true, via: "web-share" };
    } catch (err) {
      // AbortError = user cancelled. Anything else = unsupported / error.
      if (err?.name !== "AbortError") {
        console.warn("[nativeShare] Web Share failed:", err?.message);
      }
      // Fall through to clipboard only if it was a real failure.
      if (err?.name === "AbortError") return { ok: false, via: "cancelled" };
    }
  }

  // 3) Clipboard fallback — desktop browsers without Web Share.
  const toCopy = url || text || "";
  if (toCopy && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(toCopy);
      return { ok: true, via: "clipboard" };
    } catch {
      /* fall through */
    }
  }

  return { ok: false, via: "unsupported" };
}
