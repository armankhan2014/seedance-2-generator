"use client";

/**
 * SeedanceHeroCard
 *
 * Playing-video hero card. Mirrors `ModelHero` from
 * visualseffect.com/studio/video EXACTLY — same six props on the
 * <video> element, no callback refs, no useEffect rescues, no
 * controls-list overrides. That setup autoplays cleanly on iPhone
 * Safari, so we copy it byte-for-byte.
 *
 * Earlier iterations of this file piled on iOS "autoplay rescue"
 * tricks (callback ref + useEffect + disablePictureInPicture etc.)
 * that were actually BLOCKING autoplay rather than enabling it. The
 * working visualseffect.com hero card has none of those and plays
 * fine on iPhone, so the minimal version is the correct version.
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
          "linear-gradient(135deg, #0a1424 0%, #0e466c 45%, #2391c8 78%, #b8e3f0 100%)",
        ...extraStyle,
      }}
    >
      {videoUrl && (
        // Six attributes ONLY — same as the visualseffect.com card
        // that already autoplays on iPhone. Don't add more.
        <video
          key={videoUrl}
          src={videoUrl}
          autoPlay
          muted
          loop
          playsInline
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "saturate(1.05)",
          }}
        />
      )}

      {/* Dark gradient overlay for readability. */}
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

      {/* Optional "Change" pill. */}
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

      {/* SEEDANCE label. */}
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

      {/* Model name. */}
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

      {/* Optional sub-subtitle. */}
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
