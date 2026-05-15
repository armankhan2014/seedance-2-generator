"use client";
//
// Capacitor push notification registration. Runs only inside the
// native app (the hosted Next.js bundle is the same code as the web
// site — `isNativePlatform()` short-circuits this to a no-op on plain
// browsers, where the web-push branch handles things instead).
//
// Flow on app launch:
//   1. PushNotifications.checkPermissions() — read current state.
//   2. If "prompt"-eligible, call .requestPermissions() — this is the
//      iOS / Android system dialog the user has to accept once.
//   3. .register() — kicks off FCM (Android) or APNS (iOS) token
//      registration. The token arrives async via the "registration"
//      listener.
//   4. POST the token to /api/devices/register (already exists in the
//      Studio API surface) so the server can fan out via FCM.
//
// Tap handling:
//   When the user taps a notification, the OS launches / focuses the
//   app and Capacitor fires "pushNotificationActionPerformed". The
//   payload's `data.url` is the path we attached server-side
//   (e.g. /v/<creationId>); we navigate to it.
//
// Why we use the runtime bridge (window.Capacitor.Plugins) rather than
// `import { PushNotifications } from "@capacitor/push-notifications"`:
// the Studio repo isn't a Capacitor project itself — the app shell
// lives separately at /Users/armankhan/seedance-app. When the WebView
// loads our hosted Next.js bundle, Capacitor injects `window.Capacitor`
// with the plugins from the shell's package.json. Talking to that
// runtime keeps us decoupled from the shell's dependency list.

import { isNativeApp } from "./nativeShare";

let registered = false; // Module-level guard — register once per app session.

function getPlugin() {
  if (typeof window === "undefined") return null;
  return window.Capacitor?.Plugins?.PushNotifications || null;
}

// Hand the FCM/APNS token to the server. /api/devices/register exists
// and upserts on token (idempotent).
async function postDevice({ token, platform }) {
  try {
    await fetch("/api/devices/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, platform, appVersion: "1.0.0" }),
    });
  } catch (err) {
    console.warn("[nativePush] device register POST failed:", err?.message);
  }
}

// Idempotent — safe to call from multiple mount points; the registered
// guard ensures we only attach listeners once.
export async function setupNativePush() {
  if (registered) return;
  if (!isNativeApp()) return;
  const Push = getPlugin();
  if (!Push) {
    console.warn("[nativePush] @capacitor/push-notifications not available");
    return;
  }
  registered = true;

  try {
    let perm = await Push.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await Push.requestPermissions();
    }
    if (perm.receive !== "granted") {
      // User denied — bail. In-app fallback banner (the web-push one
      // reused on the Studio shell) will still surface "video ready"
      // when they re-open the app.
      return;
    }

    // Detect platform for the device-register payload. Capacitor's
    // global exposes the platform string.
    const platform = window.Capacitor?.getPlatform?.() || "unknown";

    Push.addListener("registration", async (token) => {
      // Token shape: { value: "<fcm-or-apns-token>" }
      const value = token?.value;
      if (!value) return;
      await postDevice({ token: value, platform });
    });

    Push.addListener("registrationError", (err) => {
      console.warn("[nativePush] registrationError:", err?.error || err);
    });

    Push.addListener("pushNotificationReceived", () => {
      // Foreground delivery. iOS / Android won't draw a banner when
      // the app is focused — we let the page's in-app toast surface
      // handle that. For now we just acknowledge.
    });

    Push.addListener("pushNotificationActionPerformed", (action) => {
      // User tapped the OS notification. The payload's `data.url` was
      // set server-side in lib/push.js for every push kind.
      const url = action?.notification?.data?.url;
      if (typeof url === "string" && url.startsWith("/")) {
        try {
          location.assign(url);
        } catch {
          /* no-op — webview may be mid-tear-down */
        }
      }
    });

    await Push.register();
  } catch (err) {
    console.warn("[nativePush] setup failed:", err?.message);
  }
}
