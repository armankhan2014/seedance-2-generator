"use client";
//
// Live /music page — ported from /demo/music with these real-data
// swaps:
//   • Generate button → POST /api/music/generate (instead of setTimeout).
//   • After generation, poll GET /api/music/tracks/[id] every 3 seconds
//     until status flips to completed (or failed → toast + refund).
//   • Player uses a real <audio> element pointed at streamUrl (first
//     ~30–40s) then audioUrl / r2Url (final mix).
//   • Library reads from GET /api/music/tracks on mount.
//   • Cost shown matches the server-side creditsForTrack() exactly.
//
// All UI choices, copy, layout, colors are unchanged from the demo
// Arman signed off on — only the data wiring changed.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";

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

// Each genre gets its own HSL hue so cards can wash in a brand-aware
// accent — warmer for cinematic/jazz, cooler for ambient/electronic,
// vibrant for rock, regal for orchestral, etc. The lime accent stays
// the page's primary brand color; these are SECONDARY washes that
// give the genre grid visual variety without fighting for attention.
const GENRES = [
  { id: "cinematic",  icon: "🎬", label: "Cinematic",  sub: "Film score", hue: 38  /* gold */ },
  { id: "ambient",    icon: "🎹", label: "Ambient",    sub: "Background", hue: 180 /* teal */ },
  { id: "rock",       icon: "🎸", label: "Rock",       sub: "Energetic",  hue: 0   /* red */  },
  { id: "orchestral", icon: "🎻", label: "Orchestral", sub: "Epic",       hue: 280 /* violet */ },
  { id: "electronic", icon: "🎧", label: "Electronic", sub: "EDM",        hue: 195 /* cyan */ },
  { id: "jazz",       icon: "🎷", label: "Jazz",       sub: "Lounge",     hue: 28  /* amber */ },
  { id: "folk",       icon: "🪕", label: "Folk",       sub: "Acoustic",   hue: 95  /* olive */ },
  { id: "mystery",    icon: "🌌", label: "Mysterious", sub: "Suspense",   hue: 240 /* indigo */ },
];
const GENRE_BY_ID = Object.fromEntries(GENRES.map((g) => [g.id, g]));
const MOODS = ["Epic", "Sad", "Hopeful", "Tense", "Mysterious", "Romantic", "Triumphant", "Calm"];
const DURATIONS = [
  { sec: 30,  label: "30s",  credits: 4 },
  { sec: 60,  label: "60s",  credits: 8 },
  { sec: 120, label: "2 min", credits: 14 },
  { sec: 180, label: "3 min", credits: 20 },
];
const TEMPLATES = [
  "Tense thriller soundtrack with strings",
  "Uplifting orchestral hero theme",
  "Dark electronic dystopian atmosphere",
  "Romantic piano ballad",
  "Hopeful indie acoustic morning",
  "Cyberpunk neon city night drive",
];

// Curated starter sets — each one fills the WHOLE form (prompt + genre
// + mood + duration + vocal) with a combination that produces a
// great-result on the music engine V5. Used by:
//   • The "✨ Surprise me" button — picks a random STARTER and slams
//     the form full, so a brand-new user can hit Generate immediately.
//   • The empty-library state — replaces the old dashed-box "your
//     tracks will appear here" with four click-to-fill cards.
// Per the music engine's own best-practice docs the sweet spot is a 15–30-word
// descriptor prompt with explicit instruments + mood — these are
// written to that pattern intentionally.
const STARTERS = [
  {
    id: "cinematic-hero",
    icon: "🎬",
    label: "Cinematic hero theme",
    sub: "Sweeping orchestral · 60s",
    prompt: "Sweeping cinematic orchestral hero theme, soaring strings and brass, slow build to triumphant climax, modern Hollywood film score",
    genre: "orchestral", mood: "Triumphant", duration: 60, isVocal: false, tempo: 110,
  },
  {
    id: "tense-thriller",
    icon: "🎻",
    label: "Tense thriller",
    sub: "Dark suspense · 60s",
    prompt: "Tense thriller soundtrack, low pulsing strings, dissonant piano stabs, building dread, slow heartbeat percussion",
    genre: "mystery", mood: "Tense", duration: 60, isVocal: false, tempo: 90,
  },
  {
    id: "hopeful-sunrise",
    icon: "🌅",
    label: "Hopeful sunrise",
    sub: "Indie acoustic · 30s",
    prompt: "Hopeful indie acoustic morning, fingerpicked guitar, warm pads, gentle drums, dawn-breaking optimism",
    genre: "folk", mood: "Hopeful", duration: 30, isVocal: false, tempo: 100,
  },
  {
    id: "cyberpunk-drive",
    icon: "🌆",
    label: "Cyberpunk night drive",
    sub: "Synthwave · 60s",
    prompt: "Cyberpunk neon city night drive, retro synth arpeggios, gated reverb drums, analog bassline, 80s film noir energy",
    genre: "electronic", mood: "Mysterious", duration: 60, isVocal: false, tempo: 120,
  },
];

// Mirror of lib/suno.js → creditsForTrack so the cost shown to the
// user matches what gets charged server-side.
function creditsForTrack({ duration, isVocal }) {
  const base = duration <= 30 ? 4 : duration <= 60 ? 8 : duration <= 120 ? 14 : 20;
  return base + (isVocal ? 4 : 0);
}

export default function MusicClient() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  // ── Form state ──────────────────────────────────────────────────
  // Mode: "easy" (default — only prompt + Surprise + Generate, all
  // other fields hidden + defaulted server-side) vs "pro" (full form
  // with genre / mood / duration / vocal / advanced). Mirrors the music engine's
  // own Simple vs Custom mental model so users who've used other
  // AI music tools recognise the pattern. localStorage-persisted so the
  // user's preference sticks across visits.
  const [mode, setMode] = useState("easy");
  useEffect(() => {
    try { const m = localStorage.getItem("sd-music-mode"); if (m === "pro" || m === "easy") setMode(m); } catch {}
  }, []);
  function changeMode(m) {
    setMode(m);
    try { localStorage.setItem("sd-music-mode", m); } catch {}
  }
  const [genre, setGenre] = useState("cinematic");
  const [mood, setMood] = useState("Epic");
  const [duration, setDuration] = useState(60);
  const [tempo, setTempo] = useState(100);
  // Vocal mode is a 4-state choice on the form, but on the wire it
  // maps to two flags: `instrumental` (isVocal=false) vs `vocal` with
  // an optional vocalGender ("m" | "f"). "auto" means vocal but let
  // the music engine pick the gender — same as the original Pro-mode Advanced
  // setting, surfaced as a top-level radio now.
  //   states: "instrumental" | "auto" | "f" | "m"
  const [vocalMode, setVocalMode] = useState("instrumental");
  const isVocal = vocalMode !== "instrumental";
  const vocalGender = (vocalMode === "f" || vocalMode === "m") ? vocalMode : "auto";
  // the music engine's Custom Mode treats lyrics as a top-level decision: let the
  // AI write them, OR write your own with [Verse]/[Chorus] structure
  // tags. We mirror that with a sub-tab inside the Lyrics section.
  //   states: "auto" | "custom"
  const [lyricsMode, setLyricsMode] = useState("auto");
  const [lyrics, setLyrics] = useState("");
  // ✨ Lyric helper — one-line idea → full structured lyrics via
  // Claude Haiku. Arman flagged 2026-05-16: newcomers landing on
  // /music with zero songwriting experience need an on-ramp into the
  // Pro "Write your own lyrics" workflow. The helper modal opens when
  // the user clicks the "✨ Help me write lyrics" button — on
  // successful generation it auto-fills the textarea, flips to Pro +
  // vocal=on + lyricsMode=custom so the lyrics actually get used.
  const [lyricHelperOpen, setLyricHelperOpen] = useState(false);
  // 🎤 Reference-audio mode (Phase A) — user uploads a song or their
  // own vocal recording. Two flavours:
  //   • "cover"            — engine keeps the melody/raag, generates
  //                          new vocals + instruments around it
  //   • "add-instrumental" — engine PRESERVES the user's vocals and
  //                          layers instruments around them (per
  //                          Arman's original ask: "I record my vocals
  //                          on my laptop, the AI adds violin / flute
  //                          / tabla in the same raag")
  // referenceMode "none" → vanilla text-to-music (no upload required).
  const [referenceMode, setReferenceMode] = useState("none");
  // After a successful upload to R2 via /api/music/reference/{upload,url}
  // we stash the returned URL + display name so we can render the
  // attached-file chip and send the URL to /api/music/generate.
  const [referenceFile, setReferenceFile] = useState(null);
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [referenceError, setReferenceError] = useState("");
  // Free-text Style field — the music engine calls this the "Style" prompt. When
  // populated, it OVERRIDES the genre preset's built-in style string.
  // Empty = genre preset wins. Lets power users go beyond the 8
  // built-in genres (e.g. "lo-fi hip-hop, jazzy keys, mellow drums").
  const [customStyle, setCustomStyle] = useState("");
  // Model version — V5 = best quality (default), V4 = cheaper +
  // faster, V5.5 = newest experimental. Cost is identical at the
  // wholesale tier but quality varies; we expose this so power users
  // can pick V4 for quick iterations.
  const [model, setModel] = useState("V5");
  // Negative tags — comma-separated list of styles / instruments /
  // moods to AVOID. The engine treats this as a soft constraint.
  const [negativeTags, setNegativeTags] = useState("");
  const [prompt, setPrompt] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Wire compat — keep these names so the existing onGenerate body
  // and downstream callers don't need to change.
  function setIsVocal(v) {
    setVocalMode(v ? "auto" : "instrumental");
  }
  function setVocalGender(g) {
    if (g === "f" || g === "m") setVocalMode(g);
    else setVocalMode(isVocal ? "auto" : "instrumental");
  }

  // Opens the lyric helper. We also pre-configure the form so the
  // generated lyrics will actually be used:
  //   • Switch to Pro mode (Easy mode hides the lyrics field).
  //   • Turn vocals on if currently instrumental (otherwise lyrics
  //     are inert).
  //   • Flip to "Write yours" lyrics mode so the auto-fill lands in
  //     the visible textarea.
  function openLyricHelper() {
    changeMode("pro");
    if (vocalMode === "instrumental") setVocalMode("auto");
    setLyricsMode("custom");
    setLyricHelperOpen(true);
  }
  // Called when the helper successfully generates lyrics. Drops the
  // string into the textarea + closes the modal + flashes a toast so
  // the user notices the change (the lyrics section may be far below
  // the fold on mobile).
  function applyHelperLyrics(text) {
    setLyrics(text);
    setLyricHelperOpen(false);
    flashToast("✨ Lyrics drafted — review and edit before generating");
  }

  // ── Reference upload handlers ─────────────────────────────────────
  // Switch reference mode + clear any previously attached file so the
  // user starts each mode with a clean slate. Pro mode also flips to
  // sensible defaults: add-instrumental implies the OUTPUT is vocal
  // (the user's vocals are preserved), so we flip vocalMode to "auto"
  // — they don't need to pick male/female or write lyrics.
  function changeReferenceMode(m) {
    setReferenceMode(m);
    setReferenceFile(null);
    setReferenceError("");
    if (m === "add-instrumental") {
      changeMode("pro");
      setVocalMode("auto");
      setLyricsMode("auto"); // user's voice IS the lyrics
    } else if (m === "cover") {
      changeMode("pro");
    }
  }
  async function uploadReferenceFile(file) {
    if (!file) return;
    setReferenceError("");
    setReferenceUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/music/reference/upload", {
        method: "POST",
        body: form,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Upload failed");
      setReferenceFile({ url: j.url, name: j.name, size: j.size });
    } catch (e) {
      setReferenceError(e.message || "Upload failed");
    } finally {
      setReferenceUploading(false);
    }
  }
  async function uploadReferenceUrl(url) {
    if (!url) return;
    setReferenceError("");
    setReferenceUploading(true);
    try {
      const res = await fetch("/api/music/reference/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Fetch failed");
      setReferenceFile({ url: j.url, name: j.name, size: j.size });
    } catch (e) {
      setReferenceError(e.message || "Fetch failed");
    } finally {
      setReferenceUploading(false);
    }
  }
  function clearReference() {
    setReferenceFile(null);
    setReferenceError("");
  }

  // ── Helpers — Surprise me + Starter prompts ────────────────────
  // applyStarter() fills every relevant form field from one of the
  // curated STARTER presets. Used by the empty-library cards AND the
  // Surprise-me button (which picks at random). After applying we
  // also push the page back into Easy mode + close the advanced
  // disclosure so the user can hit Generate without scrolling.
  function applyStarter(s) {
    setPrompt(s.prompt);
    setGenre(s.genre);
    setMood(s.mood);
    setDuration(s.duration);
    setTempo(s.tempo);
    setIsVocal(s.isVocal);
    setAdvancedOpen(false);
  }
  function surpriseMe() {
    const pick = STARTERS[Math.floor(Math.random() * STARTERS.length)];
    applyStarter(pick);
  }

  // ── Generation flow ─────────────────────────────────────────────
  // Stage: idle | submitting | generating | done | failed
  const [stage, setStage] = useState("idle");
  const [currentTrackId, setCurrentTrackId] = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [errMsg, setErrMsg] = useState("");
  const [toast, setToast] = useState("");

  // ── Library ─────────────────────────────────────────────────────
  const [tracks, setTracks] = useState([]);

  // Cost
  const cost = creditsForTrack({ duration, isVocal });

  // ── Load library on mount ───────────────────────────────────────
  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    fetch("/api/music/tracks")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.tracks)) setTracks(j.tracks);
      })
      .catch(() => {});
  }, [sessionStatus]);

  // ── Restore form snapshot after sign-in redirect ────────────────
  // When the user clicked Generate without being signed in, we
  // stashed the whole form to sessionStorage (see onGenerate
  // above). On mount we look for that stash and restore it so the
  // user lands back with their prompt + genre + mood + everything
  // exactly as they left it. Snapshot is consumed (cleared) after
  // restore so a future deliberate page-load doesn't re-fill.
  // 10-minute TTL guards against stale snapshots from days-old
  // sessions.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("sd-music-pending");
      if (!raw) return;
      sessionStorage.removeItem("sd-music-pending");
      const s = JSON.parse(raw);
      if (!s || typeof s !== "object") return;
      if (s.savedAt && Date.now() - s.savedAt > 10 * 60 * 1000) return;
      if (typeof s.mode === "string") changeMode(s.mode);
      if (typeof s.prompt === "string") setPrompt(s.prompt);
      if (typeof s.genre === "string") setGenre(s.genre);
      if (typeof s.mood === "string") setMood(s.mood);
      if (Number.isFinite(s.duration)) setDuration(s.duration);
      if (Number.isFinite(s.tempo)) setTempo(s.tempo);
      if (typeof s.vocalMode === "string") setVocalMode(s.vocalMode);
      if (typeof s.lyricsMode === "string") setLyricsMode(s.lyricsMode);
      if (typeof s.lyrics === "string") setLyrics(s.lyrics);
      if (typeof s.customStyle === "string") setCustomStyle(s.customStyle);
      if (typeof s.model === "string") setModel(s.model);
      if (typeof s.negativeTags === "string") setNegativeTags(s.negativeTags);
      if (typeof s.referenceMode === "string" && ["none", "cover", "add-instrumental"].includes(s.referenceMode)) {
        setReferenceMode(s.referenceMode);
      }
      if (s.referenceFile && typeof s.referenceFile.url === "string") {
        setReferenceFile(s.referenceFile);
      }
    } catch {}
  }, []);

  function flashToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  // ── Generate ────────────────────────────────────────────────────
  async function onGenerate() {
    if (stage === "submitting" || stage === "generating") return;
    // Guard: reference mode picked but no file uploaded yet → block
    // with a friendly toast rather than waste the user a Generate
    // round-trip.
    if (referenceMode !== "none" && !referenceFile?.url) {
      flashToast("Upload an audio file for this mode first");
      return;
    }
    if (referenceUploading) {
      flashToast("Wait for the reference upload to finish");
      return;
    }
    if (sessionStatus !== "authenticated") {
      // BUG FIX (2026-05-17): previously pushed to /?signin=1 which
      // dumped users on the Studio homepage — they'd sign in there,
      // land back on /generate or /, and have to navigate to /music
      // again, losing the prompt + any ?soundtrack=<id> they came
      // in with from a shared WhatsApp link. Now we invoke NextAuth
      // signIn() with an explicit callbackUrl pointing back at
      // /music + a sessionStorage snapshot of every field on the
      // form so the user lands back with their work intact (no
      // re-typing the prompt). The snapshot is restored on mount
      // below by readPendingSnapshot().
      const here = typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/music";
      try {
        sessionStorage.setItem("sd-music-pending", JSON.stringify({
          mode, prompt, genre, mood, duration, tempo, vocalMode,
          lyricsMode, lyrics, customStyle, model, negativeTags,
          // Reference state — the URL is already on our R2, so it
          // survives the sign-in redirect just fine.
          referenceMode,
          referenceFile,
          savedAt: Date.now(),
        }));
      } catch {}
      signIn(undefined, { callbackUrl: here });
      return;
    }
    setStage("submitting");
    setErrMsg("");
    try {
      const res = await fetch("/api/music/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          genre,
          mood,
          duration,
          tempo,
          isVocal,
          // Lyrics: only sent when vocal mode is on AND the user picked
          // Custom-write. Auto-generate sends no lyrics so the music engine writes
          // them itself (same as the music engine's own "Auto-generate" toggle).
          lyrics: isVocal && lyricsMode === "custom" ? lyrics : undefined,
          prompt,
          // the music engine calls this the "Style" prompt. Empty string → server
          // falls back to buildStyleString(genre, mood, tempo, isVocal).
          customStyle: customStyle?.trim() || undefined,
          vocalGender: vocalGender === "auto" ? undefined : vocalGender,
          model,
          negativeTags: negativeTags?.trim() || undefined,
          // Reference-audio fields (Phase A). Only sent when the user
          // picked one of the upload modes AND completed the upload.
          referenceMode: referenceMode !== "none" ? referenceMode : undefined,
          referenceUrl: referenceMode !== "none" ? referenceFile?.url : undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErrMsg(j.error || "Couldn't start generation");
        setStage("failed");
        flashToast(j.error || "Couldn't start generation");
        return;
      }
      // Initial track data — status="processing", no audio yet.
      setCurrentTrackId(j.track.id);
      setCurrentTrack({ ...j.track, status: "processing" });
      setStage("generating");
    } catch (err) {
      setErrMsg(err.message);
      setStage("failed");
      flashToast(err.message);
    }
  }

  // ── Poll for status while generating ────────────────────────────
  useEffect(() => {
    if (stage !== "generating" || !currentTrackId) return;
    let stopped = false;
    let tries = 0;
    const MAX_TRIES = 120; // 6 minutes at 3s — the music engine can take up to ~3min
    async function poll() {
      while (!stopped && tries < MAX_TRIES) {
        await new Promise((r) => setTimeout(r, 3000));
        if (stopped) return;
        tries++;
        try {
          const res = await fetch(`/api/music/tracks/${currentTrackId}`);
          const j = await res.json();
          if (!j.ok) continue;
          setCurrentTrack(j.track);
          if (j.track.status === "completed") {
            setStage("done");
            // Refresh library so the new track shows up immediately.
            fetch("/api/music/tracks")
              .then((r) => r.json())
              .then((jj) => jj.ok && setTracks(jj.tracks))
              .catch(() => {});
            return;
          }
          if (j.track.status === "failed") {
            setErrMsg(j.track.error || "Generation failed");
            setStage("failed");
            flashToast("Generation failed — credits refunded");
            return;
          }
        } catch {
          /* network blip — keep polling */
        }
      }
      if (!stopped) {
        // Timed out without a callback. Don't refund client-side —
        // there's a cron that sweeps stuck "processing" rows.
        flashToast("Still working… check your library shortly.");
        setStage("idle");
      }
    }
    poll();
    return () => { stopped = true; };
  }, [stage, currentTrackId]);

  // ── Stem-split polling ────────────────────────────────────────────
  // Suno's vocal-removal endpoint typically completes in 30-90s. While
  // any track in the user's library shows stemStatus === "processing"
  // we refetch the library every 6s so the "Splitting…" chips flip to
  // download links automatically — same UX as the main generation
  // poll but lighter (only fires when stems are in flight).
  useEffect(() => {
    const hasPending = tracks.some((t) => t.stemStatus === "processing");
    if (!hasPending) return;
    let stopped = false;
    let tries = 0;
    const MAX = 30; // 30 × 6s = 3 min cap
    async function tick() {
      while (!stopped && tries < MAX) {
        await new Promise((r) => setTimeout(r, 6000));
        if (stopped) return;
        tries++;
        try {
          const res = await fetch("/api/music/tracks");
          if (!res.ok) continue;
          const j = await res.json();
          if (!j.ok || !Array.isArray(j.tracks)) continue;
          setTracks(j.tracks);
          // Bail once nothing is processing anymore.
          if (!j.tracks.some((t) => t.stemStatus === "processing")) return;
        } catch {}
      }
    }
    tick();
    return () => { stopped = true; };
  }, [tracks]);

  // Kick off a stem split on a finished track. Optimistically marks
  // the row as processing so the UI flips immediately; the polling
  // loop above will refetch the real state once Suno's callback lands.
  async function onSplitStems(trackId) {
    try {
      const res = await fetch(`/api/music/tracks/${trackId}/stems`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        flashToast(j.error || "Couldn't start stem split");
        return;
      }
      // Optimistic update: flip the row's stemStatus locally so the
      // button immediately shows "Splitting…" without waiting for
      // the next poll. If it was already done, j.stemStatus is
      // "completed" + j.vocalUrl + j.instrumentalUrl are set.
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId
            ? {
                ...t,
                stemStatus: j.stemStatus || "processing",
                vocalUrl: j.vocalUrl ?? t.vocalUrl,
                instrumentalUrl: j.instrumentalUrl ?? t.instrumentalUrl,
                stemError: null,
              }
            : t
        )
      );
      if (j.alreadyDone) {
        flashToast("Stems are already split — download links are ready");
      } else if (j.stemStatus === "processing") {
        flashToast(`Splitting stems · ${j.cost ?? 4} credits — ~60s`);
      }
    } catch (e) {
      flashToast(e?.message || "Couldn't start stem split");
    }
  }

  // Kick off an "extend this track" job. Creates a new MusicTrack row
  // on the server (so the original stays untouched + the user can
  // compare them) and returns immediately. The new row appears at the
  // top of the library in "processing" state; the existing main-track
  // poll won't pick it up because that only watches currentTrackId,
  // but the next manual library refresh (or generation completion)
  // will surface it. To make it appear instantly we refetch the list.
  async function onExtendTrack(trackId) {
    try {
      const res = await fetch(`/api/music/tracks/${trackId}/extend`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        flashToast(j.error || "Couldn't extend track");
        return;
      }
      // Refetch so the new row shows up alongside the original.
      try {
        const list = await fetch("/api/music/tracks");
        const lj = await list.json();
        if (lj.ok && Array.isArray(lj.tracks)) setTracks(lj.tracks);
      } catch {}
      // Set the new row as the "currently watched" track so the
      // existing per-track poll kicks in and flips it from processing
      // → completed without the user needing to refresh.
      setCurrentTrackId(j.track.id);
      setCurrentTrack({ ...j.track, status: "processing" });
      setStage("generating");
      flashToast(`Extending track · 8 credits — ~2-3 min`);
    } catch (e) {
      flashToast(e?.message || "Couldn't extend track");
    }
  }

  function onReset() {
    setStage("idle");
    setCurrentTrackId(null);
    setCurrentTrack(null);
    setErrMsg("");
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif" }}>
      <Hero />

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px 96px" }}>
        {stage === "idle" || stage === "submitting" || stage === "failed" ? (
          <section
            style={{
              marginTop: -100,
              position: "relative",
              zIndex: 2,
              // Layered panel: faint accent wash + glass border so the
              // form "lifts" off the hero instead of being a plain
              // dark box. Brand-aware (lime + magenta whispers).
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))," +
                "radial-gradient(ellipse 80% 60% at 50% -20%, rgba(217,255,0,0.10), transparent 70%)," +
                C.panel,
              border: `1px solid ${C.border}`,
              borderRadius: 22,
              padding: "24px 24px 32px",
              boxShadow:
                "0 28px 80px -20px rgba(0,0,0,0.8), " +
                "0 0 0 1px rgba(217,255,0,0.04) inset",
              animation: "musicFormIn 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both",
            }}
          >
            <style>{`@keyframes musicFormIn {
              from { opacity: 0; transform: translateY(20px); }
              to   { opacity: 1; transform: translateY(0); }
            }`}</style>
            {/* Easy ↔ Pro mode toggle — the music engine's Simple/Custom mental
                model. Easy = just a prompt + Surprise + Generate.
                Pro = full form. Persisted to localStorage. */}
            <ModeTabs mode={mode} onChange={changeMode} />

            {errMsg && stage === "failed" && (
              <div
                style={{
                  background: "rgba(239,68,68,0.10)",
                  border: `1px solid rgba(239,68,68,0.32)`,
                  borderRadius: 10,
                  padding: "10px 14px",
                  fontSize: 12.5,
                  color: C.danger,
                  marginBottom: 18,
                  marginTop: 18,
                }}
              >
                {errMsg}. Credits were refunded — try again.
              </div>
            )}

            {/* ─── EASY MODE ─────────────────────────────────────
                One prompt + Surprise-me + Generate. Genre/mood/
                duration/vocal use the most-recently-picked values
                from Pro mode (or the defaults). New users can
                ship a generation in two taps without learning the
                full taxonomy first. */}
            {mode === "easy" ? (
              <div style={{ marginTop: 22 }}>
                <SectionEyebrow tooltip="Aim for 15–30 words. Include genre + mood + key instruments. ‘Sweeping cinematic strings, slow build, triumphant’ beats ‘epic music’.">
                  Describe your track
                </SectionEyebrow>
                <PromptInput value={prompt} onChange={setPrompt} />
                <PromptStrength value={prompt} />
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={surpriseMe}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 999,
                      background: C.panelSoft,
                      border: `1px solid ${C.borderHover}`,
                      color: C.accent,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = C.accentSoft)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = C.panelSoft)}
                  >
                    ✨ Surprise me
                  </button>
                  <span style={{ fontSize: 11, color: C.muted }}>
                    Fills the prompt with a great-result starter — one tap to first track.
                  </span>
                </div>
                <GenerateBar
                  cost={cost}
                  busy={stage === "submitting"}
                  onGenerate={onGenerate}
                />
              </div>
            ) : (
              <>
                {/* 1 · DESCRIBE — the user's free-form direction.
                    Copy adapts based on reference mode so the
                    placeholder + helper text match what the prompt is
                    actually doing in that flow. */}
                <div style={{ marginTop: 22 }}>
                  <SectionEyebrow tooltip={
                    referenceMode === "add-instrumental"
                      ? "Describe the instruments + style you want around your vocals. Comma-separated, e.g. 'tabla, sitar, harmonium, traditional Indian classical'."
                      : referenceMode === "cover"
                        ? "Describe what you want generated FROM the reference. The melody is preserved; everything else (instruments, style, vocal feel) follows your prompt."
                        : "Style descriptors work best as 15–30 comma-separated words (genre + mood + key instruments). Picking a preset below auto-builds one for you."
                  }>
                    1 · {referenceMode === "add-instrumental" ? "Describe the instruments" : "Describe what you want"}
                  </SectionEyebrow>
                  <PromptInput value={prompt} onChange={setPrompt} />
                  <PromptStrength value={prompt} />
                  <TemplateChips onPick={setPrompt} />
                </div>

                <Divider />

                {/* 1.5 · REFERENCE AUDIO — optional upload that turns
                    plain text-to-music into either a cover (same
                    melody, new everything) or vocal-preserving
                    accompaniment (user's vocals kept, AI adds
                    instruments). Pro-mode-only — keeps Easy mode
                    obvious. */}
                <SectionEyebrow tooltip="Optional. Upload an audio file to either inspire the new song (cover mode) or back your own vocals with AI-generated instruments.">
                  🎤 Inspire from audio (optional)
                </SectionEyebrow>
                <ReferenceModeRow
                  value={referenceMode}
                  onChange={changeReferenceMode}
                />
                {referenceMode !== "none" && (
                  <ReferenceUploadBox
                    mode={referenceMode}
                    file={referenceFile}
                    uploading={referenceUploading}
                    error={referenceError}
                    onFile={uploadReferenceFile}
                    onUrl={uploadReferenceUrl}
                    onClear={clearReference}
                  />
                )}

                <Divider />

                {/* 2 · VOCALS — single visible row of four options.
                    Hidden in add-instrumental mode because the user's
                    uploaded vocals ARE the vocals — toggling
                    instrumental/female/male doesn't apply. */}
                {referenceMode !== "add-instrumental" && (
                  <>
                    <SectionEyebrow tooltip="Instrumental = no vocals at all. Auto = the model picks the singer. Female / Male = lock the vocal gender.">
                      2 · Vocals
                    </SectionEyebrow>
                    <VocalModeRow value={vocalMode} onChange={setVocalMode} />
                  </>
                )}

                {/* 3 · LYRICS — only when vocals are on AND we're not
                    in add-instrumental mode (the upload is the
                    lyrics). */}
                {isVocal && referenceMode !== "add-instrumental" && (
                  <>
                    <Divider />
                    <SectionEyebrow tooltip="Auto-generate = the model writes lyrics for you (faster but generic). Write yours = full control; use [Verse] [Chorus] [Bridge] tags for structure.">
                      3 · Lyrics
                    </SectionEyebrow>
                    <LyricsModeTabs value={lyricsMode} onChange={setLyricsMode} />
                    {lyricsMode === "custom" && (
                      <LyricsBox
                        value={lyrics}
                        onChange={setLyrics}
                        onOpenHelper={openLyricHelper}
                      />
                    )}
                    {lyricsMode === "auto" && (
                      <div
                        style={{
                          padding: "14px 16px",
                          background: C.panelSoft,
                          border: `1px dashed ${C.border}`,
                          borderRadius: 12,
                          fontSize: 12.5,
                          color: C.muted,
                          lineHeight: 1.6,
                          marginTop: 10,
                        }}
                      >
                        The AI will write lyrics based on your description above.
                        Fast, but words tend toward generic. Switch to{" "}
                        <b style={{ color: C.text }}>Write yours</b> for control —
                        or let us draft them for you in any language.
                        <div style={{ marginTop: 10 }}>
                          <LyricHelperLaunchButton onClick={openLyricHelper} />
                        </div>
                      </div>
                    )}
                  </>
                )}

                <Divider />

                {/* 4 · STYLE — genre grid (presets) PLUS a free-text
                    "Style" field that mirrors the engine's Custom-mode Style
                    prompt. Empty = preset wins. Non-empty = override. */}
                <SectionEyebrow tooltip="Pick a preset OR type your own comma-separated descriptors. Examples: 'lo-fi hip-hop, jazzy piano, mellow drums' or 'epic orchestral, sweeping strings, choir'.">
                  {isVocal ? "4" : "3"} · Style
                </SectionEyebrow>
                <GenreGrid value={genre} onChange={setGenre} />
                <StyleOverride value={customStyle} onChange={setCustomStyle} />

                <Divider />

                {/* 5 · LENGTH & MOOD */}
                <SectionEyebrow tooltip="Longer tracks cost more credits but give the AI more room for a proper intro–build–outro arc.">
                  {isVocal ? "5" : "4"} · Length &amp; mood
                </SectionEyebrow>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <MoodPicker value={mood} onChange={setMood} />
                  <DurationPicker value={duration} onChange={setDuration} />
                </div>

                {/* Vocal gender lives in the top-level Vocals section
                    above. Advanced now exposes tempo, model picker,
                    and negative tags. */}
                <AdvancedOptions
                  open={advancedOpen}
                  onToggle={() => setAdvancedOpen((o) => !o)}
                  tempo={tempo}
                  onTempoChange={setTempo}
                  model={model}
                  onModelChange={setModel}
                  negativeTags={negativeTags}
                  onNegativeTagsChange={setNegativeTags}
                />
                <GenerateBar
                  cost={cost}
                  busy={stage === "submitting"}
                  onGenerate={onGenerate}
                />
              </>
            )}
          </section>
        ) : null}

        {stage === "generating" && <GeneratingPanel onCancel={onReset} streamUrl={currentTrack?.streamUrl} />}

        {stage === "done" && currentTrack && (
          <PlayerPanel track={currentTrack} onReset={onReset} />
        )}

        <PricingSection />
        <GallerySection tracks={tracks} onPickStarter={applyStarter} onSplitStems={onSplitStems} onExtend={onExtendTrack} />
        <FooterNotes />
      </main>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 30,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(13,13,15,0.96)",
            border: `1px solid ${C.borderHover}`,
            color: C.text,
            padding: "10px 18px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            zIndex: 100,
            boxShadow: "0 12px 32px -8px rgba(0,0,0,0.6)",
          }}
        >
          {toast}
        </div>
      )}

      <LyricHelperModal
        open={lyricHelperOpen}
        onClose={() => setLyricHelperOpen(false)}
        onApply={applyHelperLyrics}
        genre={genre}
        mood={mood}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Visual / form bits — identical to the demo (Arman signed off).
// ────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        padding: "96px 16px 160px",
        background:
          "radial-gradient(ellipse 80% 60% at 20% 20%, rgba(217,255,0,0.10), transparent 70%)," +
          "radial-gradient(ellipse 60% 50% at 80% 70%, rgba(236,72,153,0.08), transparent 70%)," +
          "linear-gradient(180deg, #050505 0%, #0d1606 65%, #050505 100%)",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <WaveformBg />
      <FloatingNotes />
      <div style={{ position: "relative", maxWidth: 1200, margin: "0 auto", textAlign: "center" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 16px",
            borderRadius: 999,
            background: C.accentSoft,
            border: `1px solid ${C.borderHover}`,
            fontSize: 10.5,
            fontWeight: 800,
            color: C.accent,
            letterSpacing: "0.20em",
            textTransform: "uppercase",
            marginBottom: 28,
            boxShadow: `0 0 24px -4px ${C.accent}55`,
          }}
        >
          <PulseDot /> New · AI music engine v5
        </div>
        <h1
          style={{
            fontSize: "clamp(46px, 9vw, 96px)",
            fontWeight: 900,
            letterSpacing: "-0.035em",
            lineHeight: 0.98,
            margin: 0,
            color: C.text,
            textShadow: "0 4px 40px rgba(0,0,0,0.6)",
          }}
        >
          Compose your{" "}
          <span
            style={{
              background:
                "linear-gradient(135deg, #ffffff 0%, #D9FF00 35%, #A6CC00 70%, #ec4899 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              fontStyle: "italic",
            }}
          >
            soundtrack
          </span>
        </h1>
        <p
          style={{
            margin: "20px auto 0",
            maxWidth: 600,
            fontSize: 18,
            lineHeight: 1.55,
            color: C.textSoft,
            fontWeight: 500,
          }}
        >
          Royalty-free AI music for your films. Genre, mood, tempo, lyrics — go from
          idea to download in under three minutes.
        </p>
        <HeroStats />
      </div>
    </section>
  );
}

// Pulsing dot inside the "New" pill — CSS keyframe, GPU-composited.
function PulseDot() {
  return (
    <>
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#D9FF00",
          boxShadow: "0 0 8px #D9FF00",
          animation: "musicPulse 1.6s ease-in-out infinite",
          display: "inline-block",
        }}
      />
      <style>{`@keyframes musicPulse { 0%, 100% { opacity: 0.5; transform: scale(0.9); } 50% { opacity: 1; transform: scale(1.15); } }`}</style>
    </>
  );
}

// Floating music-note glyphs drifting up the hero. Pure CSS keyframes
// (no rAF) so it costs ~0 main-thread work. Each glyph has its own
// random delay + duration so they don't look in lockstep.
function FloatingNotes() {
  const notes = ["♪", "♫", "♬", "♩", "𝄞", "♭"];
  // 12 floating elements scattered across the hero.
  const floats = Array.from({ length: 12 }, (_, i) => ({
    left: `${(i * 8.3 + 5) % 100}%`,
    delay: `${(i * 1.3) % 8}s`,
    duration: `${10 + (i % 5)}s`,
    size: 18 + (i % 4) * 6,
    note: notes[i % notes.length],
    color: i % 3 === 0 ? "rgba(217,255,0,0.20)" : i % 3 === 1 ? "rgba(166,204,0,0.16)" : "rgba(236,72,153,0.14)",
  }));
  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        {floats.map((f, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              left: f.left,
              bottom: -40,
              fontSize: f.size,
              color: f.color,
              fontFamily: "serif",
              animation: `musicFloat ${f.duration} linear ${f.delay} infinite`,
              willChange: "transform, opacity",
            }}
          >
            {f.note}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes musicFloat {
          0%   { transform: translate3d(0, 0, 0) rotate(-8deg);  opacity: 0; }
          12%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translate3d(40px, -110vh, 0) rotate(8deg); opacity: 0; }
        }
      `}</style>
    </>
  );
}

// Three-stat strip under the hero subtitle. Pure presentation — no
// live numbers wired yet, just visual weight.
function HeroStats() {
  const stats = [
    { value: "8", label: "Genres" },
    { value: "<3 min", label: "Avg generate" },
    { value: "MP3 + WAV", label: "Royalty-free" },
  ];
  return (
    <div
      style={{
        marginTop: 36,
        display: "inline-flex",
        gap: 0,
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: "12px 4px",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      {stats.map((s, i) => (
        <div
          key={s.label}
          style={{
            padding: "0 22px",
            borderLeft: i === 0 ? "none" : `1px solid ${C.border}`,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 800, color: C.accent, letterSpacing: "-0.01em" }}>
            {s.value}
          </div>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, letterSpacing: "0.16em", textTransform: "uppercase", marginTop: 3 }}>
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function WaveformBg() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;

    // Mobile shortcuts: lower wave count + bigger x stride + capped DPR.
    // Phones with DPR 3 + a 400px-wide hero were turning the canvas into
    // a 1200×2400 paint surface each frame, which was the source of the
    // lag Arman reported. Capping DPR to 1.5 cuts paint-area ~4× without
    // a visible quality hit on the wavy gradients.
    const isMobile =
      typeof window !== "undefined" &&
      (window.matchMedia("(max-width: 768px)").matches ||
        window.matchMedia("(hover: none)").matches);
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const ctx = c.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
    function size() {
      c.width = c.offsetWidth * dpr;
      c.height = c.offsetHeight * dpr;
    }
    size();
    window.addEventListener("resize", size);

    const WAVES = isMobile
      ? [
          // 2 waves on phones — visually almost identical, ~33% cheaper
          // per frame than the desktop 3-wave version.
          { freq: 0.008, amp: 0.13, alpha: 0.34, color: "#D9FF00" },
          { freq: 0.018, amp: 0.14, alpha: 0.14, color: "#A6CC00" },
        ]
      : [
          { freq: 0.008, amp: 0.13, alpha: 0.32, color: "#D9FF00" },
          { freq: 0.013, amp: 0.18, alpha: 0.18, color: "#A6CC00" },
          { freq: 0.021, amp: 0.10, alpha: 0.10, color: "#ffffff" },
        ];
    const STEP = isMobile ? 6 : 2;          // x-stride: 3× cheaper on phones
    const MIN_FRAME_MS = isMobile ? 50 : 33; // ~20 fps mobile, ~30 fps desktop

    // Self-healing rAF — same pattern as the home hero fix. The rAF
    // chain never breaks; `running` only gates the draw work. That way
    // when the page is hidden / canvas scrolls offscreen / window
    // loses focus, the loop pauses without dying.
    let running = true;
    let rafId = 0;
    let heroVisible = true;
    let lastTickTs = 0;
    const start = performance.now();

    function tick(now) {
      if (now - lastTickTs < MIN_FRAME_MS) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      lastTickTs = now;
      if (!running) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const t = (now - start) / 1000;
      const w = c.width;
      const h = c.height;
      ctx.clearRect(0, 0, w, h);
      for (const wv of WAVES) {
        ctx.beginPath();
        ctx.globalAlpha = wv.alpha;
        ctx.strokeStyle = wv.color;
        ctx.lineWidth = 1.5 * dpr;
        for (let x = 0; x < w; x += STEP) {
          const y =
            h / 2 +
            Math.sin(x * wv.freq + t * 0.8) * h * wv.amp +
            Math.sin(x * wv.freq * 1.6 + t * 1.4) * h * wv.amp * 0.4;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    function shouldRun() { return heroVisible && !document.hidden; }
    function maybeStart() {
      if (!running && shouldRun()) running = true;
    }
    function onVis() {
      if (document.hidden) running = false;
      else maybeStart();
    }
    document.addEventListener("visibilitychange", onVis);

    // Stop drawing when the hero scrolls out of view — saves main-
    // thread cost while the user is reading the form / library below.
    const visObs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          heroVisible = e.isIntersecting;
          if (!heroVisible) running = false;
          else maybeStart();
        }
      },
      { threshold: 0 }
    );
    visObs.observe(c);

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", size);
      document.removeEventListener("visibilitychange", onVis);
      visObs.disconnect();
    };
  }, []);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.95 }} />;
}

// Section eyebrow with optional "?" tooltip — surfaces 2-3 lines of
// inline help on hover/focus so beginners learn what works without
// us shipping a full onboarding tour. `tooltip` is plain text.
function SectionEyebrow({ children, tooltip }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 800,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: C.accent,
        marginBottom: 12,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span>{children}</span>
      {tooltip && (
        <span style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            aria-label="What does this do?"
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: C.panelSoft,
              border: `1px solid ${C.border}`,
              color: C.textSoft,
              fontSize: 10,
              fontWeight: 800,
              cursor: "help",
              fontFamily: "inherit",
              padding: 0,
              lineHeight: 1,
            }}
          >
            ?
          </button>
          {open && (
            <span
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: -8,
                width: 260,
                background: "#0d0d0f",
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 11.5,
                fontWeight: 500,
                letterSpacing: 0,
                textTransform: "none",
                color: C.textSoft,
                lineHeight: 1.5,
                zIndex: 5,
                boxShadow: "0 12px 32px -8px rgba(0,0,0,0.6)",
              }}
            >
              {tooltip}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

// Easy ↔ Pro mode tabs at the top of the form. Easy is the default
// for new users — single prompt + Surprise-me + Generate. Pro is for
// users who want full control over genre / mood / duration / vocal.
function ModeTabs({ mode, onChange }) {
  const tabs = [
    { id: "easy", label: "Easy", sub: "1 prompt → 1 track" },
    { id: "pro",  label: "Pro",  sub: "Full control" },
  ];
  return (
    <div
      style={{
        display: "inline-flex",
        background: C.panelSoft,
        border: `1px solid ${C.border}`,
        borderRadius: 999,
        padding: 3,
        gap: 2,
      }}
    >
      {tabs.map((t) => {
        const on = t.id === mode;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              border: "none",
              background: on ? "linear-gradient(135deg, #D9FF00, #A6CC00)" : "transparent",
              color: on ? "#0a0a0a" : C.textSoft,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "0.04em",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {t.label}
            <span style={{ fontSize: 9.5, opacity: 0.7, fontWeight: 600, letterSpacing: 0 }}>
              {t.sub}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Word-count strength meter under the prompt input. Reads the
// 15-30-word "sweet spot" out of the music engine's own best-practice docs and
// surfaces it as a horizontal bar + status label.
function PromptStrength({ value }) {
  const words = (value || "").trim().split(/\s+/).filter(Boolean).length;
  let label, color, pct;
  if (words === 0)        { label = "Type a prompt or pick a starter below";  color = C.muted;   pct = 0; }
  else if (words < 8)     { label = "Too short — add genre + mood + instruments"; color = C.warning; pct = 0.2; }
  else if (words < 15)    { label = `Decent — adding a few more descriptors will sharpen the result (${words}/15)`; color = C.warning; pct = 0.55; }
  else if (words <= 30)   { label = `✓ Sweet spot (${words} words)`; color = C.accent; pct = 0.95; }
  else if (words <= 50)   { label = `Wordy but still OK (${words} words)`; color = C.accent; pct = 0.8; }
  else                    { label = `Too long — the model may ignore details (${words} words)`; color = C.warning; pct = 0.65; }
  return (
    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          flex: 1,
          height: 4,
          background: C.panelSoft,
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct * 100}%`,
            height: "100%",
            background: color,
            transition: "width 0.25s, background 0.25s",
            borderRadius: 999,
          }}
        />
      </div>
      <span style={{ fontSize: 10.5, color, fontWeight: 600, flexShrink: 0 }}>
        {label}
      </span>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: C.border, margin: "26px 0" }} />;
}

function ThreeColRow({ children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
      {children}
    </div>
  );
}

function PromptInput({ value, onChange }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="e.g. Dark electronic dystopian atmosphere with breathy female vocals…"
      rows={2}
      style={{
        width: "100%",
        background: C.panelSoft,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "14px 16px",
        color: C.text,
        fontSize: 14,
        fontFamily: "inherit",
        resize: "vertical",
        outline: "none",
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = C.borderHover)}
      onBlur={(e) => (e.currentTarget.style.borderColor = C.border)}
    />
  );
}

function TemplateChips({ onPick }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
      {TEMPLATES.map((t) => (
        <button
          key={t}
          onClick={() => onPick(t)}
          style={{
            padding: "6px 12px",
            borderRadius: 999,
            background: "transparent",
            border: `1px solid ${C.border}`,
            color: C.textSoft,
            fontSize: 11.5,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = C.accentSoft;
            e.currentTarget.style.borderColor = C.borderHover;
            e.currentTarget.style.color = C.text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = C.border;
            e.currentTarget.style.color = C.textSoft;
          }}
        >
          + {t}
        </button>
      ))}
    </div>
  );
}

function GenreGrid({ value, onChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
      {GENRES.map((g) => (
        <GenreCard key={g.id} g={g} on={g.id === value} onClick={() => onChange(g.id)} />
      ))}
    </div>
  );
}

// Each genre card is themed in its own hue — gold for cinematic,
// teal for ambient, red for rock, violet for orchestral, etc. The
// selected card lights up with a deeper wash + glow ring; unselected
// cards show a hint of the hue on the border so the grid reads as
// "a palette of choices" rather than a wall of identical boxes.
function GenreCard({ g, on, onClick }) {
  const [hover, setHover] = useState(false);
  const lit = on || hover;
  // Inline gradient backdrop scaled by hover state — costs ~0 because
  // it's a single linear-gradient (CSS compositor handles it).
  const bg = lit
    ? `linear-gradient(135deg, hsl(${g.hue} 70% 14%) 0%, hsl(${g.hue} 60% 6%) 100%)`
    : `linear-gradient(135deg, hsl(${g.hue} 30% 9%) 0%, #1c1c1c 100%)`;
  const borderColor = on
    ? `hsl(${g.hue} 85% 60%)`
    : hover
      ? `hsl(${g.hue} 65% 45%)`
      : `hsl(${g.hue} 30% 22%)`;
  const labelColor = on ? `hsl(${g.hue} 95% 75%)` : "#f1f5f9";
  const subColor = on ? `hsl(${g.hue} 60% 70%)` : "#64748b";
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        textAlign: "left",
        padding: "16px 16px 14px",
        borderRadius: 14,
        background: bg,
        border: `1px solid ${borderColor}`,
        color: "#f1f5f9",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all 0.2s ease",
        transform: hover && !on ? "translateY(-2px)" : "translateY(0)",
        boxShadow: on ? `0 0 0 1px hsl(${g.hue} 70% 50% / 0.25) inset, 0 12px 28px -12px hsl(${g.hue} 80% 50% / 0.45)` : "none",
        overflow: "hidden",
      }}
    >
      {/* Decorative noise/grain overlay using a radial gradient —
          gives the card a slight "texture" without needing an image. */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 80% 0%, hsl(${g.hue} 80% 50% / ${on ? 0.18 : 0.05}), transparent 60%)`,
          pointerEvents: "none",
          transition: "opacity 0.2s",
        }}
      />
      <div style={{ position: "relative", fontSize: 26, lineHeight: 1, marginBottom: 8 }}>{g.icon}</div>
      <div style={{ position: "relative", fontSize: 13, fontWeight: 800, color: labelColor, letterSpacing: "-0.005em" }}>
        {g.label}
      </div>
      <div style={{ position: "relative", fontSize: 10.5, color: subColor, marginTop: 3, fontWeight: 600 }}>
        {g.sub}
      </div>
      {on && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: `hsl(${g.hue} 85% 55%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 900,
            color: "#0a0a0a",
            boxShadow: `0 0 12px hsl(${g.hue} 80% 50% / 0.6)`,
          }}
        >
          ✓
        </span>
      )}
    </button>
  );
}

function MoodPicker({ value, onChange }) {
  return (
    <FormBox label="Mood">
      <select value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle()}>
        {MOODS.map((m) => (
          <option key={m} value={m} style={{ background: C.panel, color: C.text }}>{m}</option>
        ))}
      </select>
    </FormBox>
  );
}

function DurationPicker({ value, onChange }) {
  return (
    <FormBox label="Duration">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        {DURATIONS.map((d) => {
          const on = d.sec === value;
          return (
            <button
              key={d.sec}
              onClick={() => onChange(d.sec)}
              style={{
                padding: "10px 6px",
                borderRadius: 8,
                background: on ? C.accent : C.panelSoft,
                border: `1px solid ${on ? C.accent : C.border}`,
                color: on ? "#0a0a0a" : C.text,
                fontSize: 12.5,
                fontWeight: on ? 800 : 600,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s",
              }}
            >
              {d.label}
              <span style={{ display: "block", fontSize: 9.5, opacity: 0.7, marginTop: 2 }}>{d.credits} cr</span>
            </button>
          );
        })}
      </div>
    </FormBox>
  );
}

function VocalToggle({ value, onChange }) {
  return (
    <FormBox label="Vocal mode">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        <button onClick={() => onChange(false)} style={vocalBtn(!value)}>Instrumental</button>
        <button onClick={() => onChange(true)} style={vocalBtn(value)}>
          With vocals
          <span style={{ display: "block", fontSize: 9.5, opacity: 0.7, marginTop: 2 }}>+4 cr</span>
        </button>
      </div>
    </FormBox>
  );
}

// Top-level 4-state vocal picker — the music engine-parity replacement for the
// old VocalToggle. Surfaces Female / Male / Auto explicitly so users
// don't have to dig through Advanced. Each option has an icon + a
// one-liner subtitle so the choice is immediately understandable.
function VocalModeRow({ value, onChange }) {
  const opts = [
    { id: "instrumental", icon: "🎼", label: "Instrumental", sub: "No vocals", credits: "" },
    { id: "auto",         icon: "🎤", label: "Auto",         sub: "AI picks", credits: "+4 cr" },
    { id: "f",            icon: "♀",  label: "Female",       sub: "Female vocal", credits: "+4 cr" },
    { id: "m",            icon: "♂",  label: "Male",         sub: "Male vocal", credits: "+4 cr" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
      {opts.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            style={{
              position: "relative",
              padding: "14px 12px 12px",
              borderRadius: 14,
              background: on
                ? "linear-gradient(135deg, rgba(217,255,0,0.18), rgba(217,255,0,0.06))"
                : C.panelSoft,
              border: `1px solid ${on ? C.accent : C.border}`,
              color: on ? C.accent : C.text,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.18s",
              transform: on ? "translateY(-1px)" : "translateY(0)",
              boxShadow: on ? `0 12px 28px -12px ${C.accent}55` : "none",
              textAlign: "left",
            }}
          >
            <div style={{ fontSize: 22, lineHeight: 1, marginBottom: 6 }}>{o.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: on ? C.accent : C.text }}>{o.label}</div>
            <div style={{ fontSize: 10.5, color: on ? C.accentDark : C.muted, marginTop: 2, fontWeight: 600 }}>
              {o.sub}
            </div>
            {o.credits && (
              <div
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  fontSize: 9.5,
                  fontWeight: 800,
                  color: on ? C.accent : C.muted,
                  background: on ? "rgba(0,0,0,0.25)" : C.panel,
                  border: `1px solid ${on ? C.accent : C.border}`,
                  padding: "2px 6px",
                  borderRadius: 6,
                  letterSpacing: "0.04em",
                }}
              >
                {o.credits}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Reference-audio mode selector + uploader (Phase A).
// Three-state radio that maps to the `referenceMode` state above:
//   • none              → vanilla text-to-music
//   • cover             → reference song, AI generates new everything
//                          in the same raag/melody
//   • add-instrumental  → user's vocal recording, AI preserves the
//                          vocals + adds instruments
// ────────────────────────────────────────────────────────────────────
function ReferenceModeRow({ value, onChange }) {
  const opts = [
    {
      id: "none",
      icon: "🎵",
      label: "No reference",
      sub: "Generate from a text prompt",
    },
    {
      id: "cover",
      icon: "📀",
      label: "Inspire from a song",
      sub: "Same raag, new everything",
    },
    {
      id: "add-instrumental",
      icon: "🎤",
      label: "Back my vocals",
      sub: "Your voice + AI instruments",
    },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 8,
        marginTop: 10,
      }}
    >
      {opts.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: on ? C.accentSoft : C.panelSoft,
              border: `1px solid ${on ? C.accent : C.border}`,
              color: on ? C.accent : C.textSoft,
              fontSize: 12.5,
              fontWeight: on ? 800 : 600,
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
              transition: "all 0.15s",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <span style={{ fontSize: 18 }}>{o.icon}</span>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: on ? C.accent : C.text }}>{o.label}</span>
            <span style={{ fontSize: 10.5, fontWeight: 500, color: C.muted, lineHeight: 1.3 }}>{o.sub}</span>
          </button>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// RecorderPanel — in-browser audio recorder using MediaRecorder.
//
// Used inside ReferenceUploadBox when the user taps "🎙️ Tap to record"
// instead of picking a file or pasting a URL. Captures vocals from
// the device mic, shows a live timer + animated red indicator while
// recording, then offers a preview <audio> player + "Re-record" /
// "Use this recording" actions.
//
// On accept, the recorded Blob is wrapped in a File (so it has a
// stable name + type) and passed to the parent's onComplete callback,
// which feeds it into the same /api/music/reference/upload pipeline
// as a normal file picker upload. Server already accepts audio/webm
// + audio/mp4 in its MIME allow-list.
//
// Codec choice: Chrome/Firefox/Android prefer audio/webm + opus;
// Safari (desktop + iOS) doesn't support webm but does support
// audio/mp4. We pick whichever the browser advertises support for.
//
// 5-minute hard cap on recording length — auto-stops at 300s so a
// user who leaves the tab open doesn't blow past R2's 25 MB upload
// cap with a forgotten recording.
// ────────────────────────────────────────────────────────────────────
function RecorderPanel({ onComplete, onCancel, uploading }) {
  const [phase, setPhase] = useState("idle"); // idle | recording | recorded
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const blobRef = useRef(null);
  const mimeRef = useRef("audio/webm");
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  const MAX_SECONDS = 300; // 5 min hard cap

  // Tear down everything on unmount: stop the mic, drop the preview
  // ObjectURL, clear the timer. Prevents the red mic-recording light
  // from staying on if the user navigates away mid-record.
  useEffect(() => {
    return () => {
      try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
      streamRef.current = null;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-stop at the cap. Defensive — the user normally stops
  // manually well before 5 min, but if they wander away from the
  // tab we don't want to record indefinitely.
  useEffect(() => {
    if (phase === "recording" && elapsed >= MAX_SECONDS) {
      stopRecording();
    }
  }, [elapsed, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startRecording() {
    setError("");
    // Drop any previous preview so the UI shows a clean recording state.
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Your browser doesn't support in-page recording. Try Chrome / Safari on a more recent device.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Voice-optimised constraints. echoCancellation + noiseSuppression
          // give cleaner takes for the AI to read.
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Pick the best supported MIME. Order matters: webm/opus on
      // Chrome/Firefox/Android, mp4 on Safari.
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/mp4;codecs=mp4a.40.2",
      ];
      let chosen = "";
      for (const c of candidates) {
        if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(c)) {
          chosen = c;
          break;
        }
      }
      mimeRef.current = chosen || "audio/webm";

      const rec = chosen
        ? new MediaRecorder(stream, { mimeType: chosen })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        // Some browsers report mimeType "" — fall back to what we
        // requested so the Blob has a sensible type for the upload.
        const type = rec.mimeType || mimeRef.current || "audio/webm";
        mimeRef.current = type;
        const blob = new Blob(chunksRef.current, { type });
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setPhase("recorded");
        try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
        streamRef.current = null;
      };
      rec.start();
      recorderRef.current = rec;
      setPhase("recording");
      setElapsed(0);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch (e) {
      if (e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError") {
        setError("Mic permission denied. Enable it in your browser settings and try again.");
      } else if (e?.name === "NotFoundError") {
        setError("No microphone found on this device.");
      } else {
        setError(`Couldn't access mic: ${e?.message || "unknown error"}`);
      }
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state === "recording") {
      try { recorderRef.current.stop(); } catch {}
    }
  }

  function reRecord() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    blobRef.current = null;
    chunksRef.current = [];
    setElapsed(0);
    setPhase("idle");
    setError("");
  }

  function accept() {
    if (!blobRef.current) return;
    const type = mimeRef.current || blobRef.current.type || "audio/webm";
    // Pick a file extension that the server's MIME allow-list
    // recognises (webm + mp4/m4a are in EXT_TO_MIME on the server).
    const ext = type.includes("mp4") ? "m4a" : "webm";
    const file = new File(
      [blobRef.current],
      `voice-recording-${Date.now()}.${ext}`,
      { type }
    );
    onComplete(file);
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div
      style={{
        padding: 16,
        background: C.panel,
        border: `1px solid ${C.borderHover}`,
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <style>{`@keyframes recPulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%      { opacity: 0.55; transform: scale(0.88); }
      }`}</style>

      {phase === "idle" && (
        <>
          <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
            <button
              type="button"
              onClick={startRecording}
              disabled={uploading}
              aria-label="Start recording"
              style={{
                width: 88,
                height: 88,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #ef4444, #b91c1c)",
                border: `2px solid rgba(239,68,68,0.45)`,
                color: "#fff",
                fontSize: 32,
                cursor: uploading ? "default" : "pointer",
                opacity: uploading ? 0.5 : 1,
                fontFamily: "inherit",
                boxShadow: "0 16px 40px -16px rgba(239,68,68,0.6)",
                transition: "transform 0.15s",
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.95)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              🎙️
            </button>
          </div>
          <div style={{ textAlign: "center", fontSize: 13, color: C.textSoft, lineHeight: 1.55 }}>
            Tap the mic to start recording. Hum, sing your verse, sketch a raag —
            up to 5 minutes.
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: "transparent",
                border: `1px solid ${C.border}`,
                color: C.muted,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Back
            </button>
          </div>
        </>
      )}

      {phase === "recording" && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: "10px 0 6px",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "#ef4444",
                boxShadow: "0 0 0 5px rgba(239,68,68,0.25)",
                animation: "recPulse 1.1s ease-in-out infinite",
                display: "inline-block",
              }}
            />
            <span
              style={{
                fontSize: 28,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: C.text,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {mm}:{ss}
            </span>
          </div>
          <div style={{ textAlign: "center", fontSize: 11.5, color: C.muted }}>
            Recording… auto-stops at 5:00 if you forget.
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
            <button
              type="button"
              onClick={stopRecording}
              style={{
                padding: "12px 22px",
                borderRadius: 10,
                background: "linear-gradient(135deg, #ef4444, #b91c1c)",
                border: "none",
                color: "#fff",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
                letterSpacing: "0.02em",
                boxShadow: "0 10px 24px -12px rgba(239,68,68,0.6)",
              }}
            >
              ■ Stop
            </button>
          </div>
        </>
      )}

      {phase === "recorded" && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, color: C.textSoft, fontWeight: 600 }}>
              Recording · {mm}:{ss}
            </div>
            {previewUrl && (
              <audio
                src={previewUrl}
                controls
                style={{ width: "100%", borderRadius: 8 }}
              />
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reRecord}
              disabled={uploading}
              style={{
                flex: "1 1 120px",
                padding: "10px 14px",
                borderRadius: 10,
                background: C.panelSoft,
                border: `1px solid ${C.border}`,
                color: C.textSoft,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: uploading ? "default" : "pointer",
                fontFamily: "inherit",
                opacity: uploading ? 0.6 : 1,
              }}
            >
              ↻ Re-record
            </button>
            <button
              type="button"
              onClick={accept}
              disabled={uploading}
              style={{
                flex: "2 1 200px",
                padding: "10px 14px",
                borderRadius: 10,
                background: uploading
                  ? C.panelSoft
                  : `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
                border: `1px solid ${uploading ? C.border : C.accent}`,
                color: uploading ? C.muted : "#0a0a0a",
                fontSize: 13,
                fontWeight: 800,
                cursor: uploading ? "default" : "pointer",
                fontFamily: "inherit",
                letterSpacing: "0.02em",
              }}
            >
              {uploading ? "Uploading…" : "✓ Use this recording"}
            </button>
          </div>
        </>
      )}

      {error && (
        <div
          style={{
            padding: "8px 12px",
            background: "rgba(239,68,68,0.10)",
            border: `1px solid rgba(239,68,68,0.32)`,
            borderRadius: 8,
            fontSize: 12,
            color: C.danger,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

// Combined file-picker + URL-paster + tap-to-record used by both
// reference modes. The upload pipeline is the same regardless of input
// source — file, fetched URL, or browser-recorded blob — so this one
// component handles all three and only the helper copy adapts per
// mode (cover vs add-instrumental).
function ReferenceUploadBox({ mode, file, uploading, error, onFile, onUrl, onClear }) {
  const [urlInput, setUrlInput] = useState("");
  // Recording mode: when true, the box hides the picker controls and
  // shows the live RecorderPanel instead. Switches back to picker on
  // cancel OR on successful upload (the parent clears it via `file`).
  const [recording, setRecording] = useState(false);
  const fileInputRef = useRef(null);
  const explainer =
    mode === "cover"
      ? "Upload a song you love. The AI keeps the melody/raag intact and generates new vocals + instruments around it."
      : "Upload your vocal recording (no background music — just your voice). The AI preserves your vocals and adds instruments around them.";
  const accept = "audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac";
  return (
    <div
      style={{
        marginTop: 12,
        padding: 16,
        background: C.panelSoft,
        border: `1px dashed ${C.border}`,
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 12, color: C.textSoft, lineHeight: 1.55 }}>
        {explainer}
      </div>
      {file ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            background: C.panel,
            border: `1px solid ${C.borderHover}`,
            borderRadius: 10,
          }}
        >
          <span style={{ fontSize: 18 }}>🎧</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: C.text,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {file.name}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              {(file.size / 1024 / 1024).toFixed(1)} MB · uploaded ✓
            </div>
          </div>
          <button
            type="button"
            onClick={onClear}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.muted,
              fontSize: 11.5,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Remove
          </button>
        </div>
      ) : recording ? (
        // Live recording panel — mic capture inside the page. On
        // completion the recorded blob is wrapped in a File and
        // handed back to onFile() so it goes through the same R2
        // upload pipeline as a file picker upload.
        <RecorderPanel
          uploading={uploading}
          onComplete={(recordedFile) => {
            setRecording(false);
            onFile(recordedFile);
          }}
          onCancel={() => setRecording(false)}
        />
      ) : (
        <>
          {/* File picker + tap-to-record — two big primary actions */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = ""; // allow re-pick of same file
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                flex: "1 1 180px",
                padding: "12px 16px",
                borderRadius: 10,
                background: uploading ? C.panelSoft : C.panel,
                border: `1px solid ${C.borderHover}`,
                color: uploading ? C.muted : C.accent,
                fontSize: 13,
                fontWeight: 800,
                cursor: uploading ? "default" : "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s",
              }}
            >
              {uploading ? "Uploading…" : "📁 Choose audio file"}
            </button>
            <button
              type="button"
              onClick={() => setRecording(true)}
              disabled={uploading}
              style={{
                flex: "1 1 180px",
                padding: "12px 16px",
                borderRadius: 10,
                background: uploading ? C.panelSoft : C.panel,
                border: `1px solid rgba(239,68,68,0.40)`,
                color: uploading ? C.muted : "#fca5a5",
                fontSize: 13,
                fontWeight: 800,
                cursor: uploading ? "default" : "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s",
              }}
            >
              🎙️ Tap to record
            </button>
          </div>
          {/* URL input */}
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Or paste a direct MP3/WAV URL"
              disabled={uploading}
              style={{
                flex: "1 1 200px",
                padding: "10px 14px",
                background: C.panel,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                color: C.text,
                fontSize: 12.5,
                fontFamily: "inherit",
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={() => {
                const u = urlInput.trim();
                if (u) {
                  onUrl(u);
                  setUrlInput("");
                }
              }}
              disabled={uploading || !urlInput.trim()}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                background: urlInput.trim() && !uploading ? C.accent : C.panelSoft,
                border: `1px solid ${urlInput.trim() && !uploading ? C.accent : C.border}`,
                color: urlInput.trim() && !uploading ? "#0a0a0a" : C.muted,
                fontSize: 12.5,
                fontWeight: 800,
                cursor: urlInput.trim() && !uploading ? "pointer" : "default",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}
            >
              Fetch URL
            </button>
          </div>
        </>
      )}
      {error && (
        <div
          style={{
            padding: "8px 12px",
            background: "rgba(239,68,68,0.10)",
            border: `1px solid rgba(239,68,68,0.32)`,
            borderRadius: 8,
            fontSize: 12,
            color: C.danger,
          }}
        >
          {error}
        </div>
      )}
      <div style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.5 }}>
        MP3, WAV, M4A, FLAC, OGG · up to 25 MB · stays private to your account.
        YouTube / SoundCloud links aren&rsquo;t supported — convert to MP3 first
        (e.g. cobalt.tools) then paste the direct URL.
      </div>
    </div>
  );
}

// Auto-generate ↔ Write yours sub-tabs inside the Lyrics section.
// Mirrors the music engine Custom Mode's lyrics toggle. Visual contract is the
// same as ModeTabs (the page-level Easy/Pro switcher) so they read
// as siblings.
function LyricsModeTabs({ value, onChange }) {
  const tabs = [
    { id: "auto",   label: "Auto-generate", sub: "AI writes lyrics" },
    { id: "custom", label: "Write yours",   sub: "Full control" },
  ];
  return (
    <div
      style={{
        display: "inline-flex",
        background: C.panelSoft,
        border: `1px solid ${C.border}`,
        borderRadius: 999,
        padding: 3,
        gap: 2,
      }}
    >
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              border: "none",
              background: on ? "linear-gradient(135deg, #D9FF00, #A6CC00)" : "transparent",
              color: on ? "#0a0a0a" : C.textSoft,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "0.04em",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {t.label}
            <span style={{ fontSize: 9.5, opacity: 0.7, fontWeight: 600, letterSpacing: 0 }}>
              {t.sub}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Free-text Style override — appears below the genre grid. Empty =
// genre preset wins (default behaviour). Non-empty = sent to the
// music engine as the canonical Style string; capped at 1000 chars.
function StyleOverride({ value, onChange }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: C.muted,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 6,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>Custom style (optional)</span>
        <span style={{ fontSize: 9.5, color: C.accent, fontWeight: 700, letterSpacing: "0.06em" }}>
          Overrides preset
        </span>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 1000))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="e.g. lo-fi hip-hop, jazzy piano, mellow brushed drums, warm vinyl crackle"
        maxLength={1000}
        style={{
          width: "100%",
          background: C.panelSoft,
          border: `1px solid ${focused ? C.borderHover : C.border}`,
          borderRadius: 10,
          padding: "10px 12px",
          color: C.text,
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
          transition: "border-color 0.15s",
        }}
      />
      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6, lineHeight: 1.55 }}>
        Type comma-separated descriptors. Leave blank to use the preset above.
        Examples: <i>“cinematic film score, sweeping strings, brass, slow build”</i>{" "}
        or <i>“synthwave, retro arpeggios, gated reverb drums, analog bassline”</i>.
      </div>
    </div>
  );
}

function vocalBtn(on) {
  return {
    padding: "10px 6px",
    borderRadius: 8,
    background: on ? C.accent : C.panelSoft,
    border: `1px solid ${on ? C.accent : C.border}`,
    color: on ? "#0a0a0a" : C.text,
    fontSize: 12.5,
    fontWeight: on ? 800 : 600,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.15s",
  };
}

function LyricsBox({ value, onChange, onOpenHelper }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 6,
        }}
      >
        <SectionEyebrow>Lyrics</SectionEyebrow>
        {onOpenHelper && <LyricHelperLaunchButton onClick={onOpenHelper} />}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`[Verse 1]\nWalking through the neon-stained streets…\n\n[Chorus]\n…`}
        rows={5}
        style={{
          width: "100%",
          background: C.panelSoft,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: "14px 16px",
          color: C.text,
          fontSize: 13,
          fontFamily: "inherit",
          lineHeight: 1.6,
          resize: "vertical",
          outline: "none",
        }}
      />
      <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
        Use [Verse], [Chorus], [Bridge] tags for structure — the AI picks up on them.
        Stuck? Tap <b style={{ color: C.text }}>✨ Help me write lyrics</b> above to draft a full song from one line.
      </div>
    </div>
  );
}

// Pill button that opens the LyricHelperModal. Lime-bordered ghost
// style so it reads as a secondary helper, not a primary CTA — the
// main Generate button stays the visual focal point.
function LyricHelperLaunchButton({ onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "7px 14px",
        borderRadius: 999,
        background: hover ? C.accentSoft : C.panelSoft,
        border: `1px solid ${C.borderHover}`,
        color: C.accent,
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: "0.02em",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "background 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      ✨ Help me write lyrics
    </button>
  );
}

function AdvancedOptions({
  open, onToggle,
  tempo, onTempoChange,
  model, onModelChange,
  negativeTags, onNegativeTagsChange,
}) {
  return (
    <div style={{ marginTop: 18 }}>
      <button
        onClick={onToggle}
        style={{
          background: "transparent",
          border: "none",
          color: C.textSoft,
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span>{open ? "▾" : "▸"}</span>
        Advanced (tempo · model · negative tags)
      </button>
      {open && (
        <div
          style={{
            marginTop: 12,
            padding: 16,
            background: C.panelSoft,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* Tempo slider — was previously the only Advanced field. */}
          <FormBox label={`Tempo · ${tempo} BPM`}>
            <input
              type="range"
              min={60}
              max={180}
              value={tempo}
              onChange={(e) => onTempoChange(Number(e.target.value))}
              style={{ width: "100%", accentColor: C.accent }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted, marginTop: 2 }}>
              <span>Slow</span><span>Medium</span><span>Fast</span>
            </div>
          </FormBox>

          {/* Model picker — four-button row across all available
              engine versions. V5 is the default (best quality);
              V4 = fastest + cheapest at upstream tier; V5.5 = newest.
              Wholesale cost is identical so we don't charge
              differently per model — just call out the quality tier
              in the subtitle so users understand the trade. */}
          <FormBox label="Model">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 6 }}>
              {[
                { id: "V4",   label: "V4",    sub: "Fastest" },
                { id: "V4_5", label: "V4.5",  sub: "Balanced" },
                { id: "V5",   label: "V5",    sub: "Best quality" },
                { id: "V5_5", label: "V5.5",  sub: "Newest" },
              ].map((m) => {
                const on = m.id === model;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onModelChange(m.id)}
                    style={{
                      padding: "8px 6px",
                      borderRadius: 8,
                      background: on ? C.accent : C.bg,
                      border: `1px solid ${on ? C.accent : C.border}`,
                      color: on ? "#0a0a0a" : C.text,
                      fontSize: 12,
                      fontWeight: on ? 800 : 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {m.label}
                    <span style={{ display: "block", fontSize: 9.5, opacity: 0.7, marginTop: 2 }}>{m.sub}</span>
                  </button>
                );
              })}
            </div>
          </FormBox>

          {/* Negative tags — what to NOT include. Comma-separated. */}
          <FormBox label="Negative tags (what to avoid)">
            <input
              type="text"
              value={negativeTags}
              onChange={(e) => onNegativeTagsChange(e.target.value.slice(0, 300))}
              placeholder="e.g. heavy metal, screaming, autotune"
              maxLength={300}
              style={{
                width: "100%",
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "8px 12px",
                color: C.text,
                fontSize: 12.5,
                fontFamily: "inherit",
                outline: "none",
              }}
            />
            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
              Comma-separated list of styles / instruments / moods the engine
              should avoid. Leave blank for no constraint.
            </div>
          </FormBox>
        </div>
      )}
    </div>
  );
}

function GenerateBar({ cost, busy, onGenerate }) {
  return (
    <div
      style={{
        marginTop: 26,
        padding: "18px 20px",
        background: "linear-gradient(135deg, rgba(217,255,0,0.10), rgba(166,204,0,0.04))",
        border: `1px solid ${C.borderHover}`,
        borderRadius: 14,
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
          Cost · <span style={{ color: C.accent }}>{cost} credits</span>
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
          Royalty-free for personal &amp; commercial use · ~2 min until ready
        </div>
      </div>
      <button
        onClick={onGenerate}
        disabled={busy}
        style={{
          padding: "12px 28px",
          background: busy ? C.panelSoft : `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
          border: "none",
          color: busy ? C.muted : "#0a0a0a",
          fontSize: 14,
          fontWeight: 800,
          borderRadius: 10,
          cursor: busy ? "default" : "pointer",
          fontFamily: "inherit",
          letterSpacing: "0.02em",
          boxShadow: busy ? "none" : `0 12px 28px -10px ${C.accent}88`,
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
      >
        {busy ? "Starting…" : "▶ Generate music"}
      </button>
    </div>
  );
}

function FormBox({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function selectStyle() {
  return {
    width: "100%",
    background: C.panelSoft,
    border: `1px solid ${C.border}`,
    color: C.text,
    padding: "10px 12px",
    borderRadius: 8,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    cursor: "pointer",
  };
}

// ────────────────────────────────────────────────────────────────────
// Generating state — equaliser + optional early stream preview
// ────────────────────────────────────────────────────────────────────
function GeneratingPanel({ onCancel, streamUrl }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div
      style={{
        marginTop: -80,
        position: "relative",
        zIndex: 2,
        background: C.panel,
        border: `1px solid ${C.borderHover}`,
        borderRadius: 18,
        padding: "60px 24px",
        textAlign: "center",
        boxShadow: "0 28px 80px -20px rgba(0,0,0,0.7)",
      }}
    >
      <EqualizerBars />
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 28, color: C.text }}>
        {streamUrl ? "Final mix rendering…" : "Composing your track…"}
      </div>
      <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>
        Streaming preview in ~30–40s · final mix ready in ~2–3 min · {seconds}s elapsed
      </div>
      {streamUrl && (
        <div style={{ marginTop: 16 }}>
          <audio src={streamUrl} controls style={{ width: "100%", maxWidth: 420 }} />
          <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
            Listen to the preview while we finish the final mix.
          </div>
        </div>
      )}
      <div style={{ maxWidth: 360, margin: "20px auto 0", height: 4, background: C.panelSoft, borderRadius: 999, overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, transparent, ${C.accent}, transparent)`, animation: "musicProgress 1.6s linear infinite" }} />
      </div>
      <button
        onClick={onCancel}
        style={{
          marginTop: 24,
          background: "transparent",
          border: `1px solid ${C.border}`,
          color: C.muted,
          padding: "8px 14px",
          borderRadius: 8,
          fontSize: 11.5,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Run in background
      </button>
      <style>{`@keyframes musicProgress { from { transform: translateX(-100%);} to { transform: translateX(100%);} }`}</style>
    </div>
  );
}

function EqualizerBars() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 4, height: 80 }}>
      {Array.from({ length: 24 }).map((_, i) => {
        const delay = (i * 0.06).toFixed(2);
        return (
          <div
            key={i}
            style={{
              width: 6,
              height: 8,
              background: `linear-gradient(180deg, ${C.accent}, ${C.accentDark})`,
              borderRadius: 3,
              animation: `eqBar 1s ease-in-out ${delay}s infinite`,
              transformOrigin: "bottom",
            }}
          />
        );
      })}
      <style>{`@keyframes eqBar { 0%, 100% { transform: scaleY(0.2); opacity: 0.5; } 50% { transform: scaleY(8); opacity: 1; } }`}</style>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Player — uses a real <audio> element bound to the track's src.
// ────────────────────────────────────────────────────────────────────
function PlayerPanel({ track, onReset }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(track.actualDuration || track.durationReq || 60);

  // Prefer R2 (permanent) → audioUrl (the music engine final, 15-day) → streamUrl (preview)
  const src = track.r2Url || track.audioUrl || track.streamUrl || "";

  // Bind play/pause + progress events.
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
  }, [src]);

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
    if (!src) return;
    const link = document.createElement("a");
    link.href = src;
    link.download = `${(track.title || "track").replace(/[^a-z0-9_-]/gi, "_")}.mp3`;
    link.click();
  }
  // Web Share API on mobile (native share sheet across WhatsApp /
  // SMS / Twitter / etc.); silently falls back to clipboard-copy
  // on desktop. Both paths point at the public /m/[id] permalink
  // that has rich OG metadata so previews render with the title +
  // creator + audio embed.
  const [shareToast, setShareToast] = useState("");
  async function onShare() {
    if (!track.id) return;
    const url = typeof window !== "undefined"
      ? `${window.location.origin}/m/${track.id}`
      : `/m/${track.id}`;
    const payload = {
      title: track.title,
      text: `🎵 ${track.title} — AI-generated soundtrack`,
      url,
    };
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share(payload); return; } catch { /* user cancelled */ }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        setShareToast("Link copied — paste anywhere");
        setTimeout(() => setShareToast(""), 2400);
      } catch {}
    }
  }

  return (
    <div
      style={{
        marginTop: -80,
        position: "relative",
        zIndex: 2,
        background: C.panel,
        border: `1px solid ${C.borderHover}`,
        borderRadius: 18,
        overflow: "hidden",
        boxShadow: "0 28px 80px -20px rgba(0,0,0,0.7)",
      }}
    >
      <div
        style={{
          height: 160,
          background:
            "linear-gradient(135deg, rgba(217,255,0,0.20) 0%, rgba(166,204,0,0.10) 40%, rgba(0,0,0,0) 80%), radial-gradient(ellipse at top right, rgba(236,72,153,0.20), transparent 60%)",
          display: "flex",
          alignItems: "flex-end",
          padding: 24,
        }}
      >
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, letterSpacing: "0.18em", textTransform: "uppercase" }}>
            ✓ Ready{track.genre ? ` · ${track.genre}` : ""}{track.mood ? ` · ${track.mood}` : ""}
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: C.text, marginTop: 6, letterSpacing: "-0.015em" }}>
            {track.title}
          </div>
        </div>
      </div>

      <PlayerWaveform pos={pos} onSeek={seek} />

      <audio ref={audioRef} src={src} preload="metadata" />

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
          <PlayerAction icon="⬇" label="Download MP3" onClick={onDownload} />
          <PlayerAction icon="↗" label="Share" onClick={onShare} />
          <PlayerAction icon="🎬" label="Use in video" onClick={() => {
            if (!track.id) return;
            // Cross-route hand-off — the Generate page reads
            // ?soundtrack=<id> on mount and shows an attached-track
            // pill above the prompt.
            window.location.href = `/generate?soundtrack=${track.id}`;
          }} />
          <PlayerAction icon="↻" label="Generate another" onClick={onReset} />
        </div>
      </div>
      {shareToast && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            right: 16,
            padding: "8px 14px",
            background: "rgba(13,13,15,0.96)",
            color: C.accent,
            border: `1px solid ${C.borderHover}`,
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            boxShadow: "0 12px 24px -8px rgba(0,0,0,0.5)",
            zIndex: 3,
          }}
        >
          {shareToast}
        </div>
      )}
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

function PlayerAction({ icon, label, onClick }) {
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
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = C.borderHover;
        e.currentTarget.style.color = C.accent;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = C.border;
        e.currentTarget.style.color = C.textSoft;
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function formatTime(s) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

// ────────────────────────────────────────────────────────────────────
// Pricing + Gallery + Footer
// ────────────────────────────────────────────────────────────────────
function PricingSection() {
  const rows = [
    { kind: "Instrumental · 30s",   credits: 4 },
    { kind: "Instrumental · 60s",   credits: 8 },
    { kind: "Instrumental · 2 min", credits: 14 },
    { kind: "Vocal · 60s",          credits: 12 },
    { kind: "Vocal · 2 min",        credits: 18 },
    { kind: "Cinematic · 3 min",    credits: 24 },
  ];
  return (
    <section style={{ marginTop: 60 }}>
      <SectionHeader title="Pricing" sub="Same wallet as videos · 80 credits = $1 · failed gens auto-refund" />
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", padding: "12px 18px", background: C.panelSoft, borderBottom: `1px solid ${C.border}`, fontSize: 10.5, fontWeight: 800, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          <span>Track type</span>
          <span style={{ textAlign: "right" }}>Credits</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.kind} style={{ display: "grid", gridTemplateColumns: "2fr 1fr", padding: "12px 18px", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, fontSize: 13 }}>
            <span style={{ color: C.text }}>{r.kind}</span>
            <span style={{ textAlign: "right", color: C.accent, fontWeight: 700 }}>{r.credits} cr</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function GallerySection({ tracks, onPickStarter, onSplitStems, onExtend }) {
  return (
    <section style={{ marginTop: 60 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <SectionHeader
          title={tracks.length === 0 ? "Start here" : "Your library"}
          sub={
            tracks.length === 0
              ? "Tap a starter to fill the form, then hit Generate"
              : `${tracks.length} ${tracks.length === 1 ? "track" : "tracks"} · 🔒 private · 🌐 published · ↗ shareable link`
          }
        />
        {/* Discover the public gallery — tracks other filmmakers
            have explicitly published. Always visible so users know
            it exists; opens in a new tab so they don't lose form
            state. */}
        <a
          href="/music/discover"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            background: C.panelSoft,
            border: `1px solid ${C.borderHover}`,
            borderRadius: 999,
            color: C.accent,
            fontSize: 11.5,
            fontWeight: 800,
            textDecoration: "none",
            whiteSpace: "nowrap",
            letterSpacing: "0.04em",
            flexShrink: 0,
          }}
        >
          🌐 Discover gallery →
        </a>
      </div>
      {tracks.length === 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {STARTERS.map((s) => (
            <StarterCard key={s.id} starter={s} onPick={() => {
              onPickStarter(s);
              // Scroll the form back into view so they see the
              // prompt got filled.
              if (typeof window !== "undefined") {
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
            }} />
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {tracks.map((t) => (
            <GalleryCard key={t.id} track={t} onSplitStems={onSplitStems} onExtend={onExtend} />
          ))}
        </div>
      )}
    </section>
  );
}

// Click-to-fill starter card — themed by its starter's genre hue so
// the empty-library row reads as a vibrant palette instead of four
// identical dark rectangles. Matches the GenreCard treatment.
function StarterCard({ starter, onPick }) {
  const [hover, setHover] = useState(false);
  // Look up the matching genre's hue. Fall back to the brand lime.
  const genre = GENRE_BY_ID[starter.genre];
  const hue = genre?.hue ?? 70;
  const bg = hover
    ? `linear-gradient(135deg, hsl(${hue} 70% 14%) 0%, hsl(${hue} 60% 6%) 100%)`
    : `linear-gradient(135deg, hsl(${hue} 35% 10%) 0%, #161616 100%)`;
  const borderColor = hover ? `hsl(${hue} 75% 55%)` : `hsl(${hue} 30% 22%)`;
  const labelColor = hover ? `hsl(${hue} 95% 78%)` : "#f1f5f9";
  return (
    <button
      type="button"
      onClick={onPick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        textAlign: "left",
        padding: "18px 18px 16px",
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 16,
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all 0.2s ease",
        transform: hover ? "translateY(-3px)" : "translateY(0)",
        boxShadow: hover ? `0 18px 36px -14px hsl(${hue} 80% 50% / 0.45)` : "none",
        overflow: "hidden",
        color: "#f1f5f9",
      }}
    >
      {/* Glow disc anchored top-right of the card — gives it depth */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: -20,
          right: -20,
          width: 100,
          height: 100,
          borderRadius: "50%",
          background: `radial-gradient(circle, hsl(${hue} 85% 55% / ${hover ? 0.32 : 0.14}) 0%, transparent 70%)`,
          pointerEvents: "none",
          transition: "all 0.3s",
        }}
      />
      <div style={{ position: "relative", fontSize: 28, lineHeight: 1, marginBottom: 10 }}>
        {starter.icon}
      </div>
      <div style={{ position: "relative", fontSize: 14.5, fontWeight: 800, color: labelColor, letterSpacing: "-0.005em" }}>
        {starter.label}
      </div>
      <div style={{ position: "relative", fontSize: 10.5, color: hover ? `hsl(${hue} 60% 75%)` : "#64748b", marginTop: 3, letterSpacing: "0.06em", fontWeight: 700, textTransform: "uppercase" }}>
        {starter.sub}
      </div>
      <div
        style={{
          position: "relative",
          marginTop: 12,
          fontSize: 11.5,
          color: "#cbd5e1",
          lineHeight: 1.5,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          fontStyle: "italic",
          opacity: 0.85,
        }}
      >
        “{starter.prompt}”
      </div>
      <div
        style={{
          position: "relative",
          marginTop: 14,
          fontSize: 10.5,
          fontWeight: 800,
          color: hover ? `hsl(${hue} 90% 70%)` : C.accent,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        Tap to load
        <span style={{ transform: hover ? "translateX(4px)" : "translateX(0)", transition: "transform 0.2s" }}>
          →
        </span>
      </div>
    </button>
  );
}

function GalleryCard({ track, onSplitStems, onExtend }) {
  const [hover, setHover] = useState(false);
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const src = track.r2Url || track.audioUrl || track.streamUrl || "";
  function toggle() {
    if (!src) return;
    if (!audioRef.current) audioRef.current = new Audio(src);
    if (audioRef.current.paused) {
      audioRef.current.play();
      setPlaying(true);
      audioRef.current.onended = () => setPlaying(false);
    } else {
      audioRef.current.pause();
      setPlaying(false);
    }
  }
  // Pause when the row unmounts to avoid orphaned audio.
  useEffect(() => () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
  }, []);
  const isReady = track.status === "completed" && !!src;
  const isProcessing = track.status === "processing";
  const isFailed = track.status === "failed";

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: C.panel,
        border: `1px solid ${hover ? C.borderHover : C.border}`,
        borderRadius: 12,
        padding: 16,
        cursor: isReady ? "pointer" : "default",
        transition: "border-color 0.15s, transform 0.15s",
        transform: hover && isReady ? "translateY(-2px)" : "translateY(0)",
        opacity: isFailed ? 0.65 : 1,
      }}
    >
      <MiniWaveform color={hover ? C.accent : C.accentDark} />
      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {track.title}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
            {track.genre || "—"}{track.mood ? ` · ${track.mood}` : ""}
            {isReady && ` · ${formatTime(track.actualDuration || track.durationReq)}`}
            {isProcessing && " · generating…"}
            {isFailed && " · failed"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {isReady && onSplitStems && (
            <CardStemControl
              trackId={track.id}
              stemStatus={track.stemStatus}
              vocalUrl={track.vocalUrl}
              instrumentalUrl={track.instrumentalUrl}
              stemError={track.stemError}
              onSplit={onSplitStems}
            />
          )}
          {isReady && onExtend && (
            <CardExtendButton trackId={track.id} onExtend={onExtend} />
          )}
          {isReady && (
            <CardPublishButton trackId={track.id} initialPublic={!!track.public} />
          )}
          {isReady && (
            <CardShareButton trackId={track.id} title={track.title} />
          )}
          {isReady ? (
            <button
              onClick={toggle}
              aria-label={playing ? "Pause" : "Play"}
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: hover ? `linear-gradient(135deg, ${C.accent}, ${C.accentDark})` : C.panelSoft,
                border: `1px solid ${hover ? C.accent : C.border}`,
                color: hover ? "#0a0a0a" : C.accent,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              {playing ? "❚❚" : "▶"}
            </button>
          ) : (
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: C.panelSoft,
              border: `1px solid ${C.border}`,
              color: isFailed ? C.danger : C.muted,
              fontSize: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {isFailed ? "✕" : "⏳"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Owner-only "🌐 Publish to gallery" toggle on every library card.
// Flips MusicTrack.public, which controls whether the track is
// LISTED on /music/discover. Sharing via the share button is
// independent — the /m/[id] permalink stays open regardless.
function CardPublishButton({ trackId, initialPublic }) {
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [busy, setBusy] = useState(false);
  async function toggle(e) {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const method = isPublic ? "DELETE" : "POST";
      const res = await fetch(`/api/music/tracks/${trackId}/publish`, { method });
      if (res.ok) setIsPublic(!isPublic);
    } catch {} finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-label={isPublic ? "Remove from public gallery" : "Publish to public gallery"}
      title={isPublic ? "Published — tap to make private" : "Publish to /music/discover"}
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: isPublic ? "rgba(217,255,0,0.15)" : "transparent",
        border: `1px solid ${isPublic ? C.accent : C.border}`,
        color: isPublic ? C.accent : C.textSoft,
        fontSize: 13,
        cursor: busy ? "default" : "pointer",
        fontFamily: "inherit",
        transition: "all 0.15s",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: busy ? 0.6 : 1,
      }}
    >
      {isPublic ? "🌐" : "🔒"}
    </button>
  );
}

// "Extend track" button on every completed library card. Kicks off a
// Suno upload-extend call which creates a NEW MusicTrack row with the
// original audio + ~30-90s of continuation in the same style.
// Disabled while busy (debounce double-click) — once the upstream
// call lands the new row appears in the library in "processing"
// state. The existing main-track poll picks it up + flips it to
// "completed" when ready.
function CardExtendButton({ trackId, onExtend }) {
  const [busy, setBusy] = useState(false);
  async function trigger(e) {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await onExtend(trackId);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={trigger}
      disabled={busy}
      aria-label="Extend this track"
      title="Add ~30-90s in the same style · 8 credits"
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: "transparent",
        border: `1px solid ${C.border}`,
        color: C.textSoft,
        fontSize: 13,
        cursor: busy ? "default" : "pointer",
        fontFamily: "inherit",
        transition: "all 0.15s",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: busy ? 0.6 : 1,
      }}
    >
      ⏩
    </button>
  );
}

// Stem-split control on every library card. Four states:
//   • null            — show "🎚️ Split" trigger button (kicks off the
//                        Suno vocal-removal job, costs 4 credits)
//   • "processing"    — show a small spinner badge ("Splitting…")
//   • "completed"     — show two download buttons (🎤 Vocal + 🎵 Instr.)
//                        that pop open the stem URLs in a new tab
//   • "failed"        — show "↻ Retry" button with the error in title
//
// Self-contained — the parent (GalleryCard / MusicClient) just hands
// us the trackId + the current state fields + an onSplit callback.
function CardStemControl({ trackId, stemStatus, vocalUrl, instrumentalUrl, stemError, onSplit }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function trigger(e) {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await onSplit(trackId);
    } finally {
      setBusy(false);
    }
  }

  // Done — show a tiny stem-bar with two download chips behind a
  // popover. Saves horizontal space on mobile cards.
  if (stemStatus === "completed" && vocalUrl && instrumentalUrl) {
    return (
      <div style={{ position: "relative" }}>
        <button
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          aria-label="Stem downloads"
          title="Stem downloads ready"
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "rgba(217,255,0,0.15)",
            border: `1px solid ${C.accent}`,
            color: C.accent,
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          🎚️
        </button>
        {open && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 38,
              right: 0,
              minWidth: 180,
              background: C.panel,
              border: `1px solid ${C.borderHover}`,
              borderRadius: 10,
              padding: 8,
              boxShadow: "0 12px 32px -10px rgba(0,0,0,0.7)",
              zIndex: 30,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <a
              href={vocalUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: C.panelSoft,
                border: `1px solid ${C.border}`,
                color: C.text,
                textDecoration: "none",
                fontSize: 12,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              🎤 <span>Download vocal</span>
            </a>
            <a
              href={instrumentalUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: C.panelSoft,
                border: `1px solid ${C.border}`,
                color: C.text,
                textDecoration: "none",
                fontSize: 12,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              🎵 <span>Download instrumental</span>
            </a>
            <button
              onClick={() => setOpen(false)}
              style={{
                marginTop: 2,
                padding: "5px 8px",
                borderRadius: 6,
                background: "transparent",
                border: "none",
                color: C.muted,
                fontSize: 10.5,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Close
            </button>
          </div>
        )}
      </div>
    );
  }

  // In progress — pulse indicator.
  if (stemStatus === "processing") {
    return (
      <div
        title="Splitting stems… typically 60s"
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: C.panelSoft,
          border: `1px solid ${C.borderHover}`,
          color: C.accent,
          fontSize: 13,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <style>{`@keyframes stemSpin{to{transform:rotate(360deg)}}`}</style>
        <span style={{ display: "inline-block", animation: "stemSpin 1.4s linear infinite" }}>
          ⏳
        </span>
      </div>
    );
  }

  // Failed → show retry.
  if (stemStatus === "failed") {
    return (
      <button
        onClick={trigger}
        disabled={busy}
        aria-label="Retry stem split"
        title={stemError ? `Stem split failed: ${stemError} — tap to retry` : "Tap to retry"}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "transparent",
          border: `1px solid rgba(239,68,68,0.5)`,
          color: "#fca5a5",
          fontSize: 13,
          cursor: busy ? "default" : "pointer",
          fontFamily: "inherit",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: busy ? 0.6 : 1,
        }}
      >
        ↻
      </button>
    );
  }

  // Idle — initial CTA.
  return (
    <button
      onClick={trigger}
      disabled={busy}
      aria-label="Split into vocal + instrumental stems"
      title="Split into vocal + instrumental stems · 4 credits · ~60s"
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: "transparent",
        border: `1px solid ${C.border}`,
        color: C.textSoft,
        fontSize: 13,
        cursor: busy ? "default" : "pointer",
        fontFamily: "inherit",
        transition: "all 0.15s",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: busy ? 0.6 : 1,
      }}
    >
      🎚️
    </button>
  );
}

// Small share-icon button for library cards. Same Web-Share-API
// fallback as the main player. Shows a brief inline confirmation
// when the link gets copied to clipboard.
function CardShareButton({ trackId, title }) {
  const [toast, setToast] = useState(false);
  async function onShare(e) {
    e.stopPropagation();
    if (!trackId) return;
    const url = typeof window !== "undefined"
      ? `${window.location.origin}/m/${trackId}`
      : `/m/${trackId}`;
    if (navigator.share) {
      try { await navigator.share({ title, text: `🎵 ${title}`, url }); return; } catch {}
    }
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        setToast(true);
        setTimeout(() => setToast(false), 1600);
      } catch {}
    }
  }
  return (
    <button
      onClick={onShare}
      aria-label="Share track"
      title="Share track"
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: toast ? C.accent : "transparent",
        border: `1px solid ${toast ? C.accent : C.border}`,
        color: toast ? "#0a0a0a" : C.textSoft,
        fontSize: 13,
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all 0.15s",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {toast ? "✓" : "↗"}
    </button>
  );
}

function MiniWaveform({ color }) {
  const bars = Array.from({ length: 28 }, (_, i) => {
    const x = i / 28;
    return 0.2 + 0.4 * Math.abs(Math.sin(x * Math.PI * 3)) + 0.25 * Math.sin(x * 13);
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, height: 44 }}>
      {bars.map((h, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${Math.max(0.08, Math.abs(h)) * 44}px`,
            background: color,
            borderRadius: 2,
            opacity: 0.5 + 0.5 * Math.abs(Math.sin(i * 0.4)),
            transition: "background 0.15s",
          }}
        />
      ))}
    </div>
  );
}

function SectionHeader({ title, sub }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: "-0.01em", color: C.text }}>{title}</h2>
      <p style={{ fontSize: 12.5, color: C.muted, margin: "4px 0 0" }}>{sub}</p>
    </div>
  );
}

function FooterNotes() {
  return (
    <section
      style={{
        marginTop: 56,
        padding: "20px 22px",
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        fontSize: 12.5,
        color: C.muted,
        lineHeight: 1.65,
      }}
    >
      All generated music is royalty-free for personal AND commercial use under
      our music engine license. Tracks are stored on your account forever (we
      mirror every finished render to our own R2 bucket so you keep access
      indefinitely).
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// LyricHelperModal — one-line idea → full structured lyrics.
//
// Calls POST /api/music/lyrics/generate (Claude Haiku 4.5). 1 credit
// per generation, refunded on every failure path server-side. The
// returned lyrics string is dropped straight into the parent's
// <textarea> via onApply().
//
// Multi-language by design — newcomers writing for Bollywood, K-drama,
// Spanish-language film, etc. can pick their language and Claude
// outputs in that language's native script while keeping the
// structural [Verse]/[Chorus] tags in English so the music engine
// parses them as cues.
// ────────────────────────────────────────────────────────────────────
const LYRIC_LANGUAGES = [
  { id: "",         label: "Auto-detect" },
  { id: "English",  label: "English" },
  { id: "Hindi",    label: "Hindi" },
  { id: "Punjabi",  label: "Punjabi" },
  { id: "Spanish",  label: "Spanish" },
  { id: "French",   label: "French" },
  { id: "Portuguese", label: "Portuguese" },
  { id: "Italian",  label: "Italian" },
  { id: "German",   label: "German" },
  { id: "Korean",   label: "Korean" },
  { id: "Japanese", label: "Japanese" },
  { id: "Mandarin", label: "Mandarin" },
  { id: "Arabic",   label: "Arabic" },
  { id: "Tamil",    label: "Tamil" },
  { id: "Telugu",   label: "Telugu" },
  { id: "Turkish",  label: "Turkish" },
];

const LYRIC_IDEA_EXAMPLES = [
  "Sad song for a Bollywood film, hero loses his love",
  "Hollywood action movie credits, hero rises from defeat",
  "Romantic ballad in Hindi for a wedding scene",
  "Punjabi banger for a road-trip montage",
  "Korean ballad about staying up missing someone",
  "Spanish reggaeton, summer night in Madrid",
];

function LyricHelperModal({ open, onClose, onApply, genre, mood }) {
  const [idea, setIdea] = useState("");
  const [language, setLanguage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Local preview so users can see the draft + edit it before
  // accepting. Lets them re-roll if the first draft misses the mark
  // without burning credits silently in the background.
  const [draft, setDraft] = useState("");

  // Reset when the modal closes so re-opening starts fresh.
  useEffect(() => {
    if (!open) {
      setIdea("");
      setBusy(false);
      setErr("");
      setDraft("");
    }
  }, [open]);

  async function generate() {
    if (!idea.trim() || busy) return;
    setBusy(true);
    setErr("");
    setDraft("");
    try {
      const res = await fetch("/api/music/lyrics/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: idea.trim(),
          language,
          genre,
          mood,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error || "Couldn't draft lyrics. Try again.");
        return;
      }
      setDraft(j.lyrics || "");
    } catch (e) {
      setErr(e.message || "Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  function accept() {
    if (!draft.trim()) return;
    onApply(draft);
  }

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "90vh",
          overflowY: "auto",
          background: C.panel,
          border: `1px solid ${C.borderHover}`,
          borderRadius: 18,
          padding: 22,
          boxShadow: "0 28px 80px -20px rgba(0,0,0,0.85), 0 0 0 1px rgba(217,255,0,0.06) inset",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                color: C.accent,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              ✨ Lyric helper
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 800, margin: "4px 0 0", letterSpacing: "-0.01em" }}>
              One line → full song
            </h3>
            <p style={{ fontSize: 12.5, color: C.muted, margin: "6px 0 0", lineHeight: 1.55 }}>
              Describe your song in plain language — any language. We&rsquo;ll draft a
              full set of lyrics with verses, a chorus, and a bridge.{" "}
              <b style={{ color: C.text }}>Costs 1 credit per draft</b> (refunded if
              the AI fails).
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: C.panelSoft,
              border: `1px solid ${C.border}`,
              color: C.textSoft,
              cursor: "pointer",
              fontSize: 16,
              fontFamily: "inherit",
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ marginTop: 18 }}>
          <SectionEyebrow>Your idea</SectionEyebrow>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value.slice(0, 600))}
            placeholder="e.g. Sad song for a Bollywood film, hero loses his love in Mumbai monsoon"
            rows={3}
            disabled={busy}
            style={{
              width: "100%",
              background: C.panelSoft,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: "12px 14px",
              color: C.text,
              fontSize: 13.5,
              fontFamily: "inherit",
              lineHeight: 1.55,
              resize: "vertical",
              outline: "none",
              opacity: busy ? 0.6 : 1,
            }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {LYRIC_IDEA_EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setIdea(ex)}
                disabled={busy}
                style={{
                  padding: "5px 10px",
                  borderRadius: 999,
                  background: C.panelSoft,
                  border: `1px solid ${C.border}`,
                  color: C.textSoft,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: busy ? "default" : "pointer",
                  fontFamily: "inherit",
                  opacity: busy ? 0.5 : 1,
                }}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <SectionEyebrow>Language</SectionEyebrow>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
              gap: 6,
            }}
          >
            {LYRIC_LANGUAGES.map((l) => {
              const on = language === l.id;
              return (
                <button
                  key={l.id || "auto"}
                  type="button"
                  onClick={() => setLanguage(l.id)}
                  disabled={busy}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: on ? C.accent : C.panelSoft,
                    border: `1px solid ${on ? C.accent : C.border}`,
                    color: on ? "#0a0a0a" : C.text,
                    fontSize: 12,
                    fontWeight: on ? 800 : 600,
                    cursor: busy ? "default" : "pointer",
                    fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}
                >
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>

        {err && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 14px",
              background: "rgba(239,68,68,0.10)",
              border: `1px solid rgba(239,68,68,0.32)`,
              borderRadius: 10,
              fontSize: 12.5,
              color: C.danger,
            }}
          >
            {err}
          </div>
        )}

        {draft && (
          <div style={{ marginTop: 18 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 6,
              }}
            >
              <SectionEyebrow>Draft</SectionEyebrow>
              <span style={{ fontSize: 11, color: C.muted }}>
                Edit before applying — or re-roll for a different take.
              </span>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={10}
              style={{
                width: "100%",
                background: C.panelSoft,
                border: `1px solid ${C.borderHover}`,
                borderRadius: 12,
                padding: "12px 14px",
                color: C.text,
                fontSize: 13,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                lineHeight: 1.55,
                resize: "vertical",
                outline: "none",
              }}
            />
          </div>
        )}

        <div
          style={{
            marginTop: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 11.5, color: C.muted }}>
            {busy ? "Drafting…" : "1 credit per draft · refunded on failure"}
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {draft && (
              <button
                type="button"
                onClick={generate}
                disabled={busy || !idea.trim()}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  background: C.panelSoft,
                  border: `1px solid ${C.border}`,
                  color: C.textSoft,
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: busy ? "default" : "pointer",
                  fontFamily: "inherit",
                  opacity: busy ? 0.5 : 1,
                }}
              >
                ↻ Re-roll
              </button>
            )}
            {!draft && (
              <button
                type="button"
                onClick={generate}
                disabled={busy || !idea.trim()}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  background: idea.trim() && !busy
                    ? `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`
                    : C.panelSoft,
                  border: `1px solid ${idea.trim() && !busy ? C.accent : C.border}`,
                  color: idea.trim() && !busy ? "#0a0a0a" : C.muted,
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: idea.trim() && !busy ? "pointer" : "default",
                  fontFamily: "inherit",
                  letterSpacing: "0.02em",
                }}
              >
                {busy ? "Drafting…" : "✨ Draft lyrics"}
              </button>
            )}
            {draft && (
              <button
                type="button"
                onClick={accept}
                disabled={!draft.trim()}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
                  border: `1px solid ${C.accent}`,
                  color: "#0a0a0a",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "0.02em",
                }}
              >
                ✓ Use these lyrics
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
