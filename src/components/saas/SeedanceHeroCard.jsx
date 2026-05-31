"use client";

/**
 * SeedanceHeroCard
 *
 * Playing-video hero card for the Seedance Generator. Mirrors the
 * `ModelHero` component on visualseffect.com/studio/video so the two
 * pages feel like the same family of product.
 *
 * Layout:
 *   • Rounded-corner card, fixed 130px height by default
 *   • Background <video> element: autoplays, muted, looped, plays
 *     inline on iOS (the four flags every cross-browser autoplay
 *     setup needs).
 *   • Dark gradient overlay anchored to the bottom so the text stays
 *     readable over bright frames in the source clip.
 *   • Brand-lime SEEDANCE label + muted model subtitle in the bottom
 *     left.
 *   • Optional "✎ Change" pill in the top right — only renders when
 *     an onChange handler is supplied.
 *
 * All values are inline-styled so the card drops cleanly into a
 * Tailwind page without dragging extra CSS in. Brand colour is the
 * same lime (#d9ff00) used on visualseffect.com.
 */

const BRAND_LIME = "#d9ff00";

export default function SeedanceHeroCard({
  providerLabel = "SEEDANCE",
  modelName = "Seedance 2 Pro",
  subline = null,
  videoUrl,
  onChange,
  height = 130,
  className,
  style: extraStyle,
}) {
  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height,
        borderRadius: 14,
        overflow: "hidden",
        background:
          // Lime-tinted radial fallback so the card still looks
          // intentional during the brief moment before the video
          // metadata loads.
          "linear-gradient(135deg, #0a1424 0%, #0e466c 45%, #2391c8 78%, #b8e3f0 100%)",
        ...extraStyle,
      }}
    >
      {videoUrl && (
        <video
          // `key` forces a fresh element if the URL ever changes, which
          // is the only reliable way to make Chrome re-fire autoplay.
          key={videoUrl}
          src={videoUrl}
          autoPlay
          muted
          loop
          playsInline
          // `preload="metadata"` keeps the bundle TTFB fast — we don't
          // need the full clip until the user can see the card.
          preload="metadata"
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            // Tiny saturation bump matches the look on visualseffect.com.
            filter: "saturate(1.05)",
          }}
        />
      )}

      {/* Dark gradient overlay — fades the lower 70% of the card so
          the SEEDANCE label and subtitle never wash out over a bright
          frame. Pointer-events disabled so the change pill underneath
          stays clickable. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.65) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Optional "Change" pill — only shows when handler supplied. */}
      {onChange && (
        <button
          type="button"
          onClick={onChange}
          aria-label="Change model"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "rgba(255,255,255,0.16)",
            color: "#f5f5f5",
            border: "none",
            borderRadius: 999,
            padding: "5px 10px",
            fontSize: 11.5,
            fontWeight: 700,
            cursor: "pointer",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            zIndex: 2,
          }}
        >
          <span aria-hidden="true">✎</span> Change
        </button>
      )}

      {/* SEEDANCE label — big brand lime in the bottom-left. */}
      <div
        style={{
          position: "absolute",
          left: 14,
          bottom: subline ? 36 : 22,
          color: BRAND_LIME,
          fontWeight: 800,
          fontSize: 18,
          letterSpacing: "0.05em",
          maxWidth: "calc(100% - 28px)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textShadow: "0 1px 2px rgba(0,0,0,0.4)",
          zIndex: 1,
        }}
      >
        {providerLabel}
      </div>

      {/* Model name — muted line just under the provider label. */}
      <div
        style={{
          position: "absolute",
          left: 14,
          bottom: subline ? 20 : 6,
          color: "#cfcfd2",
          fontSize: 11,
          fontWeight: 600,
          maxWidth: "calc(100% - 28px)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textShadow: "0 1px 2px rgba(0,0,0,0.55)",
          zIndex: 1,
        }}
      >
        {modelName}
      </div>

      {/* Optional sub-subtitle ("Minimal Video Engine" etc.) */}
      {subline && (
        <div
          style={{
            position: "absolute",
            left: 14,
            bottom: 6,
            color: "#9a9a9d",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.02em",
            maxWidth: "calc(100% - 28px)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textShadow: "0 1px 2px rgba(0,0,0,0.55)",
            zIndex: 1,
          }}
        >
          {subline}
        </div>
      )}
    </div>
  );
}
