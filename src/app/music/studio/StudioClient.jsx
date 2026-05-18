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
// Nine colour hues — one per lane — so a fully-loaded Pro 9-stem
// mix reads as nine distinct visual streams. Spread across the
// colour wheel so adjacent lanes don't blur into each other. The
// first 6 are the standard multistem set; the last 3 land
// synthesizer / strings / wind (Pro 9-stem split) onto lanes 6-8.
const LANE_HUES = [70, 195, 320, 25, 270, 145, 0, 240, 100]; // lime, cyan, magenta, orange, purple, green, red, deep-blue, chartreuse
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

  // ── Lane selection ───────────────────────────────────────────
  // Single-select. Click a lane's waveform area to select it; press
  // Delete/Backspace (or use the right-click menu) to clear it.
  const [selectedLaneIndex, setSelectedLaneIndex] = useState(null);
  // Right-click context-menu state: { laneIndex, x, y } in viewport
  // coords, or null when closed.
  const [laneContext, setLaneContext] = useState(null);

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
              customName: typeof s.customName === "string" ? s.customName : null,
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
      // Optional user-set rename — survives across reloads via the
      // existing localStorage persistence loop. Falls through to
      // `name` when null.
      customName: null,
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
  // BPM for the bar-grid overlay on the time ruler. Auto-resolved
  // from the first non-empty library-track lane's tempo; user can
  // override via the BPM input in the transport bar. null = no bar
  // grid drawn.
  const [mixBpmOverride, setMixBpmOverride] = useState(null);
  // Resolve effective BPM. We track tempo on each lane as part of
  // the lane object now (see loadLane below). For stems/voice-clean
  // results that don't carry an explicit tempo, we fall back to the
  // FIRST lane in the row that has one — usually the source the
  // user split, since stems land on lanes 0-N.
  const resolvedBpm = useMemo(() => {
    if (Number.isFinite(mixBpmOverride) && mixBpmOverride > 0) return mixBpmOverride;
    for (const l of lanes) {
      if (l.tempo && l.tempo > 0) return l.tempo;
    }
    return null;
  }, [lanes, mixBpmOverride]);
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
            customName: l.customName,
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

  // Helper — derive a "best guess" BPM for the current mix. Uses
  // the FIRST non-empty lane's stored tempo. If lanes hold stems
  // from a parent track, we look up the parent's tempo via the
  // library cache. Falls back to user's manual override
  // (mixBpmOverride) if set, else null (no bar grid drawn).
  // Centralised here so the time ruler stays a pure component.
  // (defined later — see mixBpm useMemo right below the lane state)

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
          ? { ...l, trackId: track.id, src, name: track.title, tempo: track.tempo || null, loading: true, error: null }
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
    // Drop selection if the cleared lane was the selected one.
    setSelectedLaneIndex((prev) => (prev === laneIndex ? null : prev));
  }

  // Delete / Backspace clears the currently selected lane. Skips when
  // the user is typing in an input/textarea/contenteditable so the
  // rename + search boxes aren't affected.
  useEffect(() => {
    function onKey(e) {
      if (selectedLaneIndex == null) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
      const lane = lanes[selectedLaneIndex];
      if (!lane?.trackId) return;
      e.preventDefault();
      clearLane(selectedLaneIndex);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedLaneIndex, lanes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stem separation (LALAL.AI) ───────────────────────────────
  // Kick off a stem split on a library track. Two modes:
  //   • 6stem (default, 30 credits): vocals/drum/bass/piano/
  //     electric_guitar/acoustic_guitar via one multistem call.
  //   • 9stem (Pro, 50 credits): the 6 above PLUS synthesizer/
  //     strings/wind via 3 extra stem_separator calls on the
  //     phoenix splitter. R6 2026-05-18.
  // Order matters — we lock the stem→lane mapping here so users
  // know which lane to expect each stem on. For 6stem mode only
  // the first 6 entries will resolve; the iteration in
  // applyStemsToLanes skips labels that aren't in the result.
  const STEM_LANE_ORDER = ["vocals", "drum", "bass", "piano", "electric_guitar", "acoustic_guitar", "synthesizer", "strings", "wind"];
  // Per-stem default volumes that feel balanced out-of-the-box.
  // All-lanes-at-0.85 made the mix muddy + felt like "raw output
  // dropped onto lanes." These defaults treat vocals as the focal
  // element + everything else underneath, like a real producer
  // would start a mix.
  const STEM_VOLUME_DEFAULTS = {
    vocals: 0.95,
    drum: 0.80,
    bass: 0.72,
    piano: 0.75,
    electric_guitar: 0.72,
    acoustic_guitar: 0.72,
    synthesizer: 0.68,
    strings: 0.70,
    wind: 0.68,
  };
  // Sent to the server as { stems: [...] } — we ask only for the
  // 6 standard stems regardless of mode. The 3 extra Pro stems are
  // dispatched server-side via separate stem_separator calls and
  // merged into studioStems on completion.
  const STEM_REQUEST_SET = STEM_LANE_ORDER.slice(0, 6);
  async function splitStems(track, mode = "6stem") {
    if (!track?.id) return;
    if (stemJob && stemJob.status === "processing") {
      flashStemMsg("Already splitting — wait for it to finish");
      return;
    }
    setStemJob({ trackId: track.id, status: "starting", progress: 0, sourceName: track.title, mode });
    try {
      const res = await fetch("/api/music/studio/stems/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id, stems: STEM_REQUEST_SET, mode }),
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
    // Resolve parent track's tempo so stems carry the same BPM
    // for the bar-grid overlay.
    const parentTrack = library.find((t) => t.id === parentTrackId);
    const parentTempo = parentTrack?.tempo || null;
    // Load each stem onto its predetermined lane in STEM_LANE_ORDER.
    for (let i = 0; i < STEM_LANE_ORDER.length && i < LANE_COUNT; i++) {
      const label = STEM_LANE_ORDER[i];
      const rawUrl = cleaned[label];
      if (!rawUrl) continue;
      // Same-origin proxy URL — see comment above for why.
      const proxySrc = `/api/music/tracks/${parentTrackId}/audio?source=stem-${encodeURIComponent(label)}`;
      // Auto-balance: per-stem default volume from STEM_VOLUME_DEFAULTS
      // so the mix sounds reasonable immediately instead of all-loud
      // muddy. User can adjust each slider afterwards.
      const defaultVolume = STEM_VOLUME_DEFAULTS[label] ?? 0.85;
      setLanes((prev) =>
        prev.map((l, idx) =>
          idx === i
            ? { ...l, trackId: `stem:${label}`, src: proxySrc, name: `Stem: ${label}`, tempo: parentTempo, volume: defaultVolume, muted: false, solo: false, loading: true, error: null }
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
    const parentTrack = library.find((t) => t.id === parentTrackId);
    const parentTempo = parentTrack?.tempo || null;
    const candidates = [];
    // Auto-balance: lead loud (it IS the song), backing softer
    // (harmony layer). User can tweak after.
    if (vocalsSplit.lead)    candidates.push({ label: "lead",    display: `🎤 Lead: ${sourceName || ""}`,    volume: 0.95 });
    if (vocalsSplit.backing) candidates.push({ label: "backing", display: `🎶 Backing: ${sourceName || ""}`, volume: 0.55 });
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
            ? { ...l, trackId: `vocals-${c.label}:${parentTrackId}`, src: proxySrc, name: c.display, tempo: parentTempo, volume: c.volume, muted: false, solo: false, loading: true, error: null }
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
    const parentTrack = library.find((t) => t.id === parentTrackId);
    const parentTempo = parentTrack?.tempo || null;
    setLanes((prev) =>
      prev.map((l, i) =>
        i === laneIndex
          ? { ...l, trackId: `voice-clean:${Date.now()}`, src: proxySrc, name: niceName, tempo: parentTempo, volume: 0.92, muted: false, solo: false, loading: true, error: null }
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

  // Render an array of lanes to a single mixed-down AudioBuffer
  // using OfflineAudioContext. Shared by exportMix (renders the
  // FULL mix with solo/mute respected) and exportAllStems (renders
  // each lane in isolation).
  //
  // `applyMix`: when true, respects current mute/solo + uses each
  // lane's user-set volume. When false, treats each lane as
  // standalone (always audible, gain 1.0) — used for individual-stem
  // export so the user gets the raw stem, not their mix balance.
  async function renderLanesToWav(laneList, opts = {}) {
    const { applyMix = true } = opts;
    const sampleRate = 44100;
    const numChannels = 2;
    const dur = Math.min(
      TIMELINE_SECONDS,
      Math.max(...laneList.map((l) => l.duration || 0), 0.001)
    );
    const lengthSamples = Math.ceil(dur * sampleRate);
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const offline = new Offline(numChannels, lengthSamples, sampleRate);
    const masterGain = offline.createGain();
    masterGain.gain.value = applyMix ? masterVolume : 1.0;
    masterGain.connect(offline.destination);
    const anySolo = applyMix ? lanes.some((l) => l.solo) : false;
    for (const lane of laneList) {
      if (!lane.audioBuffer) continue;
      let effectiveGain;
      if (applyMix) {
        const audibleByMute = !lane.muted;
        const audibleBySolo = anySolo ? lane.solo : true;
        effectiveGain = audibleByMute && audibleBySolo ? lane.volume : 0;
        if (effectiveGain === 0) continue;
      } else {
        effectiveGain = 1.0;
      }
      const src = offline.createBufferSource();
      src.buffer = lane.audioBuffer;
      const g = offline.createGain();
      g.gain.value = effectiveGain;
      src.connect(g);
      g.connect(masterGain);
      src.start(0);
    }
    return await offline.startRendering();
  }

  // Convert an AudioBuffer → WAV → Blob → trigger download.
  // Used by both the mix export and individual-stem export.
  function downloadAudioBufferAsWav(buffer, filename) {
    const wavBytes = audioBufferToWav(buffer);
    const blob = new Blob([wavBytes], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

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
      const rendered = await renderLanesToWav(audibleLanes, { applyMix: true });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadAudioBufferAsWav(rendered, `studio-mix-${stamp}.wav`);
      flashStemMsg(`✓ Exported studio-mix-${stamp}.wav`);
    } catch (e) {
      console.error("[STUDIO_EXPORT]", e);
      flashStemMsg(`Export failed: ${e?.message || "unknown error"}`);
    } finally {
      setExporting(false);
    }
  }

  // Export each loaded lane as its own WAV file. No mix/solo logic
  // applied — each stem comes out raw at gain 1.0 so the user gets
  // the original audio they can re-mix in their own DAW. Sequential
  // downloads with a small delay so the browser doesn't swallow
  // any of them. Modern browsers ask "Allow multiple downloads?"
  // once on the first hit; user clicks Allow and the rest cascade.
  async function exportAllStems() {
    if (exporting) return;
    if (isPlaying) stopAll();
    const audibleLanes = lanes.filter((l) => l.audioBuffer);
    if (audibleLanes.length === 0) {
      flashStemMsg("Load at least one stem before exporting");
      return;
    }
    setExporting(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      flashStemMsg(`Rendering ${audibleLanes.length} stems…`);
      // Render all in parallel — OfflineAudioContext is its own
      // worker so they don't fight for the main thread.
      const renders = await Promise.all(
        audibleLanes.map((lane) => renderLanesToWav([lane], { applyMix: false }))
      );
      // Sequential downloads with a small gap so the browser
      // queues them cleanly. Filename uses a safe slug of the lane
      // name + the date stamp.
      for (let i = 0; i < renders.length; i++) {
        const lane = audibleLanes[i];
        const safeName = (lane.name || `stem-${i + 1}`)
          .replace(/[^\w\-]+/g, "_")
          .replace(/_+/g, "_")
          .replace(/^_|_$/g, "")
          .slice(0, 40) || `stem-${i + 1}`;
        downloadAudioBufferAsWav(renders[i], `${safeName}-${stamp}.wav`);
        await new Promise((r) => setTimeout(r, 350));
      }
      flashStemMsg(`✓ Exported ${audibleLanes.length} stems`);
    } catch (e) {
      console.error("[STUDIO_EXPORT_STEMS]", e);
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
  // Rename a lane. Empty/whitespace input clears the customName so
  // the auto-generated name takes over again. Persists across
  // reloads via the existing localStorage save effect.
  function renameLane(i, raw) {
    const v = (raw || "").trim();
    setLanes((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, customName: v || null } : l))
    );
  }

  // Rename a library track. PATCHes the API + optimistically updates
  // the local library list. Empty input is rejected (server returns
  // 400) so we don't try to commit. Any lane already loaded from the
  // renamed track also updates its display name so the timeline
  // stays in sync.
  async function renameLibraryTrack(trackId, raw) {
    const title = (raw || "").trim().slice(0, 80);
    if (!title) return;
    const prev = library;
    const current = prev.find((t) => t.id === trackId);
    if (!current || current.title === title) return;
    // Optimistic update.
    setLibrary((arr) => arr.map((t) => (t.id === trackId ? { ...t, title } : t)));
    setLanes((arr) =>
      arr.map((l) => (l.trackId === trackId ? { ...l, name: title } : l))
    );
    try {
      const res = await fetch(`/api/music/tracks/${trackId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`);
    } catch (e) {
      // Roll back on failure — leave the user with the old name and
      // flash the stem-message banner so they know it didn't stick.
      console.error("[RENAME] failed:", e?.message);
      setLibrary(prev);
      setLanes((arr) =>
        arr.map((l) => (l.trackId === trackId ? { ...l, name: current.title } : l))
      );
      flashStemMsg("Rename failed — try again");
    }
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
        onExportStems={exportAllStems}
        exporting={exporting}
        hasAudio={lanes.some((l) => l.audioBuffer)}
        loopEnabled={loopEnabled}
        loopRegion={loopRegion}
        onToggleLoop={() => setLoopEnabled((v) => !v)}
        onClearLoop={() => setLoopRegion(null)}
        resolvedBpm={resolvedBpm}
        onBpmOverride={setMixBpmOverride}
      />
      <main style={{ display: "flex", height: "calc(100vh - 56px - 60px)", overflow: "hidden" }}>
        <LibrarySidebar
          tracks={library}
          loading={libraryLoading}
          onDragStart={handleDragStart}
          onTap={loadIntoNextEmptyLane}
          onSplitStems={splitStems}
          onSplitStemsPro={(t) => splitStems(t, "9stem")}
          onCleanVoice={cleanVoice}
          onSplitVocals={splitVocals}
          onRenameTrack={renameLibraryTrack}
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
          onRename={renameLane}
          onClear={clearLane}
          onSeek={seekTo}
          loopRegion={loopRegion}
          onSetLoopRegion={setLoopRegion}
          mixBpm={resolvedBpm}
          selectedLaneIndex={selectedLaneIndex}
          onSelectLane={setSelectedLaneIndex}
          onLaneContextMenu={(i, e) => {
            e.preventDefault();
            setSelectedLaneIndex(i);
            setLaneContext({ laneIndex: i, x: e.clientX, y: e.clientY });
          }}
        />
      </main>
      {laneContext && (
        <LaneContextMenu
          x={laneContext.x}
          y={laneContext.y}
          onClose={() => setLaneContext(null)}
          onDelete={() => {
            clearLane(laneContext.laneIndex);
            setLaneContext(null);
          }}
        />
      )}
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
function TransportBar({ isPlaying, playhead, masterVolume, onPlay, onPause, onStop, onMasterVolume, onSeek, onExport, onExportStems, exporting, hasAudio, loopEnabled, loopRegion, onToggleLoop, onClearLoop, resolvedBpm, onBpmOverride }) {
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
      <TransportBtn
        onClick={onStop}
        title="Stop"
        ariaLabel="Stop"
      >
        ⏹
      </TransportBtn>
      <TransportBtn
        onClick={isPlaying ? onPause : onPlay}
        title={isPlaying ? "Pause" : "Play (Space)"}
        ariaLabel={isPlaying ? "Pause" : "Play"}
        active={isPlaying}
        width={48}
      >
        {isPlaying ? "❚❚" : "▶"}
      </TransportBtn>
      {/* Loop control — uses LoopControl below so the hover-state
          handlers + alignment logic are isolated from the rest of
          the transport bar's JSX. */}
      {onToggleLoop && (
        <LoopControl
          loopEnabled={loopEnabled}
          loopRegion={loopRegion}
          onToggleLoop={onToggleLoop}
          onClearLoop={onClearLoop}
        />
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
      {/* BPM input — auto-resolves from the first loaded lane's
          tempo, user can override. When BPM is set, the time
          ruler draws musical bar markers in the lime brand color. */}
      {(onBpmOverride !== undefined) && (
        <BpmInput resolvedBpm={resolvedBpm} onOverride={onBpmOverride} />
      )}
      <div style={{ flex: 1 }} />
      {/* Keyboard hint — discoverable text so users learn the
          DAW-standard shortcuts without needing docs. */}
      <span style={{ fontSize: 10.5, color: C.muted, marginRight: 14, display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <KbdHint k="Space">play / pause</KbdHint>
        <KbdHint k="Esc">stop</KbdHint>
        <KbdHint k="Home">to start</KbdHint>
      </span>
      {/* 🎧 Export — split button: main click = export the mix,
          chevron opens a dropdown with the "export individual
          stems" option. Client-side render via OfflineAudioContext,
          zero server cost. */}
      {onExport && (
        <ExportSplitButton
          onExportMix={onExport}
          onExportStems={onExportStems}
          exporting={exporting}
          hasAudio={hasAudio}
        />
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

// BPM input — small editable number field in the transport bar.
// Auto-fills from the first loaded lane's stored tempo (via
// `resolvedBpm`), but the user can type any value to override.
// Empty input clears the override → resolved BPM (if any) takes
// over. Numeric input, clamped to 30-300 BPM (well past any
// realistic music). When a BPM is set, the time ruler renders
// musical bar markers in the brand lime color.
function BpmInput({ resolvedBpm, onOverride }) {
  const [text, setText] = useState("");
  // Sync the visible value to the resolved BPM unless the user is
  // actively typing (text non-empty).
  useEffect(() => {
    if (text === "" && resolvedBpm) setText(String(resolvedBpm));
    if (text === "" && !resolvedBpm) setText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedBpm]);
  function commit(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 30 || n > 300) {
      // Reset to resolvedBpm or blank.
      setText(resolvedBpm ? String(resolvedBpm) : "");
      onOverride(null);
      return;
    }
    onOverride(n);
  }
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
      <span style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, letterSpacing: "0.06em" }}>BPM</span>
      <input
        type="number"
        min={30}
        max={300}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder="—"
        title="Beats per minute. Auto-fills from the loaded track. When set, loop drags + clicks snap to bar boundaries — hold Shift while dragging to bypass snap."
        style={{
          width: 56,
          padding: "6px 8px",
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          color: resolvedBpm ? C.accent : C.textSoft,
          fontSize: 12.5,
          fontWeight: 800,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontVariantNumeric: "tabular-nums",
          textAlign: "center",
          outline: "none",
        }}
      />
    </div>
  );
}

// Split button for Export — main click runs the mix export, the
// chevron half opens a small popover with "Export each stem
// separately" as a secondary option. Filmmakers usually want the
// MIX (primary action), but stems-separately is the killer
// secondary action so they can re-mix in their own DAW.
function ExportSplitButton({ onExportMix, onExportStems, exporting, hasAudio }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);
  // Close on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e) {
      if (!wrapRef.current || !wrapRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);
  const disabled = exporting || !hasAudio;
  const limeBg = `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`;
  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", display: "inline-flex", marginRight: 14 }}
    >
      <button
        onClick={onExportMix}
        disabled={disabled}
        title={
          !hasAudio
            ? "Load at least one track first"
            : exporting
              ? "Rendering…"
              : "Export current mix as a single WAV (free, client-side)"
        }
        style={{
          padding: "8px 14px",
          borderRadius: "8px 0 0 8px",
          background: disabled ? C.panelSoft : limeBg,
          border: `1px solid ${disabled ? C.border : C.accent}`,
          borderRight: "none",
          color: disabled ? C.muted : "#0a0a0a",
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: "0.04em",
          cursor: disabled ? "default" : "pointer",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        {exporting ? "Rendering…" : "🎧 Export WAV"}
      </button>
      {onExportStems && (
        <button
          onClick={() => !disabled && setMenuOpen((o) => !o)}
          disabled={disabled}
          aria-label="More export options"
          title="More export options"
          style={{
            padding: "0 10px",
            borderRadius: "0 8px 8px 0",
            background: disabled ? C.panelSoft : limeBg,
            border: `1px solid ${disabled ? C.border : C.accent}`,
            borderLeft: disabled
              ? `1px solid ${C.border}`
              : "1px solid rgba(0,0,0,0.22)",
            color: disabled ? C.muted : "#0a0a0a",
            fontSize: 11,
            fontWeight: 800,
            cursor: disabled ? "default" : "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          ▾
        </button>
      )}
      {menuOpen && onExportStems && (
        <div
          style={{
            position: "absolute",
            top: 42,
            right: 0,
            minWidth: 220,
            background: C.panel,
            border: `1px solid ${C.borderHover}`,
            borderRadius: 10,
            padding: 6,
            boxShadow: "0 18px 48px -12px rgba(0,0,0,0.85)",
            zIndex: 50,
          }}
        >
          <button
            onClick={() => { setMenuOpen(false); onExportMix(); }}
            style={dropdownItemStyle()}
          >
            🎧 Export mix (single WAV)
          </button>
          <button
            onClick={() => { setMenuOpen(false); onExportStems(); }}
            style={dropdownItemStyle()}
          >
            📦 Export each stem (separate WAVs)
          </button>
        </div>
      )}
    </div>
  );
}

function dropdownItemStyle() {
  return {
    width: "100%",
    padding: "9px 12px",
    background: "transparent",
    border: "none",
    color: C.text,
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
    borderRadius: 6,
    transition: "background 0.12s",
  };
}

// Unified transport-bar button — handles its own hover state so
// every button in the bar (stop, play/pause, loop) shows the SAME
// "lime icon + lime fill when active or hovered" treatment.
//
// Before this, the stop button was muted grey and the loop button's
// inactive state was grey — only the play button felt clickable.
// Arman flagged 2026-05-18 that the others should feel the same.
//
// Visual states (per the play button's pattern):
//   • idle      — lime glyph on dark panel + dim border
//   • hover     — lime fill 10% wash + bright border + lime glyph
//   • active    — solid lime fill + dark glyph (the "pressed-on" look)
//   • active+hover — same as active but uses accentDark for the press
//                    feedback of "I'm about to release"
function TransportBtn({ onClick, children, title, ariaLabel, active = false, width = 38, height = 38 }) {
  const [hover, setHover] = useState(false);
  // Resolve the three colour properties from the active/hover combo.
  const bg = active
    ? (hover ? C.accentDark : C.accent)
    : (hover ? "rgba(217,255,0,0.12)" : C.panel);
  const border = active
    ? C.accent
    : (hover ? C.borderHover : C.border);
  const fg = active
    ? "#0a0a0a"
    : C.accent;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title}
      aria-label={ariaLabel || title}
      style={{
        width,
        height,
        minWidth: width,
        borderRadius: 8,
        background: bg,
        border: `1px solid ${border}`,
        color: fg,
        fontSize: 14,
        cursor: "pointer",
        fontFamily: "inherit",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 0.12s, color 0.12s, border-color 0.12s",
      }}
    >
      {children}
    </button>
  );
}

// Loop control — extracted from TransportBar so the hover-state
// + click-target logic isn't tangled with the rest of the bar.
//
// Two visual forms:
//   1. No region yet — single 38×38 button with the ↻ glyph
//      perfectly centered (matches the other transport buttons:
//      same size, same monochrome glyph aesthetic).
//   2. Region exists — expands into a "segment pill" with two
//      independently clickable halves:
//        • Left half  (↻ + "0:30 → 1:00"): toggle loop on/off.
//        • Right half (×):                  clear the region.
//      They share a rounded outline so they read as ONE control.
//
// Bug fix 2026-05-18: the standalone-button case was missing
// justifyContent:"center" + the inner glyph had no flex-shrink:0,
// so on some browsers the ↻ floated to the upper-left of the
// 38×38 box instead of dead-centering. Now explicit on both
// states. Hover states added for better click affordance.
function LoopControl({ loopEnabled, loopRegion, onToggleLoop, onClearLoop }) {
  const [toggleHover, setToggleHover] = useState(false);
  const [clearHover, setClearHover] = useState(false);

  const isActive = loopEnabled && loopRegion;
  // Resolve toggle-button visual state. Matches the TransportBtn
  // pattern (lime icon by default, lime fill when active or hovered)
  // so the loop pill reads as a sibling of the stop / play buttons.
  const toggleBg = isActive
    ? toggleHover ? C.accentDark : C.accent
    : toggleHover ? "rgba(217,255,0,0.12)" : C.panel;
  const toggleBorder = isActive ? C.accent : (toggleHover ? C.borderHover : C.border);
  const toggleFg = isActive ? "#0a0a0a" : C.accent;

  return (
    <div style={{ display: "inline-flex", alignItems: "stretch", height: 38 }}>
      <button
        type="button"
        onClick={onToggleLoop}
        onMouseEnter={() => setToggleHover(true)}
        onMouseLeave={() => setToggleHover(false)}
        aria-label={loopEnabled ? "Disable loop" : "Enable loop"}
        title={
          loopRegion
            ? loopEnabled
              ? `Loop ON · ${formatTime(loopRegion.start)} → ${formatTime(loopRegion.end)} · click to disable`
              : `Loop OFF · click to enable`
            : "Loop — drag on the time ruler to set in/out points"
        }
        style={{
          height: 38,
          padding: loopRegion ? "0 12px" : 0,
          width: loopRegion ? "auto" : 38,
          minWidth: 38,
          borderRadius: loopRegion ? "8px 0 0 8px" : 8,
          background: toggleBg,
          border: `1px solid ${toggleBorder}`,
          borderRight: loopRegion ? "none" : `1px solid ${toggleBorder}`,
          color: toggleFg,
          fontSize: 14,
          fontWeight: 800,
          cursor: "pointer",
          fontFamily: "inherit",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          whiteSpace: "nowrap",
          transition: "background 0.12s, color 0.12s, border-color 0.12s",
        }}
      >
        <span style={{
          fontSize: 18,
          lineHeight: 1,
          fontWeight: 400,
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          ↻
        </span>
        {loopRegion && (
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "0.02em",
            lineHeight: 1,
          }}>
            {formatTime(loopRegion.start)} → {formatTime(loopRegion.end)}
          </span>
        )}
      </button>
      {loopRegion && onClearLoop && (
        <button
          type="button"
          onClick={onClearLoop}
          onMouseEnter={() => setClearHover(true)}
          onMouseLeave={() => setClearHover(false)}
          aria-label="Clear loop region"
          title="Clear loop region"
          style={{
            height: 38,
            width: 30,
            minWidth: 30,
            borderRadius: "0 8px 8px 0",
            background: isActive
              ? (clearHover ? C.accentDark : C.accent)
              : (clearHover ? "rgba(217,255,0,0.12)" : C.panel),
            border: `1px solid ${isActive ? C.accent : (clearHover ? C.borderHover : C.border)}`,
            borderLeft: isActive
              ? "1px solid rgba(0,0,0,0.22)"
              : `1px solid ${C.border}`,
            color: isActive ? "#0a0a0a" : C.accent,
            fontSize: 16,
            lineHeight: 1,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.12s, color 0.12s, border-color 0.12s",
          }}
        >
          ×
        </button>
      )}
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

// Single action-pill on a library track row. Consolidates the
// three buttons (🔬 Split / 🎤 Vocals / 🧹 Clean) — same shape,
// same hover treatment — and surfaces the credit cost inline so
// users see the price before they click instead of discovering
// it via the tooltip after.
function ActionPill({ label, cost, busy, title, color, borderColor, activeBg, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={busy ? title : `${title} · ${cost} credits`}
      style={{
        padding: "6px 10px",
        borderRadius: 999,
        background: busy ? activeBg : "transparent",
        border: `1px solid ${borderColor}`,
        color,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: "0.04em",
        cursor: busy ? "default" : "pointer",
        fontFamily: "inherit",
        opacity: busy ? 0.7 : 1,
        whiteSpace: "nowrap",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        width: "100%",
      }}
    >
      <span>{busy ? "…" : label}</span>
      {!busy && (
        <span style={{
          fontSize: 9,
          fontWeight: 600,
          opacity: 0.7,
          letterSpacing: 0,
        }}>
          {cost}c
        </span>
      )}
    </button>
  );
}

// One library row's title — clickable to rename inline. Double-click
// to enter edit mode; Enter or blur commits, Escape cancels. Mirrors
// the lane-rename UX in LaneHeader so the two surfaces feel the same.
function LibraryTrackTitle({ title, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);
  function startEdit(e) {
    if (!onRename) return;
    e?.stopPropagation();
    setDraft(title || "");
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }
  function commit() {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== title) onRename(next);
  }
  function cancel() {
    setEditing(false);
  }
  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          else if (e.key === "Escape") { e.preventDefault(); cancel(); }
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        maxLength={80}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "2px 4px",
          background: C.panelSoft,
          border: `1px solid ${C.borderHover}`,
          borderRadius: 4,
          color: C.text,
          fontSize: 12.5,
          fontWeight: 700,
          fontFamily: "inherit",
          outline: "none",
        }}
      />
    );
  }
  return (
    <div
      onDoubleClick={startEdit}
      title={onRename ? `${title || "Untitled"} — double-click to rename` : (title || "Untitled")}
      style={{
        fontSize: 12.5,
        fontWeight: 700,
        color: C.text,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        cursor: onRename ? "text" : "default",
      }}
    >
      {title || "Untitled"}
    </div>
  );
}

// ── Library sidebar ──────────────────────────────────────────────
function LibrarySidebar({ tracks, loading, onDragStart, onTap, onSplitStems, onCleanVoice, onSplitVocals, stemJob, voiceCleanJob, vocalsSplitJob, onSplitStemsPro, onRenameTrack }) {
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
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = C.panelSoft)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              title="Drag onto a lane, or tap to load into the next empty lane"
            >
              <LibraryTrackTitle
                title={t.title}
                onRename={onRenameTrack ? (v) => onRenameTrack(t.id, v) : null}
              />
              <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2, marginBottom: 8 }}>
                {(t.genre || "—")}{t.mood ? ` · ${t.mood}` : ""}{t.tempo ? ` · ${t.tempo} BPM` : ""}
                {t.actualDuration || t.durationReq ? ` · ${formatTime(t.actualDuration || t.durationReq)}` : ""}
              </div>
              {/* 2x2 pill grid — left column = stem-split actions
                  (Split + Pro 9), right column = voice actions
                  (Vocals + Clean). Cleaner than the 1x4 vertical
                  stack and matches the design Arman approved. */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {onSplitStems && (
                  <ActionPill
                    label="🔬 Split"
                    cost={30}
                    busy={isThisSplitting && stemJob?.mode !== "9stem"}
                    title={
                      isThisSplitting
                        ? "Splitting in progress…"
                        : "Split into 6 stems (vocals/drum/bass/piano/electric_guitar/acoustic_guitar)"
                    }
                    color="#D9FF00"
                    borderColor="rgba(217,255,0,0.40)"
                    activeBg="rgba(217,255,0,0.10)"
                    onClick={(e) => { e.stopPropagation(); onSplitStems(t); }}
                  />
                )}
                {onSplitVocals && (
                  <ActionPill
                    label="🎤 Vocals"
                    cost={10}
                    busy={isThisVocalsSplitting}
                    title={
                      isThisVocalsSplitting
                        ? "Splitting vocals…"
                        : "Split vocal into lead + backing harmonies"
                    }
                    color="#c4b5fd"
                    borderColor="rgba(196,181,253,0.55)"
                    activeBg="rgba(196,181,253,0.20)"
                    onClick={(e) => { e.stopPropagation(); onSplitVocals(t); }}
                  />
                )}
                {onSplitStemsPro && (
                  <ActionPill
                    label="🔬+ Pro 9"
                    cost={50}
                    busy={isThisSplitting && stemJob?.mode === "9stem"}
                    title={
                      isThisSplitting
                        ? "Pro split in progress…"
                        : "Pro 9-stem split — adds synthesizer / strings / wind via the phoenix splitter"
                    }
                    color="#fbbf24"
                    borderColor="rgba(251,191,36,0.45)"
                    activeBg="rgba(251,191,36,0.15)"
                    onClick={(e) => { e.stopPropagation(); onSplitStemsPro(t); }}
                  />
                )}
                {onCleanVoice && (
                  <ActionPill
                    label="🧹 Clean"
                    cost={6}
                    busy={isThisCleaning}
                    title={
                      isThisCleaning
                        ? "Cleaning voice…"
                        : "Strip background noise from the vocal"
                    }
                    color="#93c5fd"
                    borderColor="rgba(96,165,250,0.50)"
                    activeBg="rgba(96,165,250,0.20)"
                    onClick={(e) => { e.stopPropagation(); onCleanVoice(t); }}
                  />
                )}
              </div>
            </div>
          );
        })}
    </aside>
  );
}

// ── Timeline area ────────────────────────────────────────────────
function TimelineArea({ lanes, playhead, timelineSeconds, pixelsPerSecond, timelineWidth, onDrop, onDragOver, onVolume, onToggleMute, onToggleSolo, onRename, onClear, onSeek, loopRegion, onSetLoopRegion, mixBpm, selectedLaneIndex, onSelectLane, onLaneContextMenu }) {
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
        mixBpm={mixBpm}
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
            onRename={(name) => onRename(i, name)}
            onClear={() => onClear(i)}
            selected={selectedLaneIndex === i}
            onSelect={() => onSelectLane(i)}
            onContextMenu={(e) => onLaneContextMenu(i, e)}
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
function TimeRuler({ timelineSeconds, pixelsPerSecond, timelineWidth, onSeek, loopRegion, onSetLoopRegion, mixBpm }) {
  function handleMouseDown(e) {
    if (!onSeek) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const startX = e.clientX;
    const rawStartT = (e.clientX - rect.left) / pixelsPerSecond;
    let didDrag = false;
    function onMove(ev) {
      const dx = Math.abs(ev.clientX - startX);
      if (dx < 5) return; // jitter — keep waiting
      didDrag = true;
      if (!onSetLoopRegion) return;
      const rawCurT = (ev.clientX - rect.left) / pixelsPerSecond;
      // Snap both endpoints to bar boundaries (when BPM resolved).
      // Shift bypasses snap for fine-tuning.
      const snap = !ev.shiftKey;
      const startT = snapToBar(rawStartT, mixBpm, snap);
      const curT = snapToBar(rawCurT, mixBpm, snap);
      const minT = Math.max(0, Math.min(startT, curT));
      const maxT = Math.min(timelineSeconds, Math.max(startT, curT));
      onSetLoopRegion({ start: minT, end: maxT });
    }
    function onUp(ev) {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!didDrag) {
        // Pure click → seek. Snap the seek position too so the
        // playhead lands cleanly on a bar.
        onSeek(snapToBar(rawStartT, mixBpm, !ev.shiftKey));
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  // Musical bar markers — only drawn when we have a resolved BPM
  // for the mix. One bar = 4 beats at the given BPM (4/4 time —
  // 99% of pop / rock / electronic / Bollywood is 4/4 so we don't
  // bother with a time-signature input for v0). Bars are labelled
  // 1, 2, 3… with every 4th bar (a "phrase") emphasized brighter.
  // Drawn UNDER the seconds labels so they don't fight for
  // attention — the seconds are still the primary read.
  const barMarkers = [];
  if (mixBpm && mixBpm > 0) {
    const barDuration = (60 / mixBpm) * 4; // 4 beats per bar in 4/4
    for (let bar = 1; bar * barDuration <= timelineSeconds; bar++) {
      const x = bar * barDuration * pixelsPerSecond;
      const isPhrase = bar % 4 === 0;
      barMarkers.push(
        <div
          key={`bar-${bar}`}
          style={{
            position: "absolute",
            left: x,
            top: 16,
            bottom: 0,
            width: 1,
            borderLeft: isPhrase
              ? "1px solid rgba(217,255,0,0.30)"
              : "1px solid rgba(217,255,0,0.10)",
            pointerEvents: "none",
          }}
        >
          {isPhrase && (
            <span
              style={{
                position: "absolute",
                bottom: -1,
                left: 3,
                fontSize: 8.5,
                color: "rgba(217,255,0,0.45)",
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                pointerEvents: "none",
              }}
            >
              {bar}
            </span>
          )}
        </div>
      );
    }
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
        {/* Bar markers (musical time grid) — rendered FIRST so they
            sit behind the seconds labels + loop region. Only present
            when a BPM is resolved. */}
        {barMarkers}
        {/* Loop region highlight — rendered BEFORE labels so the
            ticks stay readable above the yellow band. The left + right
            edges are tiny invisible drag-handles that let users
            fine-tune the in/out points without re-dragging the whole
            region. */}
        {loopRegion && loopRegion.end > loopRegion.start && (
          <>
            {/* Loop body is now draggable — drag inside the yellow
                band to MOVE the whole region without changing its
                length. zIndex lower than the edge handles so they
                still win when the cursor is near a boundary. */}
            <LoopBodyDrag
              x={loopRegion.start * pixelsPerSecond}
              width={(loopRegion.end - loopRegion.start) * pixelsPerSecond}
              pixelsPerSecond={pixelsPerSecond}
              loopRegion={loopRegion}
              timelineSeconds={timelineSeconds}
              mixBpm={mixBpm}
              onUpdate={onSetLoopRegion}
            />
            <LoopEdgeHandle
              edge="start"
              x={loopRegion.start * pixelsPerSecond}
              pixelsPerSecond={pixelsPerSecond}
              loopRegion={loopRegion}
              timelineSeconds={timelineSeconds}
              mixBpm={mixBpm}
              onUpdate={onSetLoopRegion}
            />
            <LoopEdgeHandle
              edge="end"
              x={loopRegion.end * pixelsPerSecond}
              pixelsPerSecond={pixelsPerSecond}
              loopRegion={loopRegion}
              timelineSeconds={timelineSeconds}
              mixBpm={mixBpm}
              onUpdate={onSetLoopRegion}
            />
          </>
        )}
        {labels}
      </div>
    </div>
  );
}

// Loop body — the yellow band ITSELF. Dragging inside it moves
// the whole region by the drag delta (keeping length constant).
// Renders the yellow visual + handles the move drag.
// Lower zIndex than LoopEdgeHandle so the edges still grab the
// cursor first within their 8px hit zone.
function LoopBodyDrag({ x, width, pixelsPerSecond, loopRegion, timelineSeconds, mixBpm, onUpdate }) {
  function handleMouseDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const startMouseX = e.clientX;
    const initialStart = loopRegion.start;
    const initialEnd = loopRegion.end;
    const length = initialEnd - initialStart;
    function onMove(ev) {
      const dx = ev.clientX - startMouseX;
      const dt = dx / pixelsPerSecond;
      let newStart = initialStart + dt;
      // Snap the new start to the bar grid before clamping —
      // keeps the region length constant + lands the start on
      // a beat. Shift bypasses snap.
      newStart = snapToBar(newStart, mixBpm, !ev.shiftKey);
      // Clamp so the region stays inside [0, timelineSeconds].
      if (newStart < 0) newStart = 0;
      if (newStart + length > timelineSeconds) newStart = timelineSeconds - length;
      onUpdate({ start: newStart, end: newStart + length });
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  return (
    <div
      onMouseDown={handleMouseDown}
      title="Drag to move the loop region"
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: x,
        width,
        background: "rgba(217,255,0,0.18)",
        borderLeft: `2px solid ${C.accent}`,
        borderRight: `2px solid ${C.accent}`,
        cursor: "grab",
        zIndex: 2,
      }}
    />
  );
}

// Invisible-by-default drag handle on the left/right edge of a
// loop region. Lets the user fine-tune in/out points without
// re-creating the whole region. 8px wide hit target on each edge
// — feels like the cursor "catches" the boundary. Cursor: ew-resize
// signals what's about to happen. Stops propagation so the underlying
// ruler doesn't fire its own click-to-seek when the user drags an edge.
function LoopEdgeHandle({ edge, x, pixelsPerSecond, loopRegion, timelineSeconds, mixBpm, onUpdate }) {
  function handleMouseDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const ruler = e.currentTarget.parentElement;
    const rect = ruler.getBoundingClientRect();
    function onMove(ev) {
      const rawT = (ev.clientX - rect.left) / pixelsPerSecond;
      // Snap to bar grid (when BPM resolved + Shift not held).
      const curT = snapToBar(rawT, mixBpm, !ev.shiftKey);
      if (edge === "start") {
        // Clamp: can't go below 0, can't cross over end.
        const newStart = Math.max(0, Math.min(curT, loopRegion.end - 0.1));
        onUpdate({ start: newStart, end: loopRegion.end });
      } else {
        const newEnd = Math.min(timelineSeconds, Math.max(curT, loopRegion.start + 0.1));
        onUpdate({ start: loopRegion.start, end: newEnd });
      }
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  return (
    <div
      onMouseDown={handleMouseDown}
      title={edge === "start" ? "Drag to move loop start" : "Drag to move loop end"}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: x - 4, // center the 8px-wide hit target on the edge
        width: 8,
        cursor: "ew-resize",
        // Subtle visual cue on hover via inline ::before isn't
        // possible in inline styles, but the cursor change + the
        // bright lime border behind it gives plenty of affordance.
        zIndex: 3,
      }}
    />
  );
}

// One track lane: lane header (controls) + clip canvas.
// Right-click context menu on a lane's waveform area. Currently the
// only action is Delete (clears the lane). Positions itself at the
// click coords; closes on outside click, Escape, or scroll.
function LaneContextMenu({ x, y, onClose, onDelete }) {
  useEffect(() => {
    function onDocDown(e) {
      // Any mousedown that lands outside the menu closes it. The menu
      // items handle their own click — they don't bubble.
      onClose();
    }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    }
    function onScroll() { onClose(); }
    window.addEventListener("mousedown", onDocDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);
  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: y,
        left: x,
        zIndex: 100,
        minWidth: 160,
        padding: 4,
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
        fontFamily: "inherit",
      }}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        style={{
          width: "100%",
          padding: "7px 10px",
          background: "transparent",
          border: "none",
          color: C.danger,
          fontSize: 12,
          fontWeight: 700,
          textAlign: "left",
          cursor: "pointer",
          borderRadius: 4,
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.12)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <span>🗑</span>
        <span style={{ flex: 1 }}>Delete</span>
        <span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>Del</span>
      </button>
    </div>
  );
}

function TrackLane({ laneIndex, lane, timelineWidth, pixelsPerSecond, onDrop, onDragOver, onVolume, onToggleMute, onToggleSolo, onRename, onClear, selected, onSelect, onContextMenu }) {
  // Only loaded lanes are selectable — empty lanes have nothing to
  // delete, so a stray click shouldn't highlight them.
  const canSelect = !!lane.trackId;
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
        onRename={onRename}
        onClear={onClear}
      />
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onClick={canSelect ? () => onSelect?.() : undefined}
        onContextMenu={canSelect ? (e) => onContextMenu?.(e) : undefined}
        style={{
          position: "relative",
          width: timelineWidth,
          height: "100%",
          background: lane.audioBuffer ? "transparent" : C.panel,
          borderLeft: `1px solid ${C.border}`,
          // Highlight the waveform area when the lane is selected.
          // 2px inset ring in the accent color reads clearly against
          // any waveform hue without obscuring it.
          boxShadow: selected ? `inset 0 0 0 2px ${C.accent}` : "none",
          cursor: canSelect ? "pointer" : "default",
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

function LaneHeader({ laneIndex, lane, onVolume, onToggleMute, onToggleSolo, onRename, onClear }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);
  // Effective display name: user override beats auto-generated.
  const displayName = lane.customName || lane.name || `Track ${laneIndex + 1}`;
  function startEdit() {
    if (!onRename) return;
    setDraft(lane.customName || lane.name || "");
    setEditing(true);
    // Focus + select-all next tick once input renders.
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }
  function commit() {
    onRename(draft);
    setEditing(false);
  }
  function cancel() {
    setEditing(false);
  }
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
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              else if (e.key === "Escape") { e.preventDefault(); cancel(); }
            }}
            placeholder={`Track ${laneIndex + 1}`}
            maxLength={60}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "2px 4px",
              background: C.panelSoft,
              border: `1px solid ${C.borderHover}`,
              borderRadius: 4,
              color: C.text,
              fontSize: 11.5,
              fontWeight: 700,
              fontFamily: "inherit",
              outline: "none",
            }}
          />
        ) : (
          <span
            onDoubleClick={startEdit}
            onClick={(e) => {
              // Single click on an empty lane's name does nothing —
              // double-click to edit avoids accidental edits when
              // the user is trying to drop something on the lane.
              if (lane.trackId) startEdit();
            }}
            title={onRename ? `${displayName} — double-click to rename` : displayName}
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: (lane.customName || lane.name) ? C.text : C.muted,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              flex: 1,
              minWidth: 0,
              cursor: onRename && lane.trackId ? "text" : "default",
            }}
          >
            {displayName}
          </span>
        )}
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

// Snap a timeline second to the nearest musical bar boundary,
// given a BPM. 4/4 time assumed (one bar = 4 beats). Snap is a
// "magnetic" feel: if the cursor is within half a bar of a
// boundary, it snaps to that boundary; otherwise stays free.
// Returns the input unchanged when:
//   • snap is disabled (Shift held during the drag), OR
//   • no BPM is resolved (no bar grid to snap to).
//
// Centralised so the three drag handlers (create-region, edge
// resize, body move) all snap consistently.
function snapToBar(seconds, bpm, snapEnabled) {
  if (!snapEnabled || !bpm || bpm <= 0) return seconds;
  const barDuration = (60 / bpm) * 4;
  return Math.round(seconds / barDuration) * barDuration;
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
