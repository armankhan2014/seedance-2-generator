// Demo route for the cinematic interactive hero.
// Lives at /demo/cinematic-hero — preview-only, not linked from
// anywhere on the production site. Once Arman signs off, the
// CinematicHero component gets dropped into HomepageV2 and this
// directory + route is deleted.

import CinematicHero from "@/components/saas/CinematicHero";

export const metadata = {
  title: "Cinematic Hero · Demo",
  robots: { index: false, follow: false },
};

export default function CinematicHeroDemoPage() {
  return (
    <main>
      <CinematicHero />

      {/* Tiny footer strip so you can tell this is a demo page */}
      <div
        style={{
          padding: "20px 24px",
          textAlign: "center",
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#666",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "#000",
        }}
      >
        ⓘ Demo preview — production homepage unchanged.
      </div>
    </main>
  );
}
