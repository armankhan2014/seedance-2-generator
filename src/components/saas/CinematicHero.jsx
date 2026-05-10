"use client";
//
// CinematicHero — minimal version (no physics props).
//
// What's here:
//   • Black radial-gradient background + soft smoke blobs + faint grid
//   • Particle canvas (lime-yellow + occasional white sparkles)
//   • "POWERED BY SEEDANCE 2.0" badge
//   • Headline with a morphing word ("cinematic" → "viral" → …)
//   • Subtitle + two CTAs (Generate / See examples)
//   • Three progress-ring stats (videos / creators / rating) that
//     animate when scrolled into view
//   • 220 px bottom feather so the hero merges seamlessly into the
//     gallery section below
//
// What's NOT here (intentionally stripped per Arman):
//   • The seven physics props (car, camera, clapper, lens, director's
//     chair, film reel, studio light, slate)
//   • Drag-and-drop, perimeter pathfinding, collision logic
//   • Reset button + "drag anything" play hint
//
// Lifecycle: rAF loop drives only particles now. visibilitychange
// pauses on tab hide; IntersectionObserver pauses when hero scrolls
// off-screen; prefers-reduced-motion short-circuits everything.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
// Real CSS file (not styled-jsx) so Next.js inlines the styles into
// the page <head> at build time. Eliminates the unstyled-content
// flash on first paint that styled-jsx leaves behind in App Router.
import "./cinematic-hero.css";

const WORDS = [
  "cinematic",
  "viral",
  "stunning",
  "Hollywood",
  "magical",
  "realistic",
  "epic",
  "breathtaking",
];

export default function CinematicHero() {
  const router = useRouter();
  const heroRef = useRef(null);
  const canvasRef = useRef(null);
  const morphRef = useRef(null);
  const ring1Ref = useRef(null);
  const ring2Ref = useRef(null);
  const ring3Ref = useRef(null);
  const num1Ref = useRef(null);
  const num2Ref = useRef(null);
  const num3Ref = useRef(null);
  const statsRef = useRef(null);

  // ── Word morph ─────────────────────────────────────────────────
  useEffect(() => {
    const el = morphRef.current;
    if (!el) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      el.classList.add("sd-hero-morph-word--exiting");
      setTimeout(() => {
        i = (i + 1) % WORDS.length;
        el.textContent = WORDS[i];
        el.classList.remove("sd-hero-morph-word--exiting");
        el.classList.add("sd-hero-morph-word--entering");
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            el.classList.remove("sd-hero-morph-word--entering")
          )
        );
      }, 400);
    }, 2200);
    return () => clearInterval(id);
  }, []);

  // ── Ring stats animation (triggered when stats enter viewport) ─
  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const C = 502.65;
    const ringConfigs = [
      { ring: ring1Ref.current, num: num1Ref.current, target: 12847, percent: 0.85, decimal: 0 },
      { ring: ring2Ref.current, num: num2Ref.current, target: 3200,  percent: 0.7,  decimal: 0 },
      { ring: ring3Ref.current, num: num3Ref.current, target: 4.9,   percent: 0.98, decimal: 1 },
    ];

    if (reduced) {
      // Render final values immediately, no animation.
      ringConfigs.forEach((cfg) => {
        if (cfg.ring) cfg.ring.style.strokeDashoffset = String(C * (1 - cfg.percent));
        if (cfg.num)
          cfg.num.textContent =
            cfg.decimal > 0 ? cfg.target.toFixed(cfg.decimal) : cfg.target.toLocaleString();
      });
      return;
    }

    const rafs = [];
    const timeouts = [];
    function animate() {
      ringConfigs.forEach((cfg, i) => {
        const t = setTimeout(() => {
          if (!cfg.ring || !cfg.num) return;
          cfg.ring.style.strokeDashoffset = String(C * (1 - cfg.percent));
          const start = performance.now();
          function step(now) {
            const p = Math.min((now - start) / 2500, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            const v = cfg.target * eased;
            cfg.num.textContent =
              cfg.decimal > 0
                ? v.toFixed(cfg.decimal)
                : Math.floor(v).toLocaleString();
            if (p < 1) rafs.push(requestAnimationFrame(step));
            else
              cfg.num.textContent =
                cfg.decimal > 0
                  ? cfg.target.toFixed(cfg.decimal)
                  : cfg.target.toLocaleString();
          }
          rafs.push(requestAnimationFrame(step));
        }, i * 250 + 800);
        timeouts.push(t);
      });
    }
    if (!statsRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            animate();
            obs.disconnect();
          }
        });
      },
      { threshold: 0.3 }
    );
    obs.observe(statsRef.current);
    return () => {
      obs.disconnect();
      rafs.forEach((id) => cancelAnimationFrame(id));
      timeouts.forEach((id) => clearTimeout(id));
    };
  }, []);

  // ── Particle canvas only (no physics props anymore) ────────────
  useEffect(() => {
    const heroEl = heroRef.current;
    const canvas = canvasRef.current;
    if (!heroEl || !canvas) return;

    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const isMobile =
      typeof window !== "undefined" &&
      (window.matchMedia("(max-width: 768px)").matches ||
        window.matchMedia("(hover: none)").matches);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    let rafId = 0;
    let heroVisible = true;

    function resize() {
      const rect = heroEl.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
    resize();
    window.addEventListener("resize", resize);

    const PARTICLE_COUNT = isMobile ? 30 : 80;
    const particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 5 + 1.5,
        opacity: Math.random() * 0.5 + 0.2,
        vx: (Math.random() - 0.5) * 0.2,
        vy: -(Math.random() * 0.4 + 0.15),
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.015 + 0.005,
        isWhite: Math.random() > 0.75,
        wobble: Math.random() * 2 + 0.5,
      });
    }

    function tick() {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx + Math.sin(p.pulse) * p.wobble * 0.15;
        p.y += p.vy;
        p.pulse += p.pulseSpeed;
        if (p.y < -10) {
          p.x = Math.random() * canvas.width;
          p.y = canvas.height + 10;
        }
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;
        const alpha = p.opacity * (Math.sin(p.pulse) * 0.3 + 0.7);
        const c = p.isWhite ? "255,255,255" : "220,255,0";
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 5);
        grad.addColorStop(0, "rgba(" + c + "," + alpha * 0.5 + ")");
        grad.addColorStop(0.4, "rgba(" + c + "," + alpha * 0.2 + ")");
        grad.addColorStop(1, "rgba(" + c + ",0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(" + c + "," + alpha + ")";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    function onVis() {
      if (document.hidden) {
        running = false;
      } else if (!running && heroVisible) {
        running = true;
        rafId = requestAnimationFrame(tick);
      }
    }
    document.addEventListener("visibilitychange", onVis);

    const visObs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          heroVisible = e.isIntersecting;
          if (!heroVisible) {
            running = false;
          } else if (!running && !document.hidden) {
            running = true;
            rafId = requestAnimationFrame(tick);
          }
        }
      },
      { threshold: 0 }
    );
    visObs.observe(heroEl);

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      visObs.disconnect();
    };
  }, []);

  // ── CTAs ───────────────────────────────────────────────────────
  const onGenerate = () => router.push("/generate");
  const onSeeExamples = () => {
    const el = document.getElementById("gallery");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="sd-hero" ref={heroRef}>
      <canvas className="sd-hero-particle-canvas" ref={canvasRef} />

      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="sd-hero-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#dcff00" />
            <stop offset="50%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#dcff00" />
          </linearGradient>
        </defs>
      </svg>

      <div className="sd-hero-smoke-layer">
        <div className="sd-hero-smoke-blob sd-hero-smoke-1" />
        <div className="sd-hero-smoke-blob sd-hero-smoke-2" />
        <div className="sd-hero-smoke-blob sd-hero-smoke-3" />
      </div>

      <div className="sd-hero-content">
        <div className="sd-hero-badge">POWERED BY SEEDANCE 2.0</div>
        <h1 className="sd-hero-h1">
          Turn ideas into<br />
          <span className="sd-hero-morph-container">
            <span className="sd-hero-morph-word" ref={morphRef}>cinematic</span>
          </span>
          <span className="sd-hero-morph-cursor" /><br />
          AI videos
        </h1>
        <p className="sd-hero-subtitle">Create the most realistic AI videos.</p>
        <div className="sd-hero-cta-buttons">
          <button className="sd-hero-btn sd-hero-btn-primary" onClick={onGenerate}>
            Generate a video
          </button>
          <button className="sd-hero-btn sd-hero-btn-secondary" onClick={onSeeExamples}>
            See examples
          </button>
        </div>
        <div className="sd-hero-stats" ref={statsRef}>
          {[
            { ringRef: ring1Ref, numRef: num1Ref, suffix: "+", label: "VIDEOS",  delay: "0s" },
            { ringRef: ring2Ref, numRef: num2Ref, suffix: "+", label: "CREATORS", delay: "1s" },
            { ringRef: ring3Ref, numRef: num3Ref, suffix: "★", label: "RATING",   delay: "2s" },
          ].map((s, i) => (
            <div className="sd-hero-stat-card" key={i}>
              <div className="sd-hero-ring-wrap">
                <svg viewBox="0 0 180 180">
                  <circle className="sd-hero-ring-pulse" cx="90" cy="90" r="80" style={{ animationDelay: s.delay }} />
                  <circle className="sd-hero-ring-bg" cx="90" cy="90" r="80" />
                  <circle className="sd-hero-ring-progress" cx="90" cy="90" r="80" strokeDasharray="502.65" strokeDashoffset="502.65" ref={s.ringRef} />
                </svg>
                <div className="sd-hero-ring-number">
                  <div className="sd-hero-ring-value" ref={s.numRef}>0</div>
                  <div className="sd-hero-ring-suffix">{s.suffix}</div>
                </div>
              </div>
              <div className="sd-hero-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
