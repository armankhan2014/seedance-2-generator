"use client";
//
// Studio Pro DAW v0 — multi-track audio editor in the browser.
//
// Scope (v0, ships today):
//   • 3 sync'd track lanes (vertical stack) — drop a library track
//     onto any lane to load it.
//   • Library sidebar — fetches /api/music/tracks; each entry is
//     draggable + tappable to load into the next-free lane.
//   • Canvas waveforms — computed once from decoded peaks; no
//     external library, keeps the bundle lean.
//   • Web Audio sync engine — single AudioContext as the master
//     clock. AudioBufferSourceNodes scheduled at the same
//     `currentTime` for all tracks so they don't drift.
//   • Transport bar — play / pause / stop / live time display.
//   • Per-track mute, solo, volume slider.
//   • No editing — clips start at t=0 and play their full duration.
//     Drag-clips, trim/split, snap-to-grid, save/load, automation,
//     effects, recording, MIDI, video, collaboration are all v1+
//     work (see todo).
//
// Audio engine notes:
//   • One AudioContext per page load. Tracks are decoded into
//     AudioBuffers once (cached per URL); playback creates fresh
//     AudioBufferSourceNodes each time (Web Audio sources can only
//     be started once).
//   • GainNode chain: source → trackGain → masterGain →
//     destination. Mute = trackGain to 0. Volume slider drives
//     trackGain. Solo lifts only the soloed track to its set
//     volume, mutes others. Master volume drives masterGain.
//   • Playhead position computed from AudioContext.currentTime
//     minus the playback startTime. Updated 30×/s via rAF so the
//     cursor doesn't drift visually.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  accentSoft: "rgba(217,255,0,0.10)",
  accentDark: "#A6CC00",
  danger: "#ef4444",
};

// v0 timeline is fixed at 5 min. v1 will grow with content + add
// zoom controls. 300s × pixelsPerSecond gives a comfortable horiz.
// scroll on most screens.
const TIMELINE_SECONDS = 300;
const PIXELS_PER_SECOND_DEFAULT = 5;
// Three colour hues per lane so the waveforms aren't all
// monochrome. Cycle by lane index.
const LANE_HUES = [70, 195, 320]; // lime, cyan, magenta

export default function StudioClient() {
  // ── Library state ─────────────────────────────────────────────
  const [library, setLibrary] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  useEffect(() => {
    fetch("/api/music/tracks")
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && Array.isArray(j.tracks)) {
          // Only completed, playable tracks are useful here.
          setLibrary(
            j.tracks.filter(
              (t) =>
                t.status === "completed" && (t.r2Url || t.audioUrl || t.streamUrl)
            )
          );
        }
      })
      .catch(() => {})
      .finally(() => setLibraryLoading(false));
  }, []);

  // ── Lanes state (v0: 3 fixed) ─────────────────────────────────
  // Each lane has: { trackId, src, name, hue, audioBuffer, peaks,
  // duration, volume (0..1), muted, solo }. trackId === null means
  // empty lane.
  const [lanes, setLanes] = useState(() =>
    [0, 1, 2].map((i) => ({
      trackId: null,
      src: null,
      name: null,
      hue: LANE_HUES[i],
      audioBuffer: null,
      peaks: null,
      duration: 0,
      volume: 0.85,
      muted: false,
      solo: false,
      loading: false,
      error: null,
    }))
  );

  // ── Audio engine — single AudioContext shared by all lanes ───
  const ctxRef = useRef(null);
  const masterGainRef = useRef(null);
  const sourcesRef = useRef([]); // active AudioBufferSourceNodes
  const trackGainsRef = useRef([null, null, null]); // GainNode per lane
  // Decoded AudioBuffers cached by src URL so re-dropping the same
  // track on another lane reuses the existing decode.
  const bufferCache = useRef(new Map());

  // Lazy-init AudioContext on first user gesture (browser autoplay
  // policy blocks AudioContext creation outside of user-initiated
  // events on iOS Safari).
  function ensureCtx() {
    if (!ctxRef.current) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctor();
      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(ctx.destination);
      ctxRef.current = ctx;
      masterGainRef.current = masterGain;
      // Create lane gain nodes upfront.
      for (let i = 0; i < trackGainsRef.current.length; i++) {
        const g = ctx.createGain();
        g.gain.value = lanes[i].volume;
        g.connect(masterGain);
        trackGainsRef.current[i] = g;
      }
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }

  // ── Transport state ──────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0); // seconds
  const [masterVolume, setMasterVolume] = useState(0.9);
  // When playback starts, we capture: (a) AudioContext.currentTime
  // at that moment, (b) the offset within the timeline. The actual
  // playhead is derived as `offset + (ctx.currentTime -
  // playbackStart)` so it survives RAF jitter without drifting.
  const playbackStartRef = useRef(0);
  const playbackOffsetRef = useRef(0);
  const rafRef = useRef(null);

  // Smooth-update the playhead while playing.
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    function tick() {
      const ctx = ctxRef.current;
      if (!ctx) return;
      const p = playbackOffsetRef.current + (ctx.currentTime - playbackStartRef.current);
      setPlayhead(p);
      // Auto-stop at end of longest lane (or timeline cap).
      const maxDur = Math.max(
        ...lanes.map((l) => (l.audioBuffer ? l.duration : 0)),
        0.001
      );
      const stopAt = Math.min(TIMELINE_SECONDS, maxDur || TIMELINE_SECONDS);
      if (p >= stopAt) {
        stopAll();
        setPlayhead(stopAt);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, lanes]);

  // Apply mute/solo/volume changes live, even while playing.
  // Effective gain per lane = (soloActive ? lane.solo : !lane.muted)
  // ? lane.volume : 0.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const anySolo = lanes.some((l) => l.solo);
    for (let i = 0; i < lanes.length; i++) {
      const g = trackGainsRef.current[i];
      if (!g) continue;
      const audibleByMute = !lanes[i].muted;
      const audibleBySolo = anySolo ? lanes[i].solo : true;
      const target = audibleByMute && audibleBySolo ? lanes[i].volume : 0;
      // setTargetAtTime smooths the change so flipping mute mid-play
      // doesn't produce a click.
      g.gain.setTargetAtTime(target, ctx.currentTime, 0.01);
    }
  }, [lanes]);

  useEffect(() => {
    const g = masterGainRef.current;
    const ctx = ctxRef.current;
    if (g && ctx) {
      g.gain.setTargetAtTime(masterVolume, ctx.currentTime, 0.01);
    }
  }, [masterVolume]);

  // Decode a track's audio URL into an AudioBuffer + compute
  // simple RMS peaks for the waveform display. Cached by URL so
  // re-loads are instant.
  async function decodeTrack(src) {
    if (bufferCache.current.has(src)) {
      return bufferCache.current.get(src);
    }
    const ctx = ensureCtx();
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Fetch ${res.status}`);
    const arr = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(arr);
    // Compute peaks at ~600 samples wide — enough resolution that
    // zooming in still looks good without storing the whole waveform.
    const totalSamples = buf.length;
    const peakBuckets = 1200;
    const samplesPerBucket = Math.max(1, Math.floor(totalSamples / peakBuckets));
    const channel = buf.getChannelData(0); // mono peak from L
    const peaks = new Float32Array(peakBuckets);
    for (let i = 0; i < peakBuckets; i++) {
      let max = 0;
      const start = i * samplesPerBucket;
      const end = Math.min(start + samplesPerBucket, totalSamples);
      for (let j = start; j < end; j++) {
        const v = Math.abs(channel[j]);
        if (v > max) max = v;
      }
      peaks[i] = max;
    }
    const cached = { audioBuffer: buf, peaks, duration: buf.duration };
    bufferCache.current.set(src, cached);
    return cached;
  }

  // Load a library track into a specific lane. Decodes audio,
  // computes peaks, updates lane state. Idempotent — re-dropping
  // the same track on the same lane just refreshes the metadata.
  //
  // CRITICAL: we route the audio fetch through the same-origin
  // proxy (/api/music/tracks/[id]/audio) instead of the raw R2 URL.
  // Web Audio's decodeAudioData() needs a CORS-clean fetch response;
  // R2 public URLs are cross-origin from seedance.visualseffect.com
  // and don't send the right CORS headers, which is why direct
  // fetches were failing with "Failed to fetch" (Arman flagged
  // 2026-05-18). The proxy strips the cross-origin problem entirely.
  async function loadLane(laneIndex, track) {
    if (!track?.id) return;
    const src = `/api/music/tracks/${track.id}/audio`;
    setLanes((prev) =>
      prev.map((l, i) =>
        i === laneIndex
          ? { ...l, trackId: track.id, src, name: track.title, loading: true, error: null }
          : l
      )
    );
    try {
      ensureCtx();
      const { audioBuffer, peaks, duration } = await decodeTrack(src);
      setLanes((prev) =>
        prev.map((l, i) =>
          i === laneIndex
            ? { ...l, audioBuffer, peaks, duration, loading: false }
            : l
        )
      );
    } catch (e) {
      setLanes((prev) =>
        prev.map((l, i) =>
          i === laneIndex
            ? { ...l, loading: false, error: e?.message || "Couldn't load track" }
            : l
        )
      );
    }
  }

  // Pick the next empty lane for "tap to load" (vs explicit drag).
  function loadIntoNextEmptyLane(track) {
    const idx = lanes.findIndex((l) => !l.trackId);
    if (idx === -1) {
      // All lanes full — replace the first one.
      loadLane(0, track);
    } else {
      loadLane(idx, track);
    }
  }

  function clearLane(laneIndex) {
    if (isPlaying) stopAll();
    setLanes((prev) =>
      prev.map((l, i) =>
        i === laneIndex
          ? { ...l, trackId: null, src: null, name: null, audioBuffer: null, peaks: null, duration: 0, error: null }
          : l
      )
    );
  }

  // ── Transport ────────────────────────────────────────────────
  // Play from current playhead. Schedule every loaded lane's
  // AudioBufferSourceNode at the SAME ctx.currentTime so they're
  // sample-accurate sync. Each source is connected through its
  // lane gain so live mute/solo/volume changes take effect.
  function play() {
    const ctx = ensureCtx();
    stopAllSources(); // clear any leftover scheduled sources
    const startAt = ctx.currentTime + 0.05; // 50ms lead-in
    const offset = playhead;
    playbackStartRef.current = startAt;
    playbackOffsetRef.current = offset;
    const newSources = [];
    for (let i = 0; i < lanes.length; i++) {
      const lane = lanes[i];
      if (!lane.audioBuffer) continue;
      // If the playhead is past this lane's duration, skip it.
      if (offset >= lane.duration) continue;
      const src = ctx.createBufferSource();
      src.buffer = lane.audioBuffer;
      src.connect(trackGainsRef.current[i]);
      src.start(startAt, offset);
      newSources.push(src);
    }
    sourcesRef.current = newSources;
    setIsPlaying(true);
  }

  function pause() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const elapsed = ctx.currentTime - playbackStartRef.current;
    playbackOffsetRef.current = playbackOffsetRef.current + elapsed;
    setPlayhead(playbackOffsetRef.current);
    stopAllSources();
    setIsPlaying(false);
  }

  function stopAll() {
    stopAllSources();
    playbackOffsetRef.current = 0;
    setPlayhead(0);
    setIsPlaying(false);
  }

  function stopAllSources() {
    for (const s of sourcesRef.current) {
      try { s.stop(); } catch {}
      try { s.disconnect(); } catch {}
    }
    sourcesRef.current = [];
  }

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stopAllSources();
      if (ctxRef.current && ctxRef.current.state !== "closed") {
        ctxRef.current.close().catch(() => {});
      }
    };
  }, []);

  // ── Per-lane setters ─────────────────────────────────────────
  function setLaneVolume(i, v) {
    setLanes((prev) => prev.map((l, idx) => (idx === i ? { ...l, volume: v } : l)));
  }
  function toggleLaneMute(i) {
    setLanes((prev) => prev.map((l, idx) => (idx === i ? { ...l, muted: !l.muted } : l)));
  }
  function toggleLaneSolo(i) {
    setLanes((prev) => prev.map((l, idx) => (idx === i ? { ...l, solo: !l.solo } : l)));
  }

  // ── Drag/drop wiring helpers ─────────────────────────────────
  // Library cards set `application/x-sd-track-id` on dragstart.
  // Track lanes accept that mime type and look up the track from
  // `library`.
  function handleDragStart(e, track) {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("application/x-sd-track-id", track.id);
    // Some browsers (Firefox) require text/plain too.
    e.dataTransfer.setData("text/plain", track.title || "");
  }
  function handleLaneDrop(laneIndex, e) {
    e.preventDefault();
    const id = e.dataTransfer.getData("application/x-sd-track-id");
    if (!id) return;
    const track = library.find((t) => t.id === id);
    if (track) loadLane(laneIndex, track);
  }
  function handleLaneDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  // ── Render ───────────────────────────────────────────────────
  const timelineWidth = TIMELINE_SECONDS * PIXELS_PER_SECOND_DEFAULT;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif" }}>
      <TopBar />
      <TransportBar
        isPlaying={isPlaying}
        playhead={playhead}
        masterVolume={masterVolume}
        onPlay={play}
        onPause={pause}
        onStop={stopAll}
        onMasterVolume={setMasterVolume}
      />
      <main style={{ display: "flex", height: "calc(100vh - 56px - 60px)", overflow: "hidden" }}>
        <LibrarySidebar
          tracks={library}
          loading={libraryLoading}
          onDragStart={handleDragStart}
          onTap={loadIntoNextEmptyLane}
        />
        <TimelineArea
          lanes={lanes}
          playhead={playhead}
          timelineSeconds={TIMELINE_SECONDS}
          pixelsPerSecond={PIXELS_PER_SECOND_DEFAULT}
          timelineWidth={timelineWidth}
          onDrop={handleLaneDrop}
          onDragOver={handleLaneDragOver}
          onVolume={setLaneVolume}
          onToggleMute={toggleLaneMute}
          onToggleSolo={toggleLaneSolo}
          onClear={clearLane}
        />
      </main>
    </div>
  );
}

// ── Top nav ──────────────────────────────────────────────────────
function TopBar() {
  return (
    <header
      style={{
        height: 56,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 20px",
        borderBottom: `1px solid ${C.border}`,
        background: C.panel,
      }}
    >
      <Link href="/music" style={{ color: C.muted, fontSize: 12, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
        ← Back to /music
      </Link>
      <div style={{ width: 1, height: 20, background: C.border }} />
      <div style={{ fontSize: 14, fontWeight: 800, color: C.text, display: "inline-flex", alignItems: "center", gap: 8 }}>
        🎛️ Studio Pro
        <span
          style={{
            fontSize: 9,
            fontWeight: 900,
            letterSpacing: "0.10em",
            background: "linear-gradient(135deg, #D9FF00 0%, #ec4899 100%)",
            color: "#0a0a0a",
            padding: "2px 8px",
            borderRadius: 999,
          }}
        >
          v0 · BETA
        </span>
      </div>
      <span style={{ fontSize: 11, color: C.muted }}>Multi-track audio editor</span>
    </header>
  );
}

// ── Transport bar ────────────────────────────────────────────────
function TransportBar({ isPlaying, playhead, masterVolume, onPlay, onPause, onStop, onMasterVolume }) {
  return (
    <div
      style={{
        height: 60,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 20px",
        borderBottom: `1px solid ${C.border}`,
        background: C.panelSoft,
      }}
    >
      <button
        onClick={onStop}
        aria-label="Stop"
        title="Stop"
        style={transportBtnStyle()}
      >
        ⏹
      </button>
      <button
        onClick={isPlaying ? onPause : onPlay}
        aria-label={isPlaying ? "Pause" : "Play"}
        title={isPlaying ? "Pause" : "Play (Space)"}
        style={{
          ...transportBtnStyle(),
          background: isPlaying ? C.accent : C.panel,
          border: `1px solid ${isPlaying ? C.accent : C.border}`,
          color: isPlaying ? "#0a0a0a" : C.accent,
          width: 48,
          height: 38,
        }}
      >
        {isPlaying ? "❚❚" : "▶"}
      </button>
      <div
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 18,
          fontWeight: 700,
          color: C.text,
          fontVariantNumeric: "tabular-nums",
          marginLeft: 4,
        }}
      >
        {formatTime(playhead)}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: "0.04em" }}>MASTER</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={masterVolume}
          onChange={(e) => onMasterVolume(Number(e.target.value))}
          style={{ width: 120, accentColor: C.accent }}
          aria-label="Master volume"
        />
      </div>
    </div>
  );
}

function transportBtnStyle() {
  return {
    width: 38,
    height: 38,
    borderRadius: 8,
    background: C.panel,
    border: `1px solid ${C.border}`,
    color: C.textSoft,
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

// ── Library sidebar ──────────────────────────────────────────────
function LibrarySidebar({ tracks, loading, onDragStart, onTap }) {
  return (
    <aside
      style={{
        width: 260,
        flexShrink: 0,
        borderRight: `1px solid ${C.border}`,
        background: C.panel,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          borderBottom: `1px solid ${C.border}`,
          position: "sticky",
          top: 0,
          background: C.panel,
          zIndex: 1,
        }}
      >
        <div style={{ fontSize: 10, color: C.accent, letterSpacing: "0.16em", fontWeight: 800, textTransform: "uppercase" }}>
          Your library
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>
          Drag a track onto a lane, or tap to load into the next empty lane.
        </div>
      </div>
      {loading && (
        <div style={{ padding: 16, fontSize: 12, color: C.muted }}>Loading library…</div>
      )}
      {!loading && tracks.length === 0 && (
        <div style={{ padding: 16, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
          You don&rsquo;t have any completed tracks yet.{" "}
          <Link href="/music" style={{ color: C.accent }}>Generate one →</Link>
        </div>
      )}
      {!loading &&
        tracks.map((t) => (
          <div
            key={t.id}
            draggable
            onDragStart={(e) => onDragStart(e, t)}
            onClick={() => onTap(t)}
            style={{
              padding: "10px 14px",
              borderBottom: `1px solid ${C.border}`,
              cursor: "grab",
              userSelect: "none",
              transition: "background 0.12s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = C.panelSoft)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            title="Drag onto a lane, or tap to load into the next empty lane"
          >
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                color: C.text,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {t.title}
            </div>
            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>
              {(t.genre || "—")}{t.mood ? ` · ${t.mood}` : ""}{t.tempo ? ` · ${t.tempo} BPM` : ""}
              {t.actualDuration || t.durationReq ? ` · ${formatTime(t.actualDuration || t.durationReq)}` : ""}
            </div>
          </div>
        ))}
    </aside>
  );
}

// ── Timeline area ────────────────────────────────────────────────
function TimelineArea({ lanes, playhead, timelineSeconds, pixelsPerSecond, timelineWidth, onDrop, onDragOver, onVolume, onToggleMute, onToggleSolo, onClear }) {
  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        background: C.bg,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <TimeRuler timelineSeconds={timelineSeconds} pixelsPerSecond={pixelsPerSecond} timelineWidth={timelineWidth} />
      <div style={{ position: "relative" }}>
        {lanes.map((lane, i) => (
          <TrackLane
            key={i}
            laneIndex={i}
            lane={lane}
            timelineWidth={timelineWidth}
            pixelsPerSecond={pixelsPerSecond}
            onDrop={(e) => onDrop(i, e)}
            onDragOver={onDragOver}
            onVolume={(v) => onVolume(i, v)}
            onToggleMute={() => onToggleMute(i)}
            onToggleSolo={() => onToggleSolo(i)}
            onClear={() => onClear(i)}
          />
        ))}
        <Playhead playhead={playhead} pixelsPerSecond={pixelsPerSecond} />
      </div>
    </div>
  );
}

// Time ruler — minute:second ticks across the top of the timeline.
function TimeRuler({ timelineSeconds, pixelsPerSecond, timelineWidth }) {
  const labels = [];
  // Tick every 30s for label, every 10s for minor tick.
  for (let s = 0; s <= timelineSeconds; s += 10) {
    labels.push(
      <div
        key={s}
        style={{
          position: "absolute",
          left: s * pixelsPerSecond,
          top: 0,
          bottom: 0,
          borderLeft: s % 60 === 0
            ? `1px solid rgba(255,255,255,0.18)`
            : s % 30 === 0
              ? `1px solid rgba(255,255,255,0.10)`
              : `1px solid rgba(255,255,255,0.05)`,
          width: 1,
        }}
      >
        {s % 30 === 0 && (
          <span
            style={{
              position: "absolute",
              top: 4,
              left: 6,
              fontSize: 10,
              color: C.muted,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatTime(s)}
          </span>
        )}
      </div>
    );
  }
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 2, background: C.panelSoft, borderBottom: `1px solid ${C.border}`, marginLeft: 220 }}>
      <div style={{ position: "relative", width: timelineWidth, height: 28 }}>
        {labels}
      </div>
    </div>
  );
}

// One track lane: lane header (controls) + clip canvas.
function TrackLane({ laneIndex, lane, timelineWidth, pixelsPerSecond, onDrop, onDragOver, onVolume, onToggleMute, onToggleSolo, onClear }) {
  return (
    <div
      style={{
        display: "flex",
        height: 96,
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <LaneHeader
        laneIndex={laneIndex}
        lane={lane}
        onVolume={onVolume}
        onToggleMute={onToggleMute}
        onToggleSolo={onToggleSolo}
        onClear={onClear}
      />
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        style={{
          position: "relative",
          width: timelineWidth,
          height: "100%",
          background: lane.audioBuffer ? "transparent" : C.panel,
          borderLeft: `1px solid ${C.border}`,
        }}
      >
        {!lane.audioBuffer && !lane.loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              paddingLeft: 16,
              color: C.muted,
              fontSize: 11.5,
              fontStyle: "italic",
              pointerEvents: "none",
            }}
          >
            {lane.error ? `Error: ${lane.error}` : "Drop a track here…"}
          </div>
        )}
        {lane.loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: C.accent,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Decoding {lane.name}…
          </div>
        )}
        {lane.audioBuffer && (
          <ClipCanvas
            peaks={lane.peaks}
            duration={lane.duration}
            hue={lane.hue}
            pixelsPerSecond={pixelsPerSecond}
            name={lane.name}
          />
        )}
      </div>
    </div>
  );
}

function LaneHeader({ laneIndex, lane, onVolume, onToggleMute, onToggleSolo, onClear }) {
  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        padding: "8px 12px",
        background: C.panel,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            background: `hsl(${lane.hue} 70% 55%)`,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: lane.name ? C.text : C.muted,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flex: 1,
            minWidth: 0,
          }}
        >
          {lane.name || `Track ${laneIndex + 1}`}
        </span>
        {lane.trackId && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear lane"
            title="Clear lane"
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              background: "transparent",
              border: "none",
              color: C.muted,
              fontSize: 14,
              cursor: "pointer",
              fontFamily: "inherit",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button
          type="button"
          onClick={onToggleMute}
          title="Mute"
          style={{
            padding: "2px 6px",
            borderRadius: 4,
            background: lane.muted ? C.danger : C.panelSoft,
            border: `1px solid ${lane.muted ? C.danger : C.border}`,
            color: lane.muted ? "#fff" : C.textSoft,
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: "0.04em",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          M
        </button>
        <button
          type="button"
          onClick={onToggleSolo}
          title="Solo"
          style={{
            padding: "2px 6px",
            borderRadius: 4,
            background: lane.solo ? C.accent : C.panelSoft,
            border: `1px solid ${lane.solo ? C.accent : C.border}`,
            color: lane.solo ? "#0a0a0a" : C.textSoft,
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: "0.04em",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          S
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={lane.volume}
          onChange={(e) => onVolume(Number(e.target.value))}
          aria-label="Track volume"
          title={`Volume ${Math.round(lane.volume * 100)}%`}
          style={{ flex: 1, accentColor: `hsl(${lane.hue} 70% 55%)` }}
        />
      </div>
    </div>
  );
}

// Canvas waveform for a lane's clip. Decoded peaks come pre-computed
// from decodeTrack; we just stretch them across `duration *
// pixelsPerSecond` width.
function ClipCanvas({ peaks, duration, hue, pixelsPerSecond, name }) {
  const canvasRef = useRef(null);
  const clipWidth = Math.max(40, duration * pixelsPerSecond);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const dpr = window.devicePixelRatio || 1;
    const w = clipWidth;
    const h = 80;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    // Background clip pill
    ctx.fillStyle = `hsl(${hue} 60% 18%)`;
    ctx.fillRect(0, 0, w, h);
    // Waveform
    const center = h / 2;
    const stride = Math.max(1, Math.floor(peaks.length / w));
    ctx.fillStyle = `hsl(${hue} 80% 65%)`;
    for (let x = 0; x < w; x++) {
      // Average a few peak buckets per pixel so the waveform looks
      // smoothly stretched at any zoom level.
      const startBucket = Math.floor((x / w) * peaks.length);
      let max = 0;
      const samples = Math.max(1, stride);
      for (let j = 0; j < samples; j++) {
        const v = peaks[startBucket + j] || 0;
        if (v > max) max = v;
      }
      const halfH = Math.max(1, max * (h * 0.42));
      ctx.fillRect(x, center - halfH, 1, halfH * 2);
    }
  }, [peaks, duration, hue, clipWidth]);

  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        left: 0,
        height: 80,
        width: clipWidth,
        borderRadius: 6,
        overflow: "hidden",
        border: `1px solid hsl(${hue} 60% 35%)`,
      }}
      title={name}
    >
      <canvas ref={canvasRef} />
      <div
        style={{
          position: "absolute",
          top: 4,
          left: 8,
          fontSize: 10,
          fontWeight: 700,
          color: `hsl(${hue} 90% 80%)`,
          letterSpacing: "0.04em",
          pointerEvents: "none",
          textShadow: "0 1px 2px rgba(0,0,0,0.6)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: clipWidth - 16,
        }}
      >
        {name}
      </div>
    </div>
  );
}

function Playhead({ playhead, pixelsPerSecond }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 220 + playhead * pixelsPerSecond,
        width: 2,
        background: C.accent,
        pointerEvents: "none",
        boxShadow: `0 0 8px ${C.accent}`,
        zIndex: 3,
      }}
    />
  );
}

function formatTime(s) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}
