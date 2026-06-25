// Apple App Site Association (AASA) ---------------------------------------
//
// Served at https://seedance.visualseffect.com/.well-known/apple-app-site-association
//
// This is what makes Universal Links work for the iOS app
// (com.visualseffect.seedance, Team CBJ6P6N83Y). When iOS sees a tapped
// https://seedance.visualseffect.com/... link and the app is installed, it
// routes the link INTO the app instead of Safari. The app's CapacitorBridge
// `appUrlOpen` handler then navigates the in-app WebView to that path — which
// is how magic-link sign-in lands the NextAuth session cookie in the app's
// own cookie jar (Google/Safari OAuth can't, due to iOS cookie isolation).
//
// `components: [{ "/": "*" }]` = every path opens the app (this app IS the
// website, so that's the intended wrapper behaviour). Must be served over
// HTTPS, as JSON, with NO redirect — Apple's CDN fetches it directly.
//
// appID format is <TeamID>.<BundleID>.

const AASA = {
  applinks: {
    details: [
      {
        appIDs: ["CBJ6P6N83Y.com.visualseffect.seedance"],
        components: [{ "/": "*" }],
      },
    ],
  },
};

export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(AASA), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
    },
  });
}
