// iOS app detection ------------------------------------------------------
//
// The native iOS wrapper (Capacitor shell in /Users/armankhan/seedance-app)
// appends the token "SeedanceiOSApp" to its WebView User-Agent — set in
// seedance-app/capacitor.config.json under `ios.appendUserAgent`. We use
// that token to recognise when our hosted site is being viewed inside the
// iOS App Store build.
//
// Why this matters: Apple's App Review Guideline 3.1.1 requires that any
// digital content/credits usable inside the app be sold via Apple's own
// in-app purchase. We sell credits via Stripe on the web, so inside the
// iOS app we hide ALL pricing / buy / checkout surfaces. Users sign in and
// spend credits bought on the website; the app shows no prices or buy
// buttons. This file is the single source of truth for that detection.
//
// Pure string check — safe to import from both server and client code
// (no next/headers, no window access here).
export function uaIsIOSApp(ua) {
  return !!ua && /SeedanceiOSApp/i.test(ua);
}
