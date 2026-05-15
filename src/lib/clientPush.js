// Browser-side helpers for Web Push subscription.
//
// Responsibilities:
//   1. Register the service worker (idempotent — sw.js is the same file
//      already used for offline-shell caching).
//   2. Read the user's current permission state without firing the
//      browser prompt.
//   3. Request permission + subscribe + POST the subscription to
//      /api/push/subscribe — only when the page-level UI explicitly
//      asks. We never auto-prompt; the contextual banner is the
//      single entry point.
//   4. Unsubscribe path for the Settings master-switch off toggle.
//
// All functions are no-ops on browsers that don't support push
// (Safari < 16.4 on iOS, in-app browsers, etc.) — they return a
// `{ supported: false }` sentinel the caller can use to hide UI.

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// Convert the URL-safe Base64 VAPID key to a Uint8Array — required
// by the push-subscription API.
function urlBase64ToUint8(str) {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function pushPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission; // "granted" | "denied" | "default"
}

// Get the existing SW registration without forcing a new one.
async function getRegistration() {
  if (!pushSupported()) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  // SW not registered yet (or this is a fresh page load before
  // RegisterServiceWorker mounts). Register lazily.
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch (err) {
    console.warn("[push] sw.register failed:", err);
    return null;
  }
}

export async function getActiveSubscription() {
  const reg = await getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

// Single happy-path: request permission, subscribe, POST. Returns
// { ok, reason }. Reasons let the caller branch on UI fallbacks:
//   "unsupported"  — bail (hide the banner)
//   "denied"       — show "you blocked notifications" copy + deep-link to settings
//   "subscribed"   — banner becomes "✓ enabled" toast
//   "server"       — network/server error; surface as toast, allow retry
export async function enableStudioPush() {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  if (!VAPID_PUBLIC) {
    console.warn("[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY missing");
    return { ok: false, reason: "no_vapid" };
  }

  // Permission first — this is the moment that fires the OS prompt.
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    return { ok: false, reason: perm === "denied" ? "denied" : "dismissed" };
  }

  const reg = await getRegistration();
  if (!reg) return { ok: false, reason: "no_sw" };

  // Subscribe (or reuse the existing subscription).
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8(VAPID_PUBLIC),
      });
    } catch (err) {
      console.warn("[push] subscribe failed:", err);
      return { ok: false, reason: "subscribe_failed" };
    }
  }

  // Ship to the server. The API upserts on endpoint.
  try {
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    if (!res.ok) {
      return { ok: false, reason: "server" };
    }
  } catch (err) {
    console.warn("[push] POST /api/push/subscribe failed:", err);
    return { ok: false, reason: "server" };
  }

  return { ok: true, reason: "subscribed" };
}

// Cleanly unsubscribe — used by Settings → master OFF.
export async function disableStudioPush() {
  if (!pushSupported()) return { ok: true };
  const sub = await getActiveSubscription();
  if (!sub) return { ok: true };
  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch {
    /* still try to clean up server-side */
  }
  try {
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    /* best-effort */
  }
  return { ok: true };
}
