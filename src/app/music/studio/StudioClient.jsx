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

  // ── Voice-clean state (LALAL voice_clean endpoint) ─────────────
  // Same shape as stemJob but for the cleaned-voice flow. Strips
  // background noise from a track's vocal. Shares the same banner +
  // polling pattern as stem split.
  const [voiceCleanJob, setVoiceCleanJob] = useState(null);

  // ── Lead+backing vocals split state (LALAL stem_separator
  // with multivocal=lead_back). Returns up to 4 stems: lead /
  // backing / no_vocals / mix_no_lead. On completion we auto-load
  // lead + backing onto the next two empty lanes (vs the multistem
  // split which always targets lanes 0-5).
  const [vocalsSplitJob, setVocalsSplitJob] = useState(null);

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
  // Loop region: { start, end } in timeline seconds, or null.
  // Created by dragging on the time ruler. Doesn't auto-play —
  // the user still needs loop ON (loopEnabled) for the playhead
  // to wrap when it reaches loopRegion.end. Separating "has a
  // region" from "loop is on" lets users select a region for
  // reference (e.g. seeing where the chorus is) without forcing
  // looped playback.
  const [loopRegion, setLoopRegion] = useState(null);
  const [loopEnabled, setLoopEnabled] = useState(true);
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
      // Loop check FIRST — if we're past the loop's end + loop is on,
      // jump back to loop start. seekTo handles restarting sources at
      // the new offset, so playback continues seamlessly.
      if (loopEnabled && loopRegion && loopRegion.end > loopRegion.start && p >= loopRegion.end) {
        seekTo(loopRegion.start);
        return; // seekTo restarts the playback loop; next RAF picks up there.
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, lanes, loopEnabled, loopRegion]);

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
  // Kick off a 6-stem split (vocals / drum / bass / piano /
  // electric_guitar / acoustic_guitar) on a library track. Costs 30
  // credits per the server route. While running we poll /check
  // every 6s; when complete we auto-load the 6 returned stems onto
  // lanes 0-5 (replacing whatever was there). Order matters — we
  // lock the stem→lane mapping here so users know which lane to
  // expect each stem on. Bumped from 4 → 6 stems 2026-05-18; the
  // LALAL multistem endpoint maxes at 6 per call, so this is the
  // most we can extract in one shot. Synth/strings/wind would need
  // /split/stem_separator/ (different endpoint) — deferred.
  const STEM_LANE_ORDER = ["vocals", "drum", "bass", "piano", "electric_guitar", "acoustic_guitar"];
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
        applyStemsToLanes(j.studioStems, track.id);
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
            applyStemsToLanes(j.studioStems, stemJob.trackId);
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

  // Apply a completed stem map onto the first N lanes. We DO NOT
  // use the raw R2 URLs from studioStems[label] directly — those
  // are cross-origin and trip CORS in Web Audio's decodeAudioData()
  // ("Failed to fetch" — Arman flagged 2026-05-18). Instead, we
  // route each stem through the same-origin audio proxy at
  // /api/music/tracks/<trackId>/audio?source=stem-<label>, which
  // streams the R2 audio body back through our function so the
  // browser sees it as same-origin. That's the SAME fix we used
  // for the main track audio when the same bug hit there.
  async function applyStemsToLanes(studioStems, parentTrackId) {
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
      const rawUrl = cleaned[label];
      if (!rawUrl) continue;
      // Same-origin proxy URL — see comment above for why.
      const proxySrc = `/api/music/tracks/${parentTrackId}/audio?source=stem-${encodeURIComponent(label)}`;
      setLanes((prev) =>
        prev.map((l, idx) =>
          idx === i
            ? { ...l, trackId: `stem:${label}`, src: proxySrc, name: `Stem: ${label}`, loading: true, error: null }
            : l
        )
      );
      try {
        const { audioBuffer, peaks, duration } = await decodeTrack(proxySrc);
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

  // ── Lead + backing vocals split (LALAL stem_separator) ─────
  // Same flow as voice clean / stem split: kick off, poll, mirror
  // result to R2 (server-side), auto-load stems onto lanes.
  // Loads lead onto the next empty lane + backing (if present)
  // onto the lane after that. Doesn't clobber existing arrangement.
  async function splitVocals(track) {
    if (!track?.id) return;
    if (vocalsSplitJob && vocalsSplitJob.status === "processing") {
      flashStemMsg("Already splitting vocals — wait for it to finish");
      return;
    }
    setVocalsSplitJob({ trackId: track.id, status: "starting", progress: 0, sourceName: track.title });
    try {
      const res = await fetch("/api/music/studio/vocals-split/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id }),
      });
      const j = await res.json();
      if (!res.ok) {
        setVocalsSplitJob({ trackId: track.id, status: "failed", error: j.error || "Couldn't start vocals split" });
        return;
      }
      if (j.alreadyDone && j.vocalsSplit) {
        setVocalsSplitJob({ trackId: track.id, status: "completed" });
        applyVocalsSplitToLanes(track.id, track.title, j.vocalsSplit);
        return;
      }
      setVocalsSplitJob({
        trackId: track.id,
        taskId: j.taskId,
        status: "processing",
        progress: 0,
        sourceName: track.title,
      });
    } catch (e) {
      setVocalsSplitJob({ trackId: track.id, status: "failed", error: e?.message || "Network error" });
    }
  }

  // Poll loop for vocals-split — same cadence as stem split.
  useEffect(() => {
    if (!vocalsSplitJob || vocalsSplitJob.status !== "processing" || !vocalsSplitJob.taskId || !vocalsSplitJob.trackId) return;
    let stopped = false;
    let tries = 0;
    const MAX = 50;
    async function tick() {
      while (!stopped && tries < MAX) {
        await new Promise((r) => setTimeout(r, 6000));
        if (stopped) return;
        tries++;
        try {
          const res = await fetch(
            `/api/music/studio/vocals-split/${vocalsSplitJob.taskId}?trackId=${encodeURIComponent(vocalsSplitJob.trackId)}`
          );
          const j = await res.json();
          if (!res.ok) {
            setVocalsSplitJob((prev) => ({ ...prev, status: "failed", error: j.error }));
            return;
          }
          if (j.vocalsSplitStatus === "completed" && j.vocalsSplit) {
            setVocalsSplitJob({ trackId: vocalsSplitJob.trackId, status: "completed" });
            applyVocalsSplitToLanes(vocalsSplitJob.trackId, vocalsSplitJob.sourceName, j.vocalsSplit);
            return;
          }
          if (j.vocalsSplitStatus === "failed") {
            setVocalsSplitJob((prev) => ({ ...prev, status: "failed", error: j.error }));
            return;
          }
          setVocalsSplitJob((prev) => ({ ...prev, progress: j.progress || 0 }));
        } catch (e) {}
      }
      if (!stopped && tries >= MAX) {
        setVocalsSplitJob((prev) => ({ ...prev, status: "failed", error: "Vocals split timed out (5 min)." }));
      }
    }
    tick();
    return () => { stopped = true; };
  }, [vocalsSplitJob?.taskId, vocalsSplitJob?.trackId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load lead + backing onto two next-empty lanes. Same CORS-safe
  // proxy URL pattern as the multistem load. Routes through
  // /api/music/tracks/<id>/audio?source=vocals-<label>.
  async function applyVocalsSplitToLanes(parentTrackId, sourceName, vocalsSplit) {
    if (!vocalsSplit || typeof vocalsSplit !== "object") return;
    if (isPlaying) stopAll();
    const candidates = [];
    if (vocalsSplit.lead) candidates.push({ label: "lead", display: `🎤 Lead: ${sourceName || ""}` });
    if (vocalsSplit.backing) candidates.push({ label: "backing", display: `🎶 Backing: ${sourceName || ""}` });
    // Find empty lanes to drop into. Use ALL lanes (even non-empty)
    // if we run out of empty ones, starting from index 0.
    const emptyIndices = lanes
      .map((l, i) => (!l.trackId ? i : null))
      .filter((i) => i !== null);
    for (let n = 0; n < candidates.length; n++) {
      const laneIndex = emptyIndices[n] ?? n; // fall back to first lanes
      const c = candidates[n];
      const proxySrc = `/api/music/tracks/${parentTrackId}/audio?source=vocals-${encodeURIComponent(c.label)}`;
      setLanes((prev) =>
        prev.map((l, i) =>
          i === laneIndex
            ? { ...l, trackId: `vocals-${c.label}:${parentTrackId}`, src: proxySrc, name: c.display, loading: true, error: null }
            : l
        )
      );
      try {
        const { audioBuffer, peaks, duration } = await decodeTrack(proxySrc);
        // eslint-disable-next-line no-loop-func
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
            i === laneIndex ? { ...l, loading: false, error: e?.message || "Vocal stem load failed" } : l
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

  // ── Voice cleaning (LALAL voice_clean) ───────────────────────
  // Kick off a voice-clean job. Cheaper (6 credits) than stem
  // split (20). Returns ONE cleaned-voice mp3 instead of 4 stems.
  // On success, auto-loads onto the next empty lane (vs stem split
  // which replaces the first 4 lanes).
  async function cleanVoice(track) {
    if (!track?.id) return;
    if (voiceCleanJob && voiceCleanJob.status === "processing") {
      flashStemMsg("Already cleaning a voice — wait for it to finish");
      return;
    }
    setVoiceCleanJob({ trackId: track.id, status: "starting", progress: 0, sourceName: track.title });
    try {
      const res = await fetch("/api/music/studio/voice-clean/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id, noiseLevel: 1 }),
      });
      const j = await res.json();
      if (!res.ok) {
        setVoiceCleanJob({ trackId: track.id, status: "failed", error: j.error || "Couldn't start voice clean" });
        return;
      }
      if (j.alreadyDone && j.voiceCleanUrl) {
        setVoiceCleanJob({ trackId: track.id, status: "completed" });
        loadCleanedVoiceOntoLane(track.id, track.title);
        return;
      }
      setVoiceCleanJob({
        trackId: track.id,
        taskId: j.taskId,
        status: "processing",
        progress: 0,
        sourceName: track.title,
      });
    } catch (e) {
      setVoiceCleanJob({ trackId: track.id, status: "failed", error: e?.message || "Network error" });
    }
  }

  // Poll voice-clean job — same 6s cadence as stem split. Stops on
  // completion / failure / 5-min cap.
  useEffect(() => {
    if (!voiceCleanJob || voiceCleanJob.status !== "processing" || !voiceCleanJob.taskId || !voiceCleanJob.trackId) return;
    let stopped = false;
    let tries = 0;
    const MAX = 50;
    async function tick() {
      while (!stopped && tries < MAX) {
        await new Promise((r) => setTimeout(r, 6000));
        if (stopped) return;
        tries++;
        try {
          const res = await fetch(
            `/api/music/studio/voice-clean/${voiceCleanJob.taskId}?trackId=${encodeURIComponent(voiceCleanJob.trackId)}`
          );
          const j = await res.json();
          if (!res.ok) {
            setVoiceCleanJob((prev) => ({ ...prev, status: "failed", error: j.error }));
            return;
          }
          if (j.voiceCleanStatus === "completed" && j.voiceCleanUrl) {
            setVoiceCleanJob({ trackId: voiceCleanJob.trackId, status: "completed" });
            loadCleanedVoiceOntoLane(voiceCleanJob.trackId, voiceCleanJob.sourceName);
            return;
          }
          if (j.voiceCleanStatus === "failed") {
            setVoiceCleanJob((prev) => ({ ...prev, status: "failed", error: j.error }));
            return;
          }
          setVoiceCleanJob((prev) => ({ ...prev, progress: j.progress || 0 }));
        } catch (e) {}
      }
      if (!stopped && tries >= MAX) {
        setVoiceCleanJob((prev) => ({ ...prev, status: "failed", error: "Voice clean timed out (5 min)." }));
      }
    }
    tick();
    return () => { stopped = true; };
  }, [voiceCleanJob?.taskId, voiceCleanJob?.trackId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the cleaned voice onto the next empty lane (or lane 0 if
  // all are full). Different from stem-split's applyStemsToLanes,
  // which always targets lanes 0-3 — for a single cleaned voice we
  // don't want to clobber existing arrangements.
  //
  // Same CORS-avoiding pattern as applyStemsToLanes: routes the
  // audio through the same-origin proxy
  // /api/music/tracks/<id>/audio?source=voice-clean instead of the
  // raw R2 URL.
  async function loadCleanedVoiceOntoLane(parentTrackId, sourceName) {
    if (!parentTrackId) return;
    if (isPlaying) stopAll();
    const targetIdx = lanes.findIndex((l) => !l.trackId);
    const laneIndex = targetIdx === -1 ? 0 : targetIdx;
    const niceName = `🧹 Clean: ${sourceName || "voice"}`;
    const proxySrc = `/api/music/tracks/${parentTrackId}/audio?source=voice-clean`;
    setLanes((prev) =>
      prev.map((l, i) =>
        i === laneIndex
          ? { ...l, trackId: `voice-clean:${Date.now()}`, src: proxySrc, name: niceName, loading: true, error: null }
          : l
      )
    );
    try {
      const { audioBuffer, peaks, duration } = await decodeTrack(proxySrc);
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
          i === laneIndex ? { ...l, loading: false, error: e?.message || "Cleaned voice load failed" } : l
        )
      );
    }
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

  // ── Export mixed WAV ─────────────────────────────────────────
  // Renders the current lane state (mute / solo / volume / master)
  // into a single downloadable WAV file via OfflineAudioContext.
  // All client-side — zero server cost, zero LALAL spend.
  //
  // Mix length is set to the longest loaded lane's duration (or the
  // timeline cap, whichever is shorter). Stereo (mixes mono lanes
  // up). 16-bit PCM at 44.1 kHz = CD-quality, file size is
  // bytes-per-second × duration = ~10 MB/min stereo.
  const [exporting, setExporting] = useState(false);
  async function exportMix() {
    if (exporting) return;
    if (isPlaying) stopAll();
    const audibleLanes = lanes.filter((l) => l.audioBuffer);
    if (audibleLanes.length === 0) {
      flashStemMsg("Load at least one track before exporting");
      return;
    }
    setExporting(true);
    try {
      const sampleRate = 44100;
      const numChannels = 2; // stereo output
      const mixDuration = Math.min(
        TIMELINE_SECONDS,
        Math.max(...audibleLanes.map((l) => l.duration))
      );
      const lengthSamples = Math.ceil(mixDuration * sampleRate);
      const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const offline = new Offline(numChannels, lengthSamples, sampleRate);
      const masterGain = offline.createGain();
      masterGain.gain.value = masterVolume;
      masterGain.connect(offline.destination);
      // Match the live mix: solo overrides mute logic.
      const anySolo = lanes.some((l) => l.solo);
      for (const lane of lanes) {
        if (!lane.audioBuffer) continue;
        const audibleByMute = !lane.muted;
        const audibleBySolo = anySolo ? lane.solo : true;
        const effectiveGain = audibleByMute && audibleBySolo ? lane.volume : 0;
        if (effectiveGain === 0) continue;
        const src = offline.createBufferSource();
        src.buffer = lane.audioBuffer;
        const g = offline.createGain();
        g.gain.value = effectiveGain;
        src.connect(g);
        g.connect(masterGain);
        src.start(0);
      }
      const rendered = await offline.startRendering();
      const wavBytes = audioBufferToWav(rendered);
      const blob = new Blob([wavBytes], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `studio-mix-${stamp}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      flashStemMsg(`✓ Exported studio-mix-${stamp}.wav`);
    } catch (e) {
      console.error("[STUDIO_EXPORT]", e);
      flashStemMsg(`Export failed: ${e?.message || "unknown error"}`);
    } finally {
      setExporting(false);
    }
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
      <VoiceCleanBanner job={voiceCleanJob} onDismiss={() => setVoiceCleanJob(null)} />
      <VocalsSplitBanner job={vocalsSplitJob} onDismiss={() => setVocalsSplitJob(null)} />
      <TransportBar
        isPlaying={isPlaying}
        playhead={playhead}
        masterVolume={masterVolume}
        onPlay={play}
        onPause={pause}
        onStop={stopAll}
        onMasterVolume={setMasterVolume}
        onSeek={seekTo}
        onExport={exportMix}
        exporting={exporting}
        hasAudio={lanes.some((l) => l.audioBuffer)}
        loopEnabled={loopEnabled}
        loopRegion={loopRegion}
        onToggleLoop={() => setLoopEnabled((v) => !v)}
        onClearLoop={() => setLoopRegion(null)}
      />
      <main style={{ display: "flex", height: "calc(100vh - 56px - 60px)", overflow: "hidden" }}>
        <LibrarySidebar
          tracks={library}
          loading={libraryLoading}
          onDragStart={handleDragStart}
          onTap={loadIntoNextEmptyLane}
          onSplitStems={splitStems}
          onCleanVoice={cleanVoice}
          onSplitVocals={splitVocals}
          stemJob={stemJob}
          voiceCleanJob={voiceCleanJob}
          vocalsSplitJob={vocalsSplitJob}
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
          loopRegion={loopRegion}
          onSetLoopRegion={setLoopRegion}
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

// Banner shown above the transport bar while a voice-clean job is
// running. Same shape as StemJobBanner but with a blue accent so
// users can tell at a glance which operation is in flight.
function VoiceCleanBanner({ job, onDismiss }) {
  if (!job) return null;
  if (job.status === "completed") {
    return (
      <div
        style={{
          padding: "10px 16px",
          background: "rgba(96,165,250,0.10)",
          borderBottom: `1px solid rgba(96,165,250,0.40)`,
          fontSize: 12.5,
          color: "#93c5fd",
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span>✓ Cleaned voice loaded onto next empty lane — background noise removed.</span>
        <button
          onClick={onDismiss}
          style={{
            marginLeft: "auto",
            padding: "3px 8px",
            background: "transparent",
            border: "1px solid rgba(96,165,250,0.50)",
            borderRadius: 6,
            color: "#93c5fd",
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
        <span>✕ Voice clean failed: {job.error || "Unknown error"}. Credits refunded.</span>
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
        🧹 Cleaning voice on <b style={{ color: C.text }}>{job.sourceName || "track"}</b>…
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
            background: "linear-gradient(90deg, #60a5fa, #3b82f6)",
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

// Banner above the transport bar while a lead+backing vocals
// split is running. Purple accent so users can distinguish at a
// glance from the lime (stem split) + blue (voice clean) banners.
function VocalsSplitBanner({ job, onDismiss }) {
  if (!job) return null;
  if (job.status === "completed") {
    return (
      <div
        style={{
          padding: "10px 16px",
          background: "rgba(196,181,253,0.10)",
          borderBottom: `1px solid rgba(196,181,253,0.40)`,
          fontSize: 12.5,
          color: "#c4b5fd",
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span>✓ Lead + backing vocals loaded onto next empty lanes.</span>
        <button
          onClick={onDismiss}
          style={{
            marginLeft: "auto",
            padding: "3px 8px",
            background: "transparent",
            border: "1px solid rgba(196,181,253,0.50)",
            borderRadius: 6,
            color: "#c4b5fd",
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
        <span>✕ Vocals split failed: {job.error || "Unknown error"}. Credits refunded.</span>
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
        🎤 Splitting lead + backing vocals on <b style={{ color: C.text }}>{job.sourceName || "track"}</b>…
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
            background: "linear-gradient(90deg, #c4b5fd, #8b5cf6)",
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
function TransportBar({ isPlaying, playhead, masterVolume, onPlay, onPause, onStop, onMasterVolume, onSeek, onExport, exporting, hasAudio, loopEnabled, loopRegion, onToggleLoop, onClearLoop }) {
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
      {/* 🔁 Loop toggle. Active state = lime border + lime icon.
          When there's a loop region defined, an "×" appears next
          to it to clear the region. */}
      {onToggleLoop && (
        <button
          onClick={onToggleLoop}
          aria-label={loopEnabled ? "Disable loop" : "Enable loop"}
          title={
            loopRegion
              ? loopEnabled
                ? `Loop ON · ${formatTime(loopRegion.start)} → ${formatTime(loopRegion.end)}`
                : `Loop OFF · drag on ruler to set region`
              : "Loop · drag on the time ruler to set in/out points"
          }
          style={{
            ...transportBtnStyle(),
            background: loopEnabled && loopRegion ? "rgba(217,255,0,0.15)" : C.panel,
            border: `1px solid ${loopEnabled && loopRegion ? C.accent : C.border}`,
            color: loopEnabled && loopRegion ? C.accent : C.textSoft,
          }}
        >
          🔁
        </button>
      )}
      {loopRegion && onClearLoop && (
        <button
          onClick={onClearLoop}
          aria-label="Clear loop region"
          title="Clear loop region"
          style={{
            ...transportBtnStyle(),
            width: 28,
            height: 28,
            fontSize: 12,
            color: C.muted,
          }}
        >
          ×
        </button>
      )}
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
      {/* 🎧 Export — renders the current mix (respecting mute /
          solo / volume / master) to a WAV file via
          OfflineAudioContext + downloads it. Client-side only,
          zero server cost. Disabled while a render is in flight
          OR when no audio is loaded. */}
      {onExport && (
        <button
          onClick={onExport}
          disabled={exporting || !hasAudio}
          aria-label="Export mix as WAV"
          title={
            !hasAudio
              ? "Load at least one track first"
              : exporting
                ? "Rendering mix…"
                : "Export current mix as WAV (free, client-side)"
          }
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            background: exporting
              ? C.panelSoft
              : !hasAudio
                ? C.panelSoft
                : `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
            border: `1px solid ${exporting || !hasAudio ? C.border : C.accent}`,
            color: exporting || !hasAudio ? C.muted : "#0a0a0a",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.04em",
            cursor: exporting || !hasAudio ? "default" : "pointer",
            fontFamily: "inherit",
            marginRight: 14,
            whiteSpace: "nowrap",
          }}
        >
          {exporting ? "Rendering…" : "🎧 Export WAV"}
        </button>
      )}
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
function LibrarySidebar({ tracks, loading, onDragStart, onTap, onSplitStems, onCleanVoice, onSplitVocals, stemJob, voiceCleanJob, vocalsSplitJob }) {
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
          const isThisCleaning = voiceCleanJob?.trackId === t.id && voiceCleanJob?.status === "processing";
          const isThisVocalsSplitting = vocalsSplitJob?.trackId === t.id && vocalsSplitJob?.status === "processing";
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
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                {onSplitStems && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSplitStems(t); }}
                    disabled={isThisSplitting}
                    title={
                      isThisSplitting
                        ? "Splitting in progress…"
                        : "Split into 6 stems (vocals/drum/bass/piano/electric_guitar/acoustic_guitar) · 30 credits"
                    }
                    style={{
                      padding: "4px 9px",
                      borderRadius: 999,
                      background: isThisSplitting ? C.accentSoft : "transparent",
                      border: `1px solid ${C.borderHover}`,
                      color: C.accent,
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      cursor: isThisSplitting ? "default" : "pointer",
                      fontFamily: "inherit",
                      opacity: isThisSplitting ? 0.7 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isThisSplitting ? "…" : "🔬 Split"}
                  </button>
                )}
                {onSplitVocals && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSplitVocals(t); }}
                    disabled={isThisVocalsSplitting}
                    title={
                      isThisVocalsSplitting
                        ? "Splitting vocals…"
                        : "Split vocal into lead + backing harmonies · 10 credits"
                    }
                    style={{
                      padding: "4px 9px",
                      borderRadius: 999,
                      background: isThisVocalsSplitting ? "rgba(196,181,253,0.20)" : "transparent",
                      border: "1px solid rgba(196,181,253,0.55)",
                      color: "#c4b5fd",
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      cursor: isThisVocalsSplitting ? "default" : "pointer",
                      fontFamily: "inherit",
                      opacity: isThisVocalsSplitting ? 0.7 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isThisVocalsSplitting ? "…" : "🎤 Vocals"}
                  </button>
                )}
                {onCleanVoice && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onCleanVoice(t); }}
                    disabled={isThisCleaning}
                    title={
                      isThisCleaning
                        ? "Cleaning voice…"
                        : "Strip background noise from the vocal · 6 credits"
                    }
                    style={{
                      padding: "4px 9px",
                      borderRadius: 999,
                      background: isThisCleaning ? "rgba(96,165,250,0.20)" : "transparent",
                      border: "1px solid rgba(96,165,250,0.50)",
                      color: "#93c5fd",
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      cursor: isThisCleaning ? "default" : "pointer",
                      fontFamily: "inherit",
                      opacity: isThisCleaning ? 0.7 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isThisCleaning ? "…" : "🧹 Clean"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
    </aside>
  );
}

// ── Timeline area ────────────────────────────────────────────────
function TimelineArea({ lanes, playhead, timelineSeconds, pixelsPerSecond, timelineWidth, onDrop, onDragOver, onVolume, onToggleMute, onToggleSolo, onClear, onSeek, loopRegion, onSetLoopRegion }) {
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
        loopRegion={loopRegion}
        onSetLoopRegion={onSetLoopRegion}
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
        {/* Loop region overlay spanning all lanes — purely visual,
            mirrors the yellow band on the time ruler so users can
            see which slice of the timeline will be looped. */}
        {loopRegion && loopRegion.end > loopRegion.start && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 220 + loopRegion.start * pixelsPerSecond,
              width: (loopRegion.end - loopRegion.start) * pixelsPerSecond,
              background: "rgba(217,255,0,0.06)",
              borderLeft: `1px dashed rgba(217,255,0,0.5)`,
              borderRight: `1px dashed rgba(217,255,0,0.5)`,
              pointerEvents: "none",
              zIndex: 2,
            }}
          />
        )}
        <Playhead playhead={playhead} pixelsPerSecond={pixelsPerSecond} />
      </div>
    </div>
  );
}

// Time ruler — minute:second ticks across the top of the timeline.
// Two interactions:
//   • Single click → scrub the playhead to that second.
//   • Click + drag → create a loop region (yellow overlay between
//                    start/end). Drag-distance threshold of 5px
//                    separates "drag" from "click" so users don't
//                    accidentally create tiny regions by jitter.
// Cursor: pointer + tooltip explain both modes.
function TimeRuler({ timelineSeconds, pixelsPerSecond, timelineWidth, onSeek, loopRegion, onSetLoopRegion }) {
  function handleMouseDown(e) {
    if (!onSeek) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const startX = e.clientX;
    const startT = (e.clientX - rect.left) / pixelsPerSecond;
    let didDrag = false;
    function onMove(ev) {
      const dx = Math.abs(ev.clientX - startX);
      if (dx < 5) return; // jitter — keep waiting
      didDrag = true;
      if (!onSetLoopRegion) return;
      const curT = (ev.clientX - rect.left) / pixelsPerSecond;
      const minT = Math.max(0, Math.min(startT, curT));
      const maxT = Math.min(timelineSeconds, Math.max(startT, curT));
      // Live-update during drag so the user sees the region grow.
      onSetLoopRegion({ start: minT, end: maxT });
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!didDrag) {
        // Pure click → seek. Don't touch loop region.
        onSeek(startT);
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
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
        onMouseDown={handleMouseDown}
        title="Click to jump the playhead · Drag to create a loop region"
        style={{
          position: "relative",
          width: timelineWidth,
          height: 28,
          cursor: onSeek ? "pointer" : "default",
          userSelect: "none",
        }}
      >
        {/* Loop region highlight — rendered BEFORE labels so the
            ticks stay readable above the yellow band. */}
        {loopRegion && loopRegion.end > loopRegion.start && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: loopRegion.start * pixelsPerSecond,
              width: (loopRegion.end - loopRegion.start) * pixelsPerSecond,
              background: "rgba(217,255,0,0.18)",
              borderLeft: `2px solid ${C.accent}`,
              borderRight: `2px solid ${C.accent}`,
              pointerEvents: "none",
            }}
          />
        )}
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

// Encode an AudioBuffer to a standard WAV file (PCM 16-bit
// interleaved). Used by the Export button to convert the
// OfflineAudioContext render into a downloadable file.
//
// File layout: 44-byte RIFF/WAVE header followed by the
// interleaved sample data. Channels are clamped to [-1,1] then
// scaled to 16-bit signed integers (-32768..32767) — standard
// CD-quality PCM that opens in any audio app or DAW.
//
// Returns an ArrayBuffer ready to be wrapped in a Blob.
function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const numFrames = buffer.length;
  const dataSize = numFrames * blockAlign;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);
  // RIFF header
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  // fmt chunk
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);     // chunk size
  view.setUint16(20, 1, true);      // format = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  // data chunk
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);
  // Interleaved PCM samples
  const channels = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));
  let pos = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      let s = channels[c][i];
      s = Math.max(-1, Math.min(1, s));
      const intSample = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(pos, intSample | 0, true);
      pos += 2;
    }
  }
  return out;
}

function writeAscii(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
