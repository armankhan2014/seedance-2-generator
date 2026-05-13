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
