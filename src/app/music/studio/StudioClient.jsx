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
// Six colour hues — one per lane — so a fully-loaded mix reads as
// six distinct visual streams. Spread across the colour wheel
// (~60° apart) so adjacent lanes don't blur into each other.
const LANE_HUES = [70, 195, 320, 25, 270, 145]; // lime, cyan, magenta, orange, purple, green
const LANE_COUNT = LANE_HUES.length;

export default function StudioClient() {
  // ── Studio stem-separation state (v2, LALAL.AI-powered) ──────
  // Tracks one active split job at a time. UI shows a progress
  // banner above the timeline while running; on completion, the
  // 4 returned stems auto-load onto lanes 0-3 (replacing whatever
  // was there).
  const [stemJob, setStemJob] = useState(null); // { trackId, taskId, status, progress, error }

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

  // ── Arrangement persistence ───────────────────────────────────
  // Saves the lightweight state (which tracks are on which lanes +
  // their volume/mute/solo + master volume) to localStorage. On
  // mount, after the library loads, we restore by looking up each
  // saved trackId in the library + calling loadLane().
  //
  // We DO NOT persist the audio buffers themselves (huge, plus
  // they re-decode in ~1s) or the playhead position (fresh-start
  // every session is the right default).
  //
  // Throttled write — debounced 500ms so a slider drag doesn't
  // hammer localStorage on every pixel.
  const STORAGE_KEY = "sd-studio-v0-state";
  const restoredRef = useRef(false);
  // Restore once, after library loads + before any user input.
  useEffect(() => {
    if (libraryLoading || restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || saved.version !== 1) return;
      if (Number.isFinite(saved.masterVolume)) setMasterVolume(saved.masterVolume);
      if (Array.isArray(saved.lanes)) {
        // Hydrate non-audio lane settings first (volume / mute /
        // solo) so they apply immediately.
        setLanes((prev) =>
          prev.map((l, i) => {
            const s = saved.lanes[i];
            if (!s) return l;
            return {
              ...l,
              volume: Number.isFinite(s.volume) ? s.volume : l.volume,
              muted: !!s.muted,
              solo: !!s.solo,
            };
          })
        );
        // Then async-load any lanes with a saved trackId. Loop
        // synchronously to preserve order; loadLane handles
        // decode + state update.
        saved.lanes.forEach((s, i) => {
          if (!s?.trackId) return;
          const track = library.find((t) => t.id === s.trackId);
          if (track) loadLane(i, track);
        });
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryLoading, library]);
  // NOTE: the persistence (save-on-change) useEffect that pairs with
  // this restore one used to live RIGHT HERE. Bug fix 2026-05-18 —
  // moved it below the `lanes` + `masterVolume` useState calls,
  // because referencing those in its dependency array before they're
  // declared was throwing a SSR-time TDZ error ("Cannot access X
  // before initialization") + 500'ing the /music/studio page for
  // any signed-in user. Search "Persist on every relevant change"
  // to find its new home.

  // ── Lanes state (v0: 3 fixed) ─────────────────────────────────
  // Each lane has: { trackId, src, name, hue, audioBuffer, peaks,
  // duration, volume (0..1), muted, solo }. trackId === null means
  // empty lane.
  const [lanes, setLanes] = useState(() =>
    Array.from({ length: LANE_COUNT }, (_, i) => ({
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
  const trackGainsRef = useRef(Array(LANE_COUNT).fill(null)); // GainNode per lane
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

  // Persist arrangement on every relevant change. Moved here from
  // its original position next to the restore effect (above the
  // `lanes` + `masterVolume` useStates) because referencing those
  // in this effect's dependency array before they were declared
  // threw a TDZ ReferenceError at SSR time — search the bug-fix
  // comment near `}, [libraryLoading, library]);` for context.
  useEffect(() => {
    if (!restoredRef.current) return; // don't save until after first restore pass
    const t = setTimeout(() => {
      try {
        const payload = {
          version: 1,
          savedAt: Date.now(),
          masterVolume,
          lanes: lanes.map((l) => ({
            trackId: l.trackId,
            volume: l.volume,
            muted: l.muted,
            solo: l.solo,
          })),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {}
    }, 500);
    return () => clearTimeout(t);
  }, [lanes, masterVolume]);

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

  // ── Stem separation (LALAL.AI) ───────────────────────────────
  // Kick off a 4-stem split (vocals / drum / bass / piano) on a
  // library track. Costs 20 credits per the server route. While
  // running we poll /check every 6s; when complete we auto-load the
  // 4 returned stems onto lanes 0-3 (replacing whatever was there).
  // Order matters — we lock the stem→lane mapping here so users
  // know which lane to expect each stem on.
  const STEM_LANE_ORDER = ["vocals", "drum", "bass", "piano"];
  async function splitStems(track) {
    if (!track?.id) return;
    if (stemJob && stemJob.status === "processing") {
      flashStemMsg("Already splitting — wait for it to finish");
      return;
    }
    setStemJob({ trackId: track.id, status: "starting", progress: 0, sourceName: track.title });
    try {
      const res = await fetch("/api/music/studio/stems/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id, stems: STEM_LANE_ORDER }),
      });
      const j = await res.json();
      if (!res.ok) {
        setStemJob({ trackId: track.id, status: "failed", error: j.error || "Couldn't start split" });
        return;
      }
      // Already done — load stems directly.
      if (j.alreadyDone && j.studioStems) {
        setStemJob({ trackId: track.id, status: "completed" });
        applyStemsToLanes(j.studioStems);
        return;
      }
      setStemJob({
        trackId: track.id,
        taskId: j.taskId,
        status: "processing",
        progress: 0,
        sourceName: track.title,
      });
    } catch (e) {
      setStemJob({ trackId: track.id, status: "failed", error: e?.message || "Network error" });
    }
  }

  // Poll the active stem job every 6 seconds. Stops on completion
  // or failure. Also auto-loads the stems onto lanes when complete.
  useEffect(() => {
    if (!stemJob || stemJob.status !== "processing" || !stemJob.taskId || !stemJob.trackId) return;
    let stopped = false;
    let tries = 0;
    const MAX = 50; // ~5 min cap at 6s intervals
    async function tick() {
      while (!stopped && tries < MAX) {
        await new Promise((r) => setTimeout(r, 6000));
        if (stopped) return;
        tries++;
        try {
          const res = await fetch(
            `/api/music/studio/stems/${stemJob.taskId}?trackId=${encodeURIComponent(stemJob.trackId)}`
          );
          const j = await res.json();
          if (!res.ok) {
            setStemJob((prev) => ({ ...prev, status: "failed", error: j.error }));
            return;
          }
          if (j.studioStemStatus === "completed" && j.studioStems) {
            setStemJob({ trackId: stemJob.trackId, status: "completed" });
            applyStemsToLanes(j.studioStems);
            return;
          }
          if (j.studioStemStatus === "failed") {
            setStemJob({ trackId: stemJob.trackId, status: "failed", error: j.error });
            return;
          }
          // Still progressing — update %.
          setStemJob((prev) => ({ ...prev, progress: j.progress || 0 }));
        } catch (e) {
          // Network blip — keep trying.
        }
      }
      if (!stopped && tries >= MAX) {
        setStemJob((prev) => ({ ...prev, status: "failed", error: "Stem job timed out (5 min)." }));
      }
    }
    tick();
    return () => { stopped = true; };
  }, [stemJob?.taskId, stemJob?.trackId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply a completed stem map onto the first N lanes. Strip the
  // metadata keys (_sourceId / _stems / _startedAt) the start route
  // stashed during processing.
  async function applyStemsToLanes(studioStems) {
    if (!studioStems || typeof studioStems !== "object") return;
    // Filter out our internal metadata keys.
    const cleaned = Object.fromEntries(
      Object.entries(studioStems).filter(([k]) => !k.startsWith("_"))
    );
    // Stop any current playback so we don't get a confusing
    // half-fade when lanes swap underneath an active source.
    if (isPlaying) stopAll();
    // Load each stem onto its predetermined lane in STEM_LANE_ORDER.
    for (let i = 0; i < STEM_LANE_ORDER.length && i < LANE_COUNT; i++) {
      const label = STEM_LANE_ORDER[i];
      const url = cleaned[label];
      if (!url) continue;
      // Lane name + colour come from the existing lane defaults;
      // we override .name to the stem label so users can see what
      // each lane is. The src points directly at the R2-mirrored
      // stem URL (same-origin path on our R2 host).
      setLanes((prev) =>
        prev.map((l, idx) =>
          idx === i
            ? { ...l, trackId: `stem:${label}`, src: url, name: `Stem: ${label}`, loading: true, error: null }
            : l
        )
      );
      try {
        const { audioBuffer, peaks, duration } = await decodeTrack(url);
        // eslint-disable-next-line no-loop-func
        setLanes((prev) =>
          prev.map((l, idx) =>
            idx === i
              ? { ...l, audioBuffer, peaks, duration, loading: false }
              : l
          )
        );
      } catch (e) {
        setLanes((prev) =>
          prev.map((l, idx) =>
            idx === i ? { ...l, loading: false, error: e?.message || "Stem load failed" } : l
          )
        );
      }
    }
  }

  // Tiny toast helper for stem-job UX feedback. The stemJob banner
  // shows status long-form; this is for momentary errors during
  // user input.
  const [stemMsg, setStemMsg] = useState("");
  function flashStemMsg(m) {
    setStemMsg(m);
    setTimeout(() => setStemMsg(""), 3000);
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

  // Click-to-scrub: jump the playhead to a specific timeline second.
  // If we're currently playing, stop the existing sources + restart
  // them at the new offset so playback continues seamlessly from
  // the new position. If we're paused, just update the offset for
  // the next play() call.
  function seekTo(seconds) {
    const clamped = Math.max(0, Math.min(TIMELINE_SECONDS, seconds));
    if (isPlaying) {
      // Restart playback from the new offset.
      stopAllSources();
      playbackOffsetRef.current = clamped;
      setPlayhead(clamped);
      const ctx = ensureCtx();
      const startAt = ctx.currentTime + 0.05;
      playbackStartRef.current = startAt;
      const newSources = [];
      for (let i = 0; i < lanes.length; i++) {
        const lane = lanes[i];
        if (!lane.audioBuffer) continue;
        if (clamped >= lane.duration) continue;
        const src = ctx.createBufferSource();
        src.buffer = lane.audioBuffer;
        src.connect(trackGainsRef.current[i]);
        src.start(startAt, clamped);
        newSources.push(src);
      }
      sourcesRef.current = newSources;
    } else {
      playbackOffsetRef.current = clamped;
      setPlayhead(clamped);
    }
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

  // Keyboard shortcuts — standard DAW expectations:
  //   • Space   → play / pause
  //   • Escape  → stop (return playhead to 0)
  //   • Home    → jump to start
  // Only fires when the user ISN'T typing into an input or
  // contenteditable element, so the spacebar in a volume-slider
  // tooltip (or anywhere else) doesn't accidentally pause playback.
  useEffect(() => {
    function shouldIgnore(target) {
      if (!target) return false;
      const tag = target.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
      );
    }
    function onKey(e) {
      if (shouldIgnore(e.target)) return;
      // Space — toggle play/pause. preventDefault so the page
      // doesn't scroll.
      if (e.code === "Space") {
        e.preventDefault();
        if (isPlaying) pause();
        else play();
        return;
      }
      if (e.code === "Escape") {
        e.preventDefault();
        stopAll();
        return;
      }
      if (e.code === "Home") {
        e.preventDefault();
        seekTo(0);
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPlaying, lanes]); // re-bind so the latest play/pause/seekTo closures fire

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
      <StemJobBanner job={stemJob} flash={stemMsg} onDismiss={() => setStemJob(null)} />
      <TransportBar
        isPlaying={isPlaying}
        playhead={playhead}
        masterVolume={masterVolume}
        onPlay={play}
        onPause={pause}
        onStop={stopAll}
        onMasterVolume={setMasterVolume}
        onSeek={seekTo}
      />
      <main style={{ display: "flex", height: "calc(100vh - 56px - 60px)", overflow: "hidden" }}>
        <LibrarySidebar
          tracks={library}
          loading={libraryLoading}
          onDragStart={handleDragStart}
          onTap={loadIntoNextEmptyLane}
          onSplitStems={splitStems}
          stemJob={stemJob}
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
          onSeek={seekTo}
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

// Banner shown above the transport bar while a stem-split job is
// running (or just landed in success / failure). Self-dismisses on
// success after lanes auto-load; on failure stays until the user
// closes it so they can read the error.
function StemJobBanner({ job, flash, onDismiss }) {
  // Flash takes precedence — short transient error from user input
  // (e.g. "Already splitting"). Render either flash OR job-status
  // banner, not both, to keep the surface calm.
  if (flash) {
    return (
      <div
        style={{
          padding: "8px 16px",
          background: "rgba(239,68,68,0.10)",
          borderBottom: `1px solid rgba(239,68,68,0.32)`,
          fontSize: 12,
          color: "#fca5a5",
          fontWeight: 600,
        }}
      >
        {flash}
      </div>
    );
  }
  if (!job) return null;
  // Auto-disappear on success after a short delay so the lanes get
  // the user's attention next.
  if (job.status === "completed") {
    return (
      <div
        style={{
          padding: "10px 16px",
          background: C.accentSoft,
          borderBottom: `1px solid ${C.borderHover}`,
          fontSize: 12.5,
          color: C.accent,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span>✓ Stems loaded onto lanes 1-4 — hit play to mix.</span>
        <button
          onClick={onDismiss}
          style={{
            marginLeft: "auto",
            padding: "3px 8px",
            background: "transparent",
            border: `1px solid ${C.borderHover}`,
            borderRadius: 6,
            color: C.accent,
            fontSize: 10.5,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Dismiss
        </button>
      </div>
    );
  }
  if (job.status === "failed") {
    return (
      <div
        style={{
          padding: "10px 16px",
          background: "rgba(239,68,68,0.10)",
          borderBottom: `1px solid rgba(239,68,68,0.32)`,
          fontSize: 12.5,
          color: "#fca5a5",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span>✕ Stem split failed: {job.error || "Unknown error"}. Credits refunded.</span>
        <button
          onClick={onDismiss}
          style={{
            marginLeft: "auto",
            padding: "3px 8px",
            background: "transparent",
            border: `1px solid rgba(239,68,68,0.5)`,
            borderRadius: 6,
            color: "#fca5a5",
            fontSize: 10.5,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Dismiss
        </button>
      </div>
    );
  }
  // Starting / processing.
  const pct = Math.max(2, Math.min(100, job.progress || 0));
  return (
    <div
      style={{
        padding: "10px 16px",
        background: C.panelSoft,
        borderBottom: `1px solid ${C.border}`,
        fontSize: 12.5,
        color: C.textSoft,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span style={{ flexShrink: 0 }}>
        🔬 Splitting <b style={{ color: C.text }}>{job.sourceName || "track"}</b> into stems…
      </span>
      <div
        style={{
          flex: 1,
          maxWidth: 260,
          height: 6,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${C.accent}, ${C.accentDark})`,
            transition: "width 0.4s",
          }}
        />
      </div>
      <span style={{ fontVariantNumeric: "tabular-nums", color: C.muted, fontSize: 11 }}>
        {pct}%
      </span>
    </div>
  );
}

// ── Transport bar ────────────────────────────────────────────────
function TransportBar({ isPlaying, playhead, masterVolume, onPlay, onPause, onStop, onMasterVolume, onSeek }) {
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
      {/* Keyboard hint — discoverable text so users learn the
          DAW-standard shortcuts without needing docs. */}
      <span style={{ fontSize: 10.5, color: C.muted, marginRight: 14, display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <KbdHint k="Space">play / pause</KbdHint>
        <KbdHint k="Esc">stop</KbdHint>
        <KbdHint k="Home">to start</KbdHint>
      </span>
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

// Inline keyboard-shortcut hint pill. Used in the transport bar to
// surface DAW-standard shortcuts without a docs page.
function KbdHint({ k, children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <kbd
        style={{
          padding: "1px 6px",
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 4,
          fontSize: 9.5,
          fontWeight: 700,
          color: C.textSoft,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          lineHeight: 1.4,
        }}
      >
        {k}
      </kbd>
      <span>{children}</span>
    </span>
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
function LibrarySidebar({ tracks, loading, onDragStart, onTap, onSplitStems, stemJob }) {
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
        tracks.map((t) => {
          const isThisSplitting = stemJob?.trackId === t.id && stemJob?.status === "processing";
          return (
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
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = C.panelSoft)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              title="Drag onto a lane, or tap to load into the next empty lane"
            >
              <div style={{ flex: 1, minWidth: 0 }}>
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
              {onSplitStems && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSplitStems(t); }}
                  disabled={isThisSplitting}
                  title={
                    isThisSplitting
                      ? "Splitting in progress…"
                      : "Split into 4 stems (vocals/drum/bass/piano) and load onto lanes · 20 credits"
                  }
                  style={{
                    flexShrink: 0,
                    padding: "5px 10px",
                    borderRadius: 999,
                    background: isThisSplitting ? C.accentSoft : "transparent",
                    border: `1px solid ${C.borderHover}`,
                    color: C.accent,
                    fontSize: 10.5,
                    fontWeight: 800,
                    letterSpacing: "0.04em",
                    cursor: isThisSplitting ? "default" : "pointer",
                    fontFamily: "inherit",
                    opacity: isThisSplitting ? 0.7 : 1,
                  }}
                >
                  {isThisSplitting ? "…" : "🔬 Split"}
                </button>
              )}
            </div>
          );
        })}
    </aside>
  );
}

// ── Timeline area ────────────────────────────────────────────────
function TimelineArea({ lanes, playhead, timelineSeconds, pixelsPerSecond, timelineWidth, onDrop, onDragOver, onVolume, onToggleMute, onToggleSolo, onClear, onSeek }) {
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
      <TimeRuler
        timelineSeconds={timelineSeconds}
        pixelsPerSecond={pixelsPerSecond}
        timelineWidth={timelineWidth}
        onSeek={onSeek}
      />
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
// Clicking anywhere on the ruler scrubs the playhead to that second.
// Cursor: pointer when onSeek is wired, so users discover the
// interaction without docs.
function TimeRuler({ timelineSeconds, pixelsPerSecond, timelineWidth, onSeek }) {
  function handleClick(e) {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const seconds = x / pixelsPerSecond;
    onSeek(seconds);
  }
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
          pointerEvents: "none",
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
      <div
        onClick={handleClick}
        title="Click to jump the playhead here"
        style={{
          position: "relative",
          width: timelineWidth,
          height: 28,
          cursor: onSeek ? "pointer" : "default",
        }}
      >
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
