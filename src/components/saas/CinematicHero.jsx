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

      {/* ═══════════════ Hero CSS, scoped under .sd-hero ═══════════════ */}
      <style jsx global>{`
        .sd-hero {
          position: relative;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px 80px;
          overflow: hidden;
          background: radial-gradient(ellipse at center, #050a00 0%, #000 70%);
        }
        /* Bottom-edge feather — fades to pure black so the gallery
           below merges seamlessly. 220 px tall on desktop, hidden on
           mobile (where the hero is content-sized). */
        .sd-hero::after {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 220px;
          background: linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.7) 60%, #000 100%);
          pointer-events: none;
          z-index: 6;
        }
        .sd-hero-particle-canvas {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
        }

        /* SMOKE */
        .sd-hero-smoke-layer { position: absolute; inset: 0; z-index: 1; pointer-events: none; overflow: hidden; }
        .sd-hero-smoke-blob { position: absolute; border-radius: 50%; filter: blur(80px); mix-blend-mode: screen; opacity: 0.3; }
        .sd-hero-smoke-1 { width: 600px; height: 600px; background: radial-gradient(circle, #dcff00 0%, transparent 60%); top: -100px; left: -100px; animation: sd-hero-smoke1 22s ease-in-out infinite; }
        .sd-hero-smoke-2 { width: 700px; height: 700px; background: radial-gradient(circle, #00ffaa 0%, transparent 60%); bottom: -200px; right: -150px; animation: sd-hero-smoke2 28s ease-in-out infinite; }
        .sd-hero-smoke-3 { width: 500px; height: 500px; background: radial-gradient(circle, #dcff00 0%, transparent 60%); top: 35%; left: 25%; animation: sd-hero-smoke3 30s ease-in-out infinite; }
        @keyframes sd-hero-smoke1 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(180px, 120px) scale(1.2); } }
        @keyframes sd-hero-smoke2 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-220px, -180px) scale(1.15); } }
        @keyframes sd-hero-smoke3 { 0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.25; } 50% { transform: translate(120px, -120px) scale(1.4); opacity: 0.4; } }

        /* GRID OVERLAY */
        .sd-hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(220, 255, 0, 0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(220, 255, 0, 0.025) 1px, transparent 1px);
          background-size: 60px 60px;
          z-index: 2;
          pointer-events: none;
          mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
          -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
        }

        /* HERO CONTENT */
        .sd-hero-content {
          position: relative;
          z-index: 50;
          text-align: center;
          max-width: 1100px;
          padding: 0 20px;
          margin-top: 60px;
          pointer-events: none;
        }
        .sd-hero-content > * { pointer-events: auto; }
        .sd-hero-badge {
          display: inline-block;
          color: #dcff00;
          font-size: 12px;
          letter-spacing: 3px;
          margin-bottom: 32px;
          padding: 8px 16px;
          border: 1px solid rgba(220, 255, 0, 0.3);
          border-radius: 20px;
          background: rgba(220, 255, 0, 0.05);
          backdrop-filter: blur(10px);
        }
        .sd-hero-badge::before {
          content: '●';
          margin-right: 8px;
          color: #dcff00;
          animation: sd-hero-pulseBadge 2s ease-in-out infinite;
        }
        @keyframes sd-hero-pulseBadge { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

        .sd-hero-h1 {
          font-size: 72px;
          font-weight: 800;
          letter-spacing: -2.5px;
          line-height: 1.1;
          margin-bottom: 24px;
          position: relative;
          z-index: 60;
          color: #fff;
        }
        .sd-hero-morph-container {
          display: inline-block;
          position: relative;
          min-width: 480px;
          text-align: center;
          vertical-align: baseline;
        }
        .sd-hero-morph-word {
          display: inline-block;
          color: #dcff00;
          text-shadow: 0 0 20px rgba(220, 255, 0, 0.6), 0 0 40px rgba(220, 255, 0, 0.3);
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .sd-hero-morph-word.sd-hero-morph-word--exiting {
          opacity: 0;
          transform: translateY(-15px) scale(0.95);
          filter: blur(8px);
        }
        .sd-hero-morph-word.sd-hero-morph-word--entering {
          opacity: 0;
          transform: translateY(15px) scale(1.05);
          filter: blur(8px);
        }
        .sd-hero-morph-cursor {
          display: inline-block;
          width: 4px;
          height: 60px;
          background: #dcff00;
          margin-left: 6px;
          vertical-align: middle;
          animation: sd-hero-cursorBlink 1s step-end infinite;
          box-shadow: 0 0 15px #dcff00;
          border-radius: 2px;
        }
        @keyframes sd-hero-cursorBlink { 50% { opacity: 0; } }

        .sd-hero-subtitle { color: #999; font-size: 18px; margin-bottom: 40px; position: relative; z-index: 60; }

        .sd-hero-cta-buttons {
          display: flex;
          gap: 16px;
          justify-content: center;
          margin-bottom: 80px;
          position: relative;
          z-index: 60;
        }
        .sd-hero-btn {
          padding: 16px 32px;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: all 0.3s;
          font-family: inherit;
        }
        .sd-hero-btn-primary {
          background: #dcff00;
          color: #000;
          box-shadow: 0 0 30px rgba(220, 255, 0, 0.5);
        }
        .sd-hero-btn-primary:hover {
          transform: translateY(-3px);
          box-shadow: 0 0 40px rgba(220, 255, 0, 0.8);
        }
        .sd-hero-btn-secondary {
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }
        .sd-hero-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.1);
          transform: translateY(-3px);
        }

        .sd-hero-stats {
          display: flex;
          gap: 60px;
          justify-content: center;
          flex-wrap: wrap;
          position: relative;
          z-index: 50;
        }
        .sd-hero-stat-card { display: flex; flex-direction: column; align-items: center; gap: 12px; }
        .sd-hero-ring-wrap { position: relative; width: 90px; height: 90px; }
        .sd-hero-ring-wrap svg { transform: rotate(-90deg); width: 100%; height: 100%; }
        .sd-hero-ring-bg { fill: none; stroke: rgba(220, 255, 0, 0.08); stroke-width: 2; }
        .sd-hero-ring-progress {
          fill: none;
          stroke: url(#sd-hero-ring-gradient);
          stroke-width: 3;
          stroke-linecap: round;
          filter: drop-shadow(0 0 6px rgba(220, 255, 0, 0.8));
          transition: stroke-dashoffset 2.5s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sd-hero-ring-pulse {
          fill: none;
          stroke: rgba(220, 255, 0, 0.3);
          stroke-width: 1;
          animation: sd-hero-ringPulse 3s ease-out infinite;
          transform-origin: center;
        }
        @keyframes sd-hero-ringPulse {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.15); opacity: 0; }
        }
        .sd-hero-ring-number {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #dcff00;
          text-shadow: 0 0 20px rgba(220, 255, 0, 0.5);
        }
        .sd-hero-ring-value { font-size: 18px; font-weight: 800; line-height: 1; }
        .sd-hero-ring-suffix { font-size: 11px; margin-top: 2px; opacity: 0.8; }
        .sd-hero-stat-label { color: #999; font-size: 11px; letter-spacing: 3px; font-weight: 600; }

        @media (max-width: 768px) {
          /* Mobile: content-sized hero, no feather, no grid overlay,
             tighter typography. */
          .sd-hero {
            min-height: auto !important;
            padding: 96px 18px 56px !important;
            justify-content: flex-start !important;
          }
          .sd-hero::after { display: none !important; }
          .sd-hero::before { display: none !important; }

          .sd-hero-content { margin-top: 0 !important; }
          .sd-hero-h1 { font-size: 38px; letter-spacing: -1.5px; }
          .sd-hero-morph-container { min-width: 240px; }
          .sd-hero-morph-cursor { height: 34px; }
          .sd-hero-badge { margin-bottom: 22px; }
          .sd-hero-subtitle { margin-bottom: 28px; font-size: 16px; }
          .sd-hero-cta-buttons {
            margin-bottom: 44px;
            flex-wrap: wrap;
          }
          .sd-hero-btn { padding: 14px 24px; font-size: 14px; }
          .sd-hero-stats {
            gap: 18px;
            flex-wrap: wrap;
            row-gap: 24px;
          }
          .sd-hero-ring-wrap { width: 72px; height: 72px; }
          .sd-hero-ring-value { font-size: 15px; }
          .sd-hero-stat-label { font-size: 10px; letter-spacing: 2px; }

          /* Cheaper smoke on mobile GPUs */
          .sd-hero-smoke-2 { display: none !important; }
          .sd-hero-smoke-1,
          .sd-hero-smoke-3 { filter: blur(40px) !important; }
        }

        /* Reduced-motion respect */
        @media (prefers-reduced-motion: reduce) {
          .sd-hero *,
          .sd-hero *::before,
          .sd-hero *::after {
            animation: none !important;
            transition: none !important;
          }
          .sd-hero-particle-canvas { display: none; }
        }
      `}</style>
    </section>
  );
}
