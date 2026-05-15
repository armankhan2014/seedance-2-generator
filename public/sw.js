// Seedance Service Worker — minimal offline-shell cache.
//
// Goals:
//   1. Make the app launch instantly from the home screen even with a
//      flaky connection (cached HTML for /, /generate, /pricing, etc.)
//   2. Re-use cached static assets (icons, fonts, CSS) on subsequent
//      visits so the app feels snappier than the website.
//
// Non-goals (on purpose):
//   • Caching API responses — auth, credits, generation results all
//     must hit the network fresh. Stale credit balance / generation
//     state would be confusing.
//   • Caching POSTs / mutations.
//   • Background sync. Save for a later phase if it matters.
//
// Strategy: NETWORK-FIRST for HTML so users always get the latest UI,
// CACHE-FIRST for static assets (immutable hash-named bundles).

const CACHE = "seedance-shell-v1";

// Pages we want to be available offline.
const SHELL = [
  "/",
  "/generate",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // addAll is all-or-nothing — wrap in catch so an offline first
      // install doesn't permanently break the SW.
      .then((c) => c.addAll(SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  // Drop old caches when we bump the CACHE version above.
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Same-origin only — don't try to cache R2 / Stripe / MuAPI / Tawk etc.
  if (url.origin !== self.location.origin) return;

  // Never cache auth or API responses — they're per-user / per-request.
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/data")) return;

  // Next.js immutable static bundles: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone).catch(() => {}));
          }
          return res;
        });
      })
    );
    return;
  }

  // HTML / navigations + everything else same-origin: network-first.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone).catch(() => {}));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/generate")))
  );
});

// ─────────────────────────────────────────────────────────────────────
// Push notifications — Phase B
// ─────────────────────────────────────────────────────────────────────
//
// Server payload (from lib/push.js) is JSON with:
//   { kind, title, body, url, tag }
// kind ∈ "video_ready" | "video_failed" | "featured"
// url  = path to navigate to on tap (always same-origin)
// tag  = de-dupes notifications for the same target (e.g. one "ready"
//        per creationId)

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Seedance", body: event.data.text() };
  }
  const title = payload.title || "Seedance";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag,
    data: { url: payload.url || "/", kind: payload.kind || "default" },
    // Surface on iOS Safari (16.4+) without ringing — Mac / Android
    // honour these defaults. silent:false ensures the system sound
    // plays so the user actually notices the alt-tabbed render.
    requireInteraction: false,
    silent: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Click on the notification — focus an open tab if we have one,
// otherwise open a fresh one to the right URL.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Try to focus an existing tab already on the target URL.
      for (const client of allClients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.pathname === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise focus any open tab and navigate it, or open new.
      if (allClients.length && "navigate" in allClients[0]) {
        allClients[0].focus();
        return allClients[0].navigate(targetUrl);
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })()
  );
});

// Subscription expired or rotated — fire a re-subscribe request on
// next page load by clearing our cached endpoint. The page-side push
// helper (lib/clientPush.js) checks for an active subscription on
// boot and re-creates one when missing.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        // Tell every open tab so the client-side helper can re-up.
        const allClients = await self.clients.matchAll({ includeUncontrolled: true });
        for (const c of allClients) c.postMessage({ type: "pushsubscriptionchange" });
      } catch {
        /* no-op */
      }
    })()
  );
});
