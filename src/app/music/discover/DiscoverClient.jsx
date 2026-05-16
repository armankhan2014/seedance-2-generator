"use client";
//
// /music/discover — public gallery of tracks where the owner has
// flipped MusicTrack.public=true. Each card has an inline play
// button + opens the rich /m/[id] page on click for the full
// scrubbable player + share controls.
//
// Single global "now playing" audio so only one card plays at a
// time (clicking play on a different card pauses the first).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const C = {
  bg: "#0a0a0a",
  panel: "#141414",
  panelSoft: "#1c1c1c",
  border: "#2a2a2a",
  borderHover: "rgba(217,255,0,0.40)",
  text: "#f1f5f9",
  textSoft: "#cbd5e1",
  muted: "#64748b",
  accent: "#D9FF00",
  accentDark: "#A6CC00",
};

// Genre hue map — matches the GenreGrid + StarterCard treatment on
// /music so the discover gallery feels visually consistent.
const HUES = {
  cinematic: 38, ambient: 180, rock: 0, orchestral: 280,
  electronic: 195, jazz: 28, folk: 95, mystery: 240,
};

export default function DiscoverClient({ initialTracks }) {
  const [tracks] = useState(initialTracks);
  const [playingId, setPlayingId] = useState(null);
  const audioRef = useRef(null);

  function play(track) {
    if (!track.src) return;
    if (playingId === track.id) {
      // Toggle pause
      if (audioRef.current) audioRef.current.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    audioRef.current = new Audio(track.src);
    audioRef.current.play().catch(() => {});
    audioRef.current.onended = () => setPlayingId(null);
    setPlayingId(track.id);
  }

  useEffect(() => () => {
    if (audioRef.current) audioRef.current.pause();
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse 60% 50% at 20% 20%, rgba(217,255,0,0.08), transparent 70%)," +
          "radial-gradient(ellipse 50% 40% at 80% 80%, rgba(236,72,153,0.06), transparent 70%)," +
          "#0a0a0a",
        color: C.text,
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
      }}
    >
      <Header />
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 16px 96px" }}>
        {tracks.length === 0 ? (
          <EmptyState />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            {tracks.map((t) => (
              <DiscoverCard
                key={t.id}
                track={t}
                playing={playingId === t.id}
                onPlay={() => play(t)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Header() {
  return (
    <section style={{ padding: "56px 16px 16px", textAlign: "center", borderBottom: `1px solid ${C.border}` }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 14px",
          borderRadius: 999,
          background: "rgba(217,255,0,0.10)",
          border: `1px solid ${C.borderHover}`,
          fontSize: 10.5,
          fontWeight: 800,
          color: C.accent,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          marginBottom: 18,
        }}
      >
        🎵 Public gallery
      </div>
      <h1 style={{ fontSize: "clamp(34px, 5vw, 56px)", fontWeight: 800, margin: 0, letterSpacing: "-0.025em" }}>
        Discover{" "}
        <span style={{
          background: "linear-gradient(135deg, #D9FF00, #A6CC00)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}>
          new music
        </span>
      </h1>
      <p style={{ margin: "12px auto 0", maxWidth: 560, fontSize: 14, color: C.muted, lineHeight: 1.55 }}>
        Royalty-free AI-generated tracks shared by Seedance filmmakers. Tap to play —
        click through to download or use in your own video.
      </p>
      <div style={{ marginTop: 18, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
        <Link
          href="/music"
          style={{
            padding: "8px 16px",
            background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
            color: "#0a0a0a",
            textDecoration: "none",
            fontSize: 12.5,
            fontWeight: 800,
            borderRadius: 8,
          }}
        >
          ▶ Create your own
        </Link>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        marginTop: 60,
        padding: "60px 24px",
        textAlign: "center",
        background: C.panel,
        border: `1px dashed ${C.border}`,
        borderRadius: 18,
      }}
    >
      <div style={{ fontSize: 44, marginBottom: 14 }}>🎵</div>
      <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>No public tracks yet</h2>
      <p style={{ fontSize: 13, color: C.muted, margin: "8px auto 18px", maxWidth: 420, lineHeight: 1.55 }}>
        Be the first to publish. Generate a track on{" "}
        <Link href="/music" style={{ color: C.accent, textDecoration: "none" }}>/music</Link>{" "}
        and tap the “🌐 Publish to gallery” toggle on its library card.
      </p>
      <Link
        href="/music"
        style={{
          display: "inline-block",
          padding: "10px 20px",
          background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
          color: "#0a0a0a",
          textDecoration: "none",
          fontSize: 13,
          fontWeight: 800,
          borderRadius: 10,
        }}
      >
        ▶ Make your first track
      </Link>
    </div>
  );
}

function DiscoverCard({ track, playing, onPlay }) {
  const [hover, setHover] = useState(false);
  const hue = HUES[track.genre] ?? 70;
  const bg = hover || playing
    ? `linear-gradient(135deg, hsl(${hue} 70% 14%) 0%, hsl(${hue} 60% 6%) 100%)`
    : `linear-gradient(135deg, hsl(${hue} 35% 10%) 0%, #161616 100%)`;
  const borderColor = playing
    ? `hsl(${hue} 85% 60%)`
    : hover
      ? `hsl(${hue} 65% 50%)`
      : `hsl(${hue} 25% 22%)`;
  return (
    <article
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 14,
        padding: 16,
        transition: "all 0.2s",
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        boxShadow: playing
          ? `0 12px 28px -12px hsl(${hue} 80% 50% / 0.45)`
          : hover
            ? `0 10px 20px -12px hsl(${hue} 80% 50% / 0.25)`
            : "none",
        overflow: "hidden",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: -30,
          right: -30,
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: `radial-gradient(circle, hsl(${hue} 85% 55% / ${hover || playing ? 0.32 : 0.10}) 0%, transparent 70%)`,
          pointerEvents: "none",
          transition: "all 0.3s",
        }}
      />
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10 }}>
        {track.creatorImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={track.creatorImage}
            alt=""
            style={{
              width: 32, height: 32, borderRadius: "50%", objectFit: "cover",
              border: `1.5px solid hsl(${hue} 70% 50% / 0.5)`,
            }}
          />
        ) : (
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: `hsl(${hue} 60% 30%)`,
            color: `hsl(${hue} 90% 80%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 800,
          }}>
            {(track.creator?.[0] || "?").toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: `hsl(${hue} 70% 75%)`,
            letterSpacing: "0.06em", textTransform: "uppercase",
          }}>
            {track.genre}{track.mood ? ` · ${track.mood}` : ""}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>by {track.creator}</div>
        </div>
        <button
          onClick={onPlay}
          aria-label={playing ? "Pause" : "Play"}
          style={{
            width: 38, height: 38, borderRadius: "50%",
            background: playing
              ? `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`
              : "rgba(0,0,0,0.4)",
            border: `1px solid ${playing ? C.accent : C.border}`,
            color: playing ? "#0a0a0a" : C.accent,
            fontSize: 14,
            cursor: "pointer",
            fontFamily: "inherit",
            flexShrink: 0,
          }}
        >
          {playing ? "❚❚" : "▶"}
        </button>
      </div>
      <Link
        href={`/m/${track.id}`}
        style={{ textDecoration: "none", color: "inherit", display: "block", marginTop: 12, position: "relative" }}
      >
        <div style={{
          fontSize: 14, fontWeight: 700, color: C.text, letterSpacing: "-0.005em",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {track.title}
        </div>
        {track.prompt && (
          <div style={{
            fontSize: 11.5, color: C.muted, marginTop: 4, lineHeight: 1.45,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            fontStyle: "italic",
          }}>
            “{track.prompt}”
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 10.5, color: C.muted, fontWeight: 600, letterSpacing: "0.04em" }}>
          {formatTime(track.duration)}{track.plays ? ` · ${track.plays} plays` : ""} · Open →
        </div>
      </Link>
    </article>
  );
}

function formatTime(s) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}
