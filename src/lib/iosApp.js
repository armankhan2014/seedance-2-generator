// Native-app detection ----------------------------------------------------
//
// Both native wrappers (Capacitor shell in /Users/armankhan/seedance-app)
// append a token to their WebView User-Agent — set in
// seedance-app/capacitor.config.json:
//   • iOS     → "SeedanceiOSApp"      (ios.appendUserAgent)
//   • Android → "SeedanceAndroidApp"  (android.appendUserAgent)
// We use these tokens to recognise when our hosted site is being viewed
// inside either app-store build.
//
// Why this matters: BOTH Apple (Guideline 3.1.1) and Google Play require
// that digital content/credits usable inside the app be sold via their own
// in-app purchase. We sell credits via Stripe on the web, so inside the
// native apps we hide ALL pricing / buy / checkout surfaces AND show the
// "VisualsEffect" brand (not "Seedance", ByteDance's model name — Apple 4.1
// copycat). Users sign in and spend credits bought on the website. This file
// is the single source of truth for that detection.
//
// Name kept as uaIsIOSApp for historical reasons — it now means "any native
// app". Pure string check — safe to import from both server and client code
// (no next/headers, no window access here).
export function uaIsIOSApp(ua) {
  return !!ua && /Seedance(iOS|Android)App/i.test(ua);
}
