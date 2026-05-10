// Demo route for the cinematic interactive hero.
// Lives at /demo/cinematic-hero — preview-only, not linked from
// anywhere on the production site. Once Arman signs off, the
// CinematicHero component gets dropped into HomepageV2 and this
// directory + route is deleted.
//
// The "GALLERY" placeholder strip below the hero exists so you can
// see how the cinematic hero's bottom edge merges into the section
// that will sit there in production (Live Gallery). Same dark
// background the actual gallery section uses → exact same merge
// behaviour you'll get once this lands on the homepage.

import CinematicHero from "@/components/saas/CinematicHero";

export const metadata = {
  title: "Cinematic Hero · Demo",
  robots: { index: false, follow: false },
};

export default function CinematicHeroDemoPage() {
  return (
    <main style={{ background: "#000", color: "#fff" }}>
      <CinematicHero />

      {/* Placeholder for the production Live Gallery — same dark bg
          so the merge with the hero's bottom feather is what you'll
          see on the real homepage. */}
      <section
        style={{
          background: "#000",
          padding: "80px 24px 120px",
          color: "#fff",
          textAlign: "center",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.4em",
            textTransform: "uppercase",
            color: "#dcff00",
            marginBottom: 14,
          }}
        >
          ▼ Below this point on production
        </p>
        <h2
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: "-0.01em",
            color: "#fff",
          }}
        >
          Live Gallery (placeholder)
        </h2>
        <p
          style={{
            margin: "10px auto 0",
            maxWidth: 560,
            fontSize: 13.5,
            color: "#666",
            lineHeight: 1.65,
          }}
        >
          On the real homepage, this is where the existing Live Gallery section
          renders. Pictured here only so you can sanity-check that the cinematic
          hero&apos;s bottom edge feathers cleanly into the section below — no
          seam, no harsh cut.
        </p>

        {/* Some dummy tile placeholders to give the eye something below
            the hero, similar to how the real gallery feels. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
            maxWidth: 960,
            margin: "32px auto 0",
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                aspectRatio: "16 / 9",
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 10,
              }}
            />
          ))}
        </div>
      </section>

      <div
        style={{
          padding: "20px 24px",
          textAlign: "center",
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#666",
          background: "#000",
          borderTop: "1px dashed rgba(255,255,255,0.06)",
        }}
      >
        ⓘ Demo preview — production homepage unchanged.
      </div>
    </main>
  );
}
