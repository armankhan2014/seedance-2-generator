"use client";
//
// Public embed for a single music track. Loaded by /m/[id] with the
// track already server-side fetched + shaped. No API calls here — the
// audio src is in the props.
//
// Layout: hero with track title + creator avatar + genre tags + a
// premium player (scrubbable waveform, play/pause, time, download).
// At the bottom, a soft CTA to "Make your own" linking to /music
// (turns shared listeners into authed creators).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import VerifiedBadge from "@/components/saas/VerifiedBadge";

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

export default function MusicEmbed({ track }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse 70% 50% at 30% 15%, rgba(217,255,0,0.10), transparent 70%)," +
          "radial-gradient(ellipse 60% 50% at 80% 85%, rgba(236,72,153,0.10), transparent 70%)," +
          "linear-gradient(180deg, #050505 0%, #0d1606 65%, #050505 100%)",
        color: C.text,
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
      }}
    >
      {/* Top-bar wordmark linking back to Studio. Tiny — the page is
          about the track, not the site. */}
      <header style={{ padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link
          href="/"
          style={{
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 800,
            color: "#fff",
            letterSpacing: "-0.01em",
          }}
        >
          Seedance
          <span
            style={{
              background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Studio
          </span>
        </Link>
        <Link
          href="/music"
          style={{
            padding: "8px 14px",
            background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
            border: "none",
            color: "#0a0a0a",
            fontSize: 12,
            fontWeight: 800,
            borderRadius: 8,
            textDecoration: "none",
            letterSpacing: "0.02em",
          }}
        >
          🎵 Make your own
        </Link>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px 96px" }}>
        <PlayerCard track={track} />
        <BottomCTA />
      </main>
    </div>
  );
}

function PlayerCard({ track }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(track.duration || 60);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    function onTime() { if (a.duration) { setPos(a.currentTime / a.duration); setDur(a.duration); } }
    function onEnd() { setPlaying(false); setPos(0); }
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    a.addEventListener("loadedmetadata", onTime);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("loadedmetadata", onTime);
    };
  }, []);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); }
    else { a.pause(); setPlaying(false); }
  }
  function seek(frac) {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    a.currentTime = a.duration * frac;
    setPos(frac);
  }
  function onDownload() {
    if (!track.src) return;
    const link = document.createElement("a");
    link.href = track.src;
    link.download = `${(track.title || "track").replace(/[^a-z0-9_-]/gi, "_")}.mp3`;
    link.click();
  }
  async function onShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try { await navigator.share({ title: track.title, text: `🎵 ${track.title}`, url }); } catch {}
    } else if (navigator.clipboard) {
      try { await navigator.clipboard.writeText(url); } catch {}
    }
  }

  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 20,
        overflow: "hidden",
        boxShadow: "0 28px 80px -20px rgba(0,0,0,0.8)",
      }}
    >
      {/* Cover band */}
      <div
        style={{
          height: 180,
          background:
            "linear-gradient(135deg, rgba(217,255,0,0.22) 0%, rgba(166,204,0,0.12) 40%, rgba(0,0,0,0) 80%), " +
            "radial-gradient(ellipse at top right, rgba(236,72,153,0.22), transparent 60%)",
          display: "flex",
          alignItems: "flex-end",
          padding: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Creator avatar — wrapped in a relative span so the pink
              verified badge can be absolutely positioned at the
              bottom-right, mirroring the Navbar avatar treatment. */}
          <CreatorAvatar
            image={track.creatorImage}
            name={track.creator}
            verified={track.creatorVerified}
            size={40}
          />
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, letterSpacing: "0.16em", textTransform: "uppercase" }}>
              {track.genre ? `${track.genre}${track.mood ? " · " + track.mood : ""}` : "AI music"}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3, display: "inline-flex", alignItems: "center", gap: 4 }}>
              by {track.creator}
              {track.creatorVerified && <VerifiedBadge size={11} />}
            </div>
          </div>
        </div>
      </div>

      {/* Title */}
      <div style={{ padding: "20px 24px 0" }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: "-0.015em", lineHeight: 1.2 }}>
          {track.title}
        </div>
        {track.prompt && (
          <div
            style={{
              marginTop: 8,
              fontSize: 12.5,
              color: C.muted,
              lineHeight: 1.55,
              fontStyle: "italic",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            “{track.prompt}”
          </div>
        )}
      </div>

      <PlayerWaveform pos={pos} onSeek={seek} />

      <audio ref={audioRef} src={track.src} preload="metadata" />

      <div style={{ padding: "20px 24px 24px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <button
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
            border: "none",
            color: "#0a0a0a",
            fontSize: 22,
            cursor: "pointer",
            fontFamily: "inherit",
            boxShadow: `0 12px 28px -8px ${C.accent}88`,
          }}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.muted }}>
            <span>{formatTime(pos * dur)}</span>
            <span>{formatTime(dur)}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ActionBtn icon="⬇" label="Download" onClick={onDownload} />
          <ActionBtn icon="↗" label="Share" onClick={onShare} />
          <ActionBtn icon="🎬" label="Use in video" onClick={() => {
            if (!track.id) return;
            window.location.href = `/generate?soundtrack=${track.id}`;
          }} />
        </div>
      </div>
    </div>
  );
}

function PlayerWaveform({ pos, onSeek }) {
  const ref = useRef(null);
  const heights = useRef(
    Array.from({ length: 96 }, (_, i) => {
      const x = i / 96;
      return 0.18 + 0.35 * Math.abs(Math.sin(x * Math.PI * 4)) + 0.35 * Math.random();
    })
  );
  function onClick(e) {
    const rect = ref.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(1, x)));
  }
  return (
    <div
      ref={ref}
      onClick={onClick}
      style={{
        height: 84,
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        gap: 3,
        cursor: "pointer",
        background: "rgba(255,255,255,0.02)",
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      {heights.current.map((h, i) => {
        const active = i / heights.current.length < pos;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${h * 64}px`,
              borderRadius: 2,
              background: active ? `linear-gradient(180deg, ${C.accent}, ${C.accentDark})` : "rgba(255,255,255,0.10)",
            }}
          />
        );
      })}
    </div>
  );
}

function ActionBtn({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 12px",
        background: C.panelSoft,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        color: C.textSoft,
        fontSize: 11.5,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.borderHover; e.currentTarget.style.color = C.accent; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSoft; }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function BottomCTA() {
  return (
    <div
      style={{
        marginTop: 40,
        padding: "24px 24px",
        textAlign: "center",
        background: "rgba(255,255,255,0.02)",
        border: `1px solid ${C.border}`,
        borderRadius: 16,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, color: C.accent, letterSpacing: "0.16em", textTransform: "uppercase" }}>
        Composed with AI on Seedance
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 800, margin: "10px 0 8px", letterSpacing: "-0.015em" }}>
        Make your own soundtrack
      </h2>
      <p style={{ fontSize: 13, color: C.muted, margin: "0 auto 18px", maxWidth: 380, lineHeight: 1.55 }}>
        Royalty-free music in under three minutes. Genre, mood, lyrics — all yours.
      </p>
      <Link
        href="/music"
        style={{
          display: "inline-block",
          padding: "10px 22px",
          background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
          color: "#0a0a0a",
          fontSize: 13,
          fontWeight: 800,
          borderRadius: 10,
          textDecoration: "none",
          letterSpacing: "0.02em",
          boxShadow: `0 12px 28px -10px ${C.accent}66`,
        }}
      >
        ▶ Try it free →
      </Link>
    </div>
  );
}

function formatTime(s) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

// Round avatar with an optional pink verified badge anchored to the
// bottom-right corner. Same overlay treatment as the Navbar avatar
// (dark pad behind the badge so it reads cleanly against any image)
// — kept in sync visually so a verified user looks identical
// everywhere their photo appears.
function CreatorAvatar({ image, name, verified, size = 40 }) {
  // Badge sized as 45% of avatar so it scales gracefully if size
  // changes. Floor at 12px so the tick stays legible at small sizes.
  const badgeSize = Math.max(12, Math.round(size * 0.45));
  const inner = image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image}
      alt={name || ""}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        border: "2px solid rgba(217,255,0,0.4)",
        display: "block",
      }}
    />
  ) : (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
        color: "#0a0a0a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.4),
        fontWeight: 800,
      }}
    >
      {(name?.[0] || "?").toUpperCase()}
    </div>
  );
  if (!verified) return inner;
  return (
    <span
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-block",
        flexShrink: 0,
      }}
    >
      {inner}
      <span
        style={{
          position: "absolute",
          bottom: -2,
          right: -2,
          display: "inline-flex",
          background: "#0a0a0a",
          borderRadius: "50%",
          padding: 1,
          lineHeight: 0,
        }}
      >
        <VerifiedBadge size={badgeSize} />
      </span>
    </span>
  );
}
