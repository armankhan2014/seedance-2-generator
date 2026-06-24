import { Suspense } from "react";
import { Inter } from "next/font/google";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import "./globals.css";
// 2026-06-05 — Removed the EcosystemNav (the "VISUALSEFFECT" /
// ✦credits / ⊞ apps / avatar dropdown strip that sat above the
// SeedanceStudio Navbar). Stacking the two navbars made auth state
// render twice ("dual login"). Original <Navbar /> is now the sole
// top bar. The eco-nav module + its CSS tokens + AppsPanelProvider
// + SeedanceEcosystemNav wrapper still live in src/components/eco-
// nav/ — kept on disk in case we want a unified bar back as a
// single replacement (not stacked) later.
import { Providers } from "@/components/Providers";
import Navbar from "@/components/saas/Navbar";
import SignInModal from "@/components/saas/SignInModal";
import MobileBottomNav from "@/components/saas/MobileBottomNav";
import SocialProofPopup from "@/components/saas/SocialProofPopup";
// Tawk.to disabled 2026-05-22 — Arman no longer wants the live chat widget
// on seedance.visualseffect.com. Component file at src/components/TawkTo.jsx
// kept for now in case it's re-enabled later; remove that file too if you
// want it gone permanently.
// import TawkTo from "@/components/TawkTo";
import VisitorTracker from "@/components/VisitorTracker";
import PWARegister from "@/components/PWARegister";
import CapacitorBridge from "@/components/CapacitorBridge";
import AndroidAppBanner from "@/components/AndroidAppBanner";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  metadataBase: new URL("https://seedance.visualseffect.com"),
  title: { default: "Seedance Studio — AI Video Generator", template: "%s | Seedance Studio" },
  description: "Generate stunning AI videos in seconds with Seedance 2.0. Text-to-video, image-to-video, and audio sync powered by cutting-edge AI.",
  keywords: ["AI video generator","text to video","image to video","Seedance","Seedance 2.0","AI video","video generation"],
  openGraph: {
    type: "website", siteName: "Seedance Studio",
    title: "Seedance Studio — AI Video Generator",
    description: "Generate stunning AI videos in seconds with Seedance 2.0. Text-to-video, image-to-video, and audio sync.",
    url: "https://seedance.visualseffect.com",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Seedance Studio — AI Video Generator" }],
  },
  twitter: { card: "summary_large_image", title: "Seedance Studio — AI Video Generator", description: "Generate stunning AI videos in seconds with Seedance 2.0.", images: ["/og-image.png"] },
  robots: { index: true, follow: true },
  // ── PWA / "Add to Home Screen" ────────────────────────────────────
  // Tells iOS Safari that the site is a stand-alone web app. When the
  // user adds it to their home screen iOS hides its own browser chrome
  // and the site looks native. Android / Chrome / Edge read manifest.json
  // (src/app/manifest.js) for the same purpose.
  appleWebApp: {
    capable: true,
    title: "Seedance",
    statusBarStyle: "black-translucent",
  },
  applicationName: "Seedance",
  formatDetection: { telephone: false },
};

// viewport export drives <meta name="theme-color"> + the viewport meta
// tag itself. Theme color is what colours the iOS status bar + Android
// system bar when the PWA is open, so it must match the page background.
export const viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  // Prevents iOS Safari's pinch-zoom on form inputs which can break
  // the PWA chrome — still allows manual zoom for accessibility.
  viewportFit: "cover",
};

export default async function RootLayout({ children }) {
  // Prefetch the session server-side so SessionProvider (and every
  // useSession() consumer below it) renders with the right answer on
  // the very first paint. Without this, post-login pages briefly
  // flash the "Sign in" button while the client refetches.
  // Wrapped in try/catch so a transient DB blip doesn't 500 the whole
  // tree — useSession will still hydrate from /api/auth/session as a
  // fallback in that case.
  let session = null;
  try {
    session = await getServerSession(authOptions);
  } catch {
    // ignore — fall through to client-side hydration
  }

  return (
    <html lang="en" className="h-dvh w-full" style={{ colorScheme: "dark" }}>
      <head>
        {/* Warm cross-subdomain TLS so Edits/Music/Community nav from
            the Studio doesn't pay the handshake on every click. Saves
            ~150–300 ms per cross-origin link tap on mobile. */}
        <link rel="preconnect" href="https://edits.visualseffect.com" crossOrigin="use-credentials" />
        <link rel="preconnect" href="https://music.visualseffect.com" crossOrigin="use-credentials" />
        <link rel="preconnect" href="https://community.visualseffect.com" crossOrigin="use-credentials" />
        <link rel="dns-prefetch" href="https://edits.visualseffect.com" />
        <link rel="dns-prefetch" href="https://music.visualseffect.com" />
        <link rel="dns-prefetch" href="https://community.visualseffect.com" />
      </head>
      <body className={inter.className} style={{ background: "#0a0a0a", color: "#FFFFFF" }}>
        <Providers session={session}>
          {/* Single top navbar — the long-standing SeedanceStudio
              bar with Generate / Gallery / Pricing / Edits / Music
              / Community + Contact Us + Sign In + avatar. The
              short-lived stacked EcosystemNav strip was removed on
              2026-06-05 because it duplicated the auth state. */}
          <Suspense fallback={null}>
            <Navbar />
          </Suspense>
          {children}
          {/* Mobile bottom nav — mirrors community's bar so users keep
              their bearings across the subdomain. Pure server component,
              zero runtime JS. Auto-hides above 720px. */}
          <MobileBottomNav />
          {/* Global sign-in modal — triggered via window.dispatchEvent(new CustomEvent("openSignIn")) */}
          <SignInModal />
          {/* Tawk.to live chat — disabled 2026-05-22, see import block above */}
          <VisitorTracker />
          {/* Service-worker registration for the PWA. No-op in dev. */}
          <PWARegister />
          {/* Capacitor bridge — back-button, push registration, app
              state events. No-op in regular browsers. */}
          <CapacitorBridge />
          {/* Social-proof popup — bottom-left toast cycling through
              recent signups (real first, dummies as filler).
              Self-throttles, self-dedupes via localStorage + IP. */}
          <SocialProofPopup />
          {/* Android-only slide-up offering the APK install while the
              Play Store closed test runs its 14-day clock. Hidden in
              Capacitor and once dismissed via localStorage. */}
          <AndroidAppBanner />
        </Providers>
      </body>
    </html>
  );
}
