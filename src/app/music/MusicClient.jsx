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
import { useSession } from "next-auth/react";

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

const GENRES = [
  { id: "cinematic",  icon: "🎬", label: "Cinematic",  sub: "Film score" },
  { id: "ambient",    icon: "🎹", label: "Ambient",    sub: "Background" },
  { id: "rock",       icon: "🎸", label: "Rock",       sub: "Energetic" },
  { id: "orchestral", icon: "🎻", label: "Orchestral", sub: "Epic" },
  { id: "electronic", icon: "🎧", label: "Electronic", sub: "EDM" },
  { id: "jazz",       icon: "🎷", label: "Jazz",       sub: "Lounge" },
  { id: "folk",       icon: "🪕", label: "Folk",       sub: "Acoustic" },
  { id: "mystery",    icon: "🌌", label: "Mysterious", sub: "Suspense" },
];
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
// great-result on Suno V5. Used by:
//   • The "✨ Surprise me" button — picks a random STARTER and slams
//     the form full, so a brand-new user can hit Generate immediately.
//   • The empty-library state — replaces the old dashed-box "your
//     tracks will appear here" with four click-to-fill cards.
// Per Suno's own best-practice docs the sweet spot is a 15–30-word
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
  // with genre / mood / duration / vocal / advanced). Mirrors Suno's
  // own Simple vs Custom mental model so users who've used Suno
  // recognise the pattern instantly. localStorage-persisted so the
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
  const [vocalGender, setVocalGender] = useState("auto");
  const [isVocal, setIsVocal] = useState(false);
  const [lyrics, setLyrics] = useState("");
  const [prompt, setPrompt] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  function flashToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  // ── Generate ────────────────────────────────────────────────────
  async function onGenerate() {
    if (stage === "submitting" || stage === "generating") return;
    if (sessionStatus !== "authenticated") {
      router.push("/?signin=1");
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
          lyrics: isVocal ? lyrics : undefined,
          prompt,
          vocalGender: vocalGender === "auto" ? undefined : vocalGender,
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
    const MAX_TRIES = 120; // 6 minutes at 3s — Suno can take up to ~3min
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
              marginTop: -80,
              position: "relative",
              zIndex: 2,
              background: C.panel,
              border: `1px solid ${C.border}`,
              borderRadius: 18,
              padding: "20px 24px 28px",
              boxShadow: "0 28px 80px -20px rgba(0,0,0,0.7)",
            }}
          >
            {/* Easy ↔ Pro mode toggle — Suno's Simple/Custom mental
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
                <div style={{ marginTop: 22 }}>
                  <SectionEyebrow tooltip="Suno style strings are 15–30 comma-separated descriptors. Picking a preset below auto-builds one for you.">
                    1 · Describe what you want
                  </SectionEyebrow>
                  <PromptInput value={prompt} onChange={setPrompt} />
                  <PromptStrength value={prompt} />
                  <TemplateChips onPick={setPrompt} />
                </div>
                <Divider />
                <SectionEyebrow tooltip="Genre presets map to Suno style strings under the hood — picking one gives the cleanest first result.">
                  2 · Pick a vibe
                </SectionEyebrow>
                <GenreGrid value={genre} onChange={setGenre} />
                <Divider />
                <SectionEyebrow tooltip="Longer tracks cost more credits but give Suno more room for a proper intro–build–outro arc.">
                  3 · Mood, length, vocal
                </SectionEyebrow>
                <ThreeColRow>
                  <MoodPicker value={mood} onChange={setMood} />
                  <DurationPicker value={duration} onChange={setDuration} />
                  <VocalToggle value={isVocal} onChange={setIsVocal} />
                </ThreeColRow>
                {isVocal && <LyricsBox value={lyrics} onChange={setLyrics} />}
                <AdvancedOptions
                  open={advancedOpen}
                  onToggle={() => setAdvancedOpen((o) => !o)}
                  tempo={tempo}
                  onTempoChange={setTempo}
                  vocalGender={vocalGender}
                  onVocalGenderChange={setVocalGender}
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
        <GallerySection tracks={tracks} onPickStarter={applyStarter} />
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
        padding: "80px 16px 140px",
        background: "linear-gradient(180deg, #0a0a0a 0%, #0f1a05 65%, #0a0a0a 100%)",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <WaveformBg />
      <div style={{ position: "relative", maxWidth: 1200, margin: "0 auto", textAlign: "center" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 14px",
            borderRadius: 999,
            background: C.accentSoft,
            border: `1px solid ${C.borderHover}`,
            fontSize: 10.5,
            fontWeight: 800,
            color: C.accent,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginBottom: 22,
          }}
        >
          🎵 New · powered by Suno V5
        </div>
        <h1
          style={{
            fontSize: "clamp(38px, 7vw, 76px)",
            fontWeight: 800,
            letterSpacing: "-0.025em",
            lineHeight: 1.05,
            margin: 0,
            color: C.text,
          }}
        >
          Compose your{" "}
          <span
            style={{
              background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            soundtrack
          </span>
        </h1>
        <p style={{ margin: "16px auto 0", maxWidth: 580, fontSize: 16, lineHeight: 1.55, color: C.muted }}>
          Royalty-free AI music for your films. Genre, mood, tempo, lyrics — go from
          idea to download in under three minutes.
        </p>
      </div>
    </section>
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
// 15-30-word "sweet spot" out of Suno's own best-practice docs and
// surfaces it as a horizontal bar + status label.
function PromptStrength({ value }) {
  const words = (value || "").trim().split(/\s+/).filter(Boolean).length;
  let label, color, pct;
  if (words === 0)        { label = "Type a prompt or pick a starter below";  color = C.muted;   pct = 0; }
  else if (words < 8)     { label = "Too short — add genre + mood + instruments"; color = C.warning; pct = 0.2; }
  else if (words < 15)    { label = `Decent — adding a few more descriptors will sharpen the result (${words}/15)`; color = C.warning; pct = 0.55; }
  else if (words <= 30)   { label = `✓ Sweet spot (${words} words)`; color = C.accent; pct = 0.95; }
  else if (words <= 50)   { label = `Wordy but still OK (${words} words)`; color = C.accent; pct = 0.8; }
  else                    { label = `Too long — Suno may ignore details (${words} words)`; color = C.warning; pct = 0.65; }
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
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
      {GENRES.map((g) => {
        const on = g.id === value;
        return (
          <button
            key={g.id}
            onClick={() => onChange(g.id)}
            style={{
              textAlign: "left",
              padding: "12px 14px",
              borderRadius: 12,
              background: on ? C.accentSoft : C.panelSoft,
              border: `1px solid ${on ? C.accent : C.border}`,
              color: on ? C.accent : C.text,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s",
            }}
          >
            <div style={{ fontSize: 22, lineHeight: 1, marginBottom: 6 }}>{g.icon}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>{g.label}</div>
            <div style={{ fontSize: 10.5, color: on ? C.accentDark : C.muted, marginTop: 2 }}>{g.sub}</div>
          </button>
        );
      })}
    </div>
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

function LyricsBox({ value, onChange }) {
  return (
    <div style={{ marginTop: 14 }}>
      <SectionEyebrow>Lyrics</SectionEyebrow>
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
        Use [Verse], [Chorus], [Bridge] tags for structure — Suno picks up on them. Leave blank for AI-generated lyrics.
      </div>
    </div>
  );
}

function AdvancedOptions({ open, onToggle, tempo, onTempoChange, vocalGender, onVocalGenderChange }) {
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
        Advanced (tempo, vocal gender)
      </button>
      {open && (
        <div
          style={{
            marginTop: 12,
            padding: 16,
            background: C.panelSoft,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 14,
          }}
        >
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
          <FormBox label="Vocal gender">
            <select value={vocalGender} onChange={(e) => onVocalGenderChange(e.target.value)} style={selectStyle()}>
              <option value="auto">Auto</option>
              <option value="f">Female</option>
              <option value="m">Male</option>
            </select>
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

  // Prefer R2 (permanent) → audioUrl (Suno final, 15-day) → streamUrl (preview)
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
          <PlayerAction icon="↻" label="Generate another" onClick={onReset} />
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

function GallerySection({ tracks, onPickStarter }) {
  return (
    <section style={{ marginTop: 60 }}>
      <SectionHeader
        title={tracks.length === 0 ? "Start here" : "Your library"}
        sub={
          tracks.length === 0
            ? "Tap a starter to fill the form, then hit Generate"
            : `${tracks.length} ${tracks.length === 1 ? "track" : "tracks"} · royalty-free for commercial use`
        }
      />
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
            <GalleryCard key={t.id} track={t} />
          ))}
        </div>
      )}
    </section>
  );
}

// Click-to-fill starter card — replaces the empty-library dashed box.
// Tapping fills the entire form with the curated starter's values,
// scrolls back to the top, and the user can hit Generate immediately.
function StarterCard({ starter, onPick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onPick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textAlign: "left",
        padding: "16px 16px 14px",
        background: hover ? C.accentSoft : C.panel,
        border: `1px solid ${hover ? C.borderHover : C.border}`,
        borderRadius: 14,
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all 0.15s",
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hover ? `0 12px 24px -10px ${C.accent}33` : "none",
      }}
    >
      <div style={{ fontSize: 24, lineHeight: 1, marginBottom: 8 }}>{starter.icon}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: hover ? C.accent : C.text }}>
        {starter.label}
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 3, letterSpacing: "0.04em" }}>
        {starter.sub}
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 11.5,
          color: C.textSoft,
          lineHeight: 1.45,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        “{starter.prompt}”
      </div>
      <div style={{ marginTop: 10, fontSize: 10.5, fontWeight: 700, color: C.accent, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        Tap to load →
      </div>
    </button>
  );
}

function GalleryCard({ track }) {
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
              flexShrink: 0,
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
            flexShrink: 0,
          }}>
            {isFailed ? "✕" : "⏳"}
          </div>
        )}
      </div>
    </div>
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
      our Suno API license. Tracks are stored on your account forever (we mirror
      Suno&rsquo;s short-retention output to our own R2 bucket the moment each
      render finishes).
    </section>
  );
}
