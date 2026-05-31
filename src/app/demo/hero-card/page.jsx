"use client";

/**
 * /demo/hero-card — staging demo for the new Seedance hero card.
 *
 * Mirrors the playing-video hero card from visualseffect.com/studio/video
 * (the `ModelHero` component in HiggsfieldVideoStudio.tsx). When Arman
 * approves the look, port this card into GenerateClient.jsx by replacing
 * the existing "Seedance Generator / Minimal Video Engine" plain-text
 * header block (around line 1157-1167) and delete this demo route.
 *
 * Source video is hotlinked from the main domain so this demo doesn't
 * bundle the 1.5MB MP4 into the seedance subdomain's deploy.
 */

import SeedanceHeroCard from "../../../components/saas/SeedanceHeroCard";

export default function HeroCardDemoPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#f5f5f5",
        padding: "40px 24px 80px",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#888",
            marginBottom: 8,
          }}
        >
          /demo/hero-card · staging preview
        </div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: "-0.01em",
            margin: "0 0 22px",
          }}
        >
          Seedance hero card preview
        </h1>

        {/* THE CARD ITSELF — exact size + treatment users will see
            on /generate after porting. Width matches the typical
            controls column on the generate page. */}
        <SeedanceHeroCard
          providerLabel="SEEDANCE"
          modelName="Seedance 2 Pro"
          subline="Minimal Video Engine"
          videoUrl="https://visualseffect.com/hero-videos/seedance.mp4"
          onChange={() => alert("Change-model handler fires here.")}
        />

        {/* ── Notes for the reviewer ───────────────────────────── */}
        <div
          style={{
            marginTop: 28,
            padding: "14px 16px",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
            background: "rgba(255,255,255,0.02)",
            fontSize: 13,
            lineHeight: 1.6,
            color: "#bbb",
          }}
        >
          <strong style={{ color: "#d9ff00" }}>How to review:</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li>The card looks identical to the one on visualseffect.com/studio/video?model=piapi%2Fseedance-2</li>
            <li>Background video autoplays, loops smoothly, no audio</li>
            <li>SEEDANCE label is brand lime ({"#d9ff00"}), readable over the video</li>
            <li>“✎ Change” pill in the top-right reads clearly</li>
            <li>Click anywhere on the change pill — alert confirms the handler is wired</li>
          </ul>
          <div style={{ marginTop: 10 }}>
            Once approved: port <code style={{ background: "#1a1a1a", padding: "1px 5px", borderRadius: 4 }}>SeedanceHeroCard</code> into
            {" "}<code style={{ background: "#1a1a1a", padding: "1px 5px", borderRadius: 4 }}>src/app/GenerateClient.jsx</code> replacing the
            “Seedance Generator / Minimal Video Engine” plain-text header (lines ~1157-1167) and delete this demo route.
          </div>
        </div>

        {/* ── A second, wider variant — for context if the live
              /generate layout ever goes full-width ───────────── */}
        <div style={{ marginTop: 40 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#888",
              marginBottom: 8,
            }}
          >
            Wider variant (preview)
          </div>
          <div style={{ maxWidth: 920 }}>
            <SeedanceHeroCard
              providerLabel="SEEDANCE"
              modelName="Seedance 2 Pro"
              subline="Minimal Video Engine"
              videoUrl="https://visualseffect.com/hero-videos/seedance.mp4"
              onChange={() => alert("Change-model handler fires here.")}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
