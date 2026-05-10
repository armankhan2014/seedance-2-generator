"use client";
/* eslint-disable react/no-unknown-property */
//
// CinematicHero — direct port of the standalone HTML demo at
// /Users/armankhan/Documents/s/seedance-physics-game.html into a
// self-contained client component. Drops in as the homepage hero
// for seedance.visualseffect.com without touching the existing nav,
// gallery, or any other section.
//
// Scoping: every CSS class is prefixed `sd-hero-*` (and most rules
// further qualified by `.sd-hero ...`) so nothing leaks into the
// rest of the site. SVG IDs are likewise prefixed.
//
// Lifecycle: rAF physics loop, particle canvas, drag handlers,
// ring-animation IntersectionObserver, and word-morph interval all
// register inside useEffect and are torn down on unmount so
// navigating away from the homepage doesn't leave anything ticking.
// The physics loop also pauses when the tab is hidden to save the
// laptop's battery.

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
  const carRef = useRef(null);
  const resetBtnRef = useRef(null);
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
    // Respect reduced-motion: keep the first word, no morphing.
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
    // Reduced-motion: render the final values immediately, no
    // animation. Keeps the page accessible without forcing motion.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const finals = [
        { ring: ring1Ref.current, num: num1Ref.current, target: 12847, percent: 0.85, decimal: 0 },
        { ring: ring2Ref.current, num: num2Ref.current, target: 3200,  percent: 0.7,  decimal: 0 },
        { ring: ring3Ref.current, num: num3Ref.current, target: 4.9,   percent: 0.98, decimal: 1 },
      ];
      const C0 = 502.65;
      finals.forEach((cfg) => {
        if (cfg.ring) cfg.ring.style.strokeDashoffset = String(C0 * (1 - cfg.percent));
        if (cfg.num)
          cfg.num.textContent =
            cfg.decimal > 0 ? cfg.target.toFixed(cfg.decimal) : cfg.target.toLocaleString();
      });
      return;
    }

    const C = 502.65;
    const ringConfigs = [
      { ring: ring1Ref.current, num: num1Ref.current, target: 12847, percent: 0.85, decimal: 0 },
      { ring: ring2Ref.current, num: num2Ref.current, target: 3200,  percent: 0.7,  decimal: 0 },
      { ring: ring3Ref.current, num: num3Ref.current, target: 4.9,   percent: 0.98, decimal: 1 },
    ];
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

  // ── Particles + physics + dragging ─────────────────────────────
  useEffect(() => {
    const heroEl = heroRef.current;
    const canvas = canvasRef.current;
    if (!heroEl || !canvas) return;

    // Bail entirely if the user prefers reduced motion — the static
    // SVGs + headline + stats still render via CSS / React, but no
    // rAF / physics / particles tick.
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    // Mobile detection — phones get a calmer hero (no physics props,
    // no drag, fewer particles). The CSS already hides the seven
    // .sd-hero-phys-obj DOM nodes on ≤768 px, but we also skip the
    // physics + drag wiring entirely so we're not running a rAF
    // loop over invisible elements.
    const isMobile =
      typeof window !== "undefined" &&
      (window.matchMedia("(max-width: 768px)").matches ||
        window.matchMedia("(hover: none)").matches);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    let rafId = 0;

    function resize() {
      // Match the hero's actual rendered box, not the viewport — the
      // canvas is absolutely positioned inside the hero so its
      // coordinate system needs to be the hero's box.
      const rect = heroEl.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
    resize();
    window.addEventListener("resize", resize);

    // Particle count tuned for device class: 30 on mobile (smaller
    // canvases, less GPU headroom), 80 on desktop.
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

    // Build the physics objects from the rendered DOM. Skipped on
    // mobile — the DOM nodes are display:none there, no need to
    // measure or animate them.
    const physEls = isMobile
      ? []
      : heroEl.querySelectorAll(".sd-hero-phys-obj");
    const objects = [];
    const initial = new Map();
    physEls.forEach((el) => {
      const isCar = el.dataset.car === "true";
      const heroRect = heroEl.getBoundingClientRect();
      let x, y;
      if (isCar) {
        x = 80;
        y = 90;
      } else {
        const sx = el.dataset.startX || "50%";
        const sy = el.dataset.startY || "50%";
        x = sx.endsWith("%")
          ? (heroRect.width * parseFloat(sx)) / 100
          : parseFloat(sx);
        y = sy.endsWith("%")
          ? (heroRect.height * parseFloat(sy)) / 100
          : parseFloat(sy);
      }
      el.style.left = x + "px";
      el.style.top = y + "px";

      // Reveal: clear the inline opacity:0 / pointer-events:none
      // FOUC guards put on the JSX so the CSS rules can take over.
      // Empty string removes the inline declaration; the .sd-hero-
      // phys-obj rule then provides the resting opacity 0.7 + auto
      // pointer events. On mobile this useEffect doesn't run, so
      // those JSX inline styles stay → props remain invisible.
      el.style.opacity = "";
      el.style.pointerEvents = "";

      const rect = el.getBoundingClientRect();
      const obj = {
        el,
        isCar,
        x,
        y,
        w: rect.width,
        h: rect.height,
        vx: 0,
        vy: 0,
        rotation: 0,
        isDragging: false,
        autoDrive: isCar,
      };
      objects.push(obj);
      initial.set(el, { x, y });
    });

    // ── Path the car follows along the rectangle's perimeter.
    function getPathPoint(t) {
      const heroRect = heroEl.getBoundingClientRect();
      const m = 80;
      const W = heroRect.width;
      const H = heroRect.height;
      const corners = [
        { x: m, y: m + 30 },
        { x: W - m, y: m + 30 },
        { x: W - m, y: H - m },
        { x: m, y: H - m },
      ];
      const seg = (t % 1) * 4;
      const i = Math.floor(seg);
      const frac = seg - i;
      const p1 = corners[i];
      const p2 = corners[(i + 1) % 4];
      return {
        x: p1.x + (p2.x - p1.x) * frac,
        y: p1.y + (p2.y - p1.y) * frac,
        angle: (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI,
      };
    }
    function aabb(a, b) {
      return !(
        a.x + a.w < b.x ||
        b.x + b.w < a.x ||
        a.y + a.h < b.y ||
        b.y + b.h < a.y
      );
    }

    let phase = 0;
    let detourX = 0;
    let detourY = 0;

    function tick() {
      if (!running) return;
      const heroRect = heroEl.getBoundingClientRect();
      for (const o of objects) {
        if (o.isDragging) continue;
        if (o.isCar && o.autoDrive) {
          let blocked = false;
          let blockedBy = null;
          for (let look = 0.005; look < 0.05; look += 0.012) {
            const p = getPathPoint(phase + look);
            const lookBox = {
              x: p.x - o.w / 2 - 10,
              y: p.y - o.h / 2 - 10,
              w: o.w + 20,
              h: o.h + 20,
            };
            for (const other of objects) {
              if (other === o) continue;
              if (aabb(lookBox, other)) {
                blocked = true;
                blockedBy = other;
                break;
              }
            }
            if (blocked) break;
          }
          const ideal = getPathPoint(phase);
          if (blocked && blockedBy) {
            const carCx = o.x + o.w / 2;
            const carCy = o.y + o.h / 2;
            const obCx = blockedBy.x + blockedBy.w / 2;
            const obCy = blockedBy.y + blockedBy.h / 2;
            const ang = (ideal.angle * Math.PI) / 180;
            const perpX = -Math.sin(ang);
            const perpY = Math.cos(ang);
            const side =
              (obCx - carCx) * perpX + (obCy - carCy) * perpY > 0 ? -1 : 1;
            const targetDX = perpX * side * 90;
            const targetDY = perpY * side * 90;
            detourX += (targetDX - detourX) * 0.1;
            detourY += (targetDY - detourY) * 0.1;
            phase += 0.0008;
          } else {
            detourX *= 0.95;
            detourY *= 0.95;
            phase += 0.0014;
          }
          if (phase >= 1) phase = 0;
          const target = getPathPoint(phase);
          const targetX = target.x + detourX - o.w / 2;
          const targetY = target.y + detourY - o.h / 2;
          o.x += (targetX - o.x) * 0.15;
          o.y += (targetY - o.y) * 0.15;
          let angDiff = target.angle - o.rotation;
          while (angDiff > 180) angDiff -= 360;
          while (angDiff < -180) angDiff += 360;
          o.rotation += angDiff * 0.12;
          for (const other of objects) {
            if (other === o) continue;
            if (aabb(o, other)) {
              const dx = other.x + other.w / 2 - (o.x + o.w / 2);
              const dy = other.y + other.h / 2 - (o.y + o.h / 2);
              const d = Math.hypot(dx, dy) || 1;
              other.vx += (dx / d) * 4;
              other.vy += (dy / d) * 4 - 1;
            }
          }
        } else {
          if (Math.abs(o.vx) > 0.05 || Math.abs(o.vy) > 0.05) {
            o.x += o.vx;
            o.y += o.vy;
            o.vx *= 0.96;
            o.vy *= 0.96;
            if (o.x < 0) {
              o.x = 0;
              o.vx = -o.vx * 0.5;
            }
            if (o.x + o.w > heroRect.width) {
              o.x = heroRect.width - o.w;
              o.vx = -o.vx * 0.5;
            }
            if (o.y < 0) {
              o.y = 0;
              o.vy = -o.vy * 0.5;
            }
            if (o.y + o.h > heroRect.height) {
              o.y = heroRect.height - o.h;
              o.vy = -o.vy * 0.5;
            }
          }
        }
      }
      // Object-vs-object soft collisions
      for (let i = 0; i < objects.length; i++) {
        for (let j = i + 1; j < objects.length; j++) {
          const a = objects[i];
          const b = objects[j];
          if (a.isCar || b.isCar) continue;
          if (aabb(a, b)) {
            const dx = b.x + b.w / 2 - (a.x + a.w / 2);
            const dy = b.y + b.h / 2 - (a.y + a.h / 2);
            const d = Math.hypot(dx, dy) || 1;
            const force = 1.5;
            a.vx -= (dx / d) * force;
            a.vy -= (dy / d) * force;
            b.vx += (dx / d) * force;
            b.vy += (dy / d) * force;
          }
        }
      }
      for (const o of objects) {
        o.el.style.left = o.x + "px";
        o.el.style.top = o.y + "px";
        if (o.isCar) {
          o.el.style.transform = "rotate(" + o.rotation + "deg)";
        }
      }
      // Particles
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

    // Pause when the page tab is hidden — saves laptop battery.
    function onVis() {
      if (document.hidden) {
        running = false;
      } else if (!running && heroVisible) {
        running = true;
        rafId = requestAnimationFrame(tick);
      }
    }
    document.addEventListener("visibilitychange", onVis);

    // Pause when the hero scrolls fully off-screen. The user is
    // reading the gallery / how-it-works / FAQ — no point burning
    // CPU + GPU cycles on a hero they can't see. Threshold 0 means
    // we resume as soon as a single pixel comes back into view.
    let heroVisible = true;
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

    // Drag handlers per object.
    const cleanups = [];
    for (const o of objects) {
      let startMX, startMY, startOX, startOY, lastT, lastMX, lastMY;
      let active = false;
      let waitTimer = null;

      function start(e) {
        e.preventDefault();
        e.stopPropagation();
        active = true;
        o.isDragging = true;
        o.vx = 0;
        o.vy = 0;
        o.el.classList.add("sd-hero-phys-obj--dragging");
        if (o.isCar) {
          o.autoDrive = false;
          o.el.classList.remove("sd-hero-car--driving");
        }
        const pt = e.touches ? e.touches[0] : e;
        startMX = pt.clientX;
        startMY = pt.clientY;
        startOX = o.x;
        startOY = o.y;
        lastT = performance.now();
        lastMX = pt.clientX;
        lastMY = pt.clientY;
      }
      function move(e) {
        if (!active) return;
        e.preventDefault();
        const pt = e.touches ? e.touches[0] : e;
        o.x = startOX + (pt.clientX - startMX);
        o.y = startOY + (pt.clientY - startMY);
        const t = performance.now();
        const dt = t - lastT;
        if (dt > 0) {
          o.vx = ((pt.clientX - lastMX) / dt) * 16;
          o.vy = ((pt.clientY - lastMY) / dt) * 16;
        }
        lastT = t;
        lastMX = pt.clientX;
        lastMY = pt.clientY;
        if (o.isCar) {
          const a = (Math.atan2(o.vy, o.vx) * 180) / Math.PI;
          if (Math.abs(o.vx) > 0.5 || Math.abs(o.vy) > 0.5) {
            o.rotation = a;
          }
        }
      }
      function end() {
        if (!active) return;
        active = false;
        o.isDragging = false;
        o.el.classList.remove("sd-hero-phys-obj--dragging");
        if (o.isCar) {
          waitTimer = setInterval(() => {
            if (Math.abs(o.vx) < 0.5 && Math.abs(o.vy) < 0.5) {
              clearInterval(waitTimer);
              waitTimer = null;
              o.autoDrive = true;
              o.el.classList.add("sd-hero-car--driving");
              let bestPhase = 0;
              let bestDist = Infinity;
              for (let p = 0; p < 1; p += 0.005) {
                const pt = getPathPoint(p);
                const d = Math.hypot(
                  pt.x - (o.x + o.w / 2),
                  pt.y - (o.y + o.h / 2)
                );
                if (d < bestDist) {
                  bestDist = d;
                  bestPhase = p;
                }
              }
              phase = bestPhase;
            }
          }, 50);
        }
      }

      o.el.addEventListener("mousedown", start);
      o.el.addEventListener("touchstart", start, { passive: false });
      document.addEventListener("mousemove", move);
      document.addEventListener("touchmove", move, { passive: false });
      document.addEventListener("mouseup", end);
      document.addEventListener("touchend", end);

      cleanups.push(() => {
        o.el.removeEventListener("mousedown", start);
        o.el.removeEventListener("touchstart", start);
        document.removeEventListener("mousemove", move);
        document.removeEventListener("touchmove", move);
        document.removeEventListener("mouseup", end);
        document.removeEventListener("touchend", end);
        if (waitTimer) clearInterval(waitTimer);
      });
    }

    // Reset button.
    function onReset() {
      for (const o of objects) {
        const init = initial.get(o.el);
        o.x = init.x;
        o.y = init.y;
        o.vx = 0;
        o.vy = 0;
        o.rotation = 0;
        if (o.isCar) {
          o.autoDrive = true;
          o.el.classList.add("sd-hero-car--driving");
          phase = 0;
          detourX = 0;
          detourY = 0;
        }
      }
    }
    const resetBtn = resetBtnRef.current;
    if (resetBtn) resetBtn.addEventListener("click", onReset);

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      visObs.disconnect();
      cleanups.forEach((fn) => fn());
      if (resetBtn) resetBtn.removeEventListener("click", onReset);
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
      <div className="sd-hero-play-hint">✋ DRAG ANYTHING · 🏎️ DRIVE THE CAR</div>

      <canvas className="sd-hero-particle-canvas" ref={canvasRef} />

      {/* SVG defs for ring gradient — width/height 0 keeps it invisible */}
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

      {/* ═══ CAR ═══
          Inline opacity:0 + pointerEvents:none is the FOUC guard —
          even before any styled-jsx CSS hydrates, the prop is
          invisible. Desktop JS clears these inline styles after
          positioning; mobile JS never runs the physics block, so
          the props stay invisible there forever (and the CSS @media
          rule below also hides them via display:none). */}
      <div className="sd-hero-phys-obj sd-hero-car sd-hero-car--driving" data-car="true" id="sd-hero-car" ref={carRef} style={{ left: 80, top: 90, opacity: 0, pointerEvents: "none" }}>
        <svg width="240" height="90" viewBox="0 0 240 90" fill="none" stroke="#dcff00" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
          <ellipse cx="120" cy="80" rx="105" ry="3.5" fill="#dcff00" fillOpacity="0.18" stroke="none" />
          <path d="M 26 60 Q 25 50 33 47 L 48 44 Q 58 38 70 35 Q 95 26 125 26 Q 155 26 180 34 Q 195 38 205 44 L 215 50 Q 220 53 218 60 Z" fill="#dcff00" fillOpacity="0.22" stroke="#dcff00" strokeWidth="2.2" />
          <path d="M 70 35 Q 80 22 100 19 Q 122 17 140 19 Q 160 22 175 33 L 180 34 L 70 35 Z" fill="#dcff00" fillOpacity="0.42" stroke="#dcff00" strokeWidth="2" />
          <path d="M 75 33 Q 84 22 102 20 Q 122 18 138 20 Q 154 22 168 32 L 75 34 Z" fill="#fff" fillOpacity="0.18" stroke="none" />
          <line x1="125" y1="19" x2="125" y2="33" strokeOpacity="0.5" />
          <path d="M 110 35 Q 109 47 108 58" strokeOpacity="0.5" strokeWidth="1" />
          <rect x="100" y="44" width="8" height="1.5" rx="0.7" fill="#dcff00" fillOpacity="0.6" stroke="none" />
          <path d="M 88 48 L 100 48 L 99 53 L 89 53 Z" fill="#000" stroke="#dcff00" strokeWidth="1.2" />
          <path d="M 162 44 L 178 44 L 175 52 L 165 52 Z" fill="#000" stroke="#dcff00" strokeWidth="1.4" />
          <line x1="22" y1="60" x2="42" y2="60" strokeWidth="3" />
          <path d="M 195 41 Q 215 38 222 41 L 222 45 Q 215 43 197 45 Z" fill="#dcff00" fillOpacity="0.3" stroke="#dcff00" strokeWidth="1.5" />
          <g className="sd-hero-headlight">
            <ellipse cx="36" cy="49" rx="22" ry="5" fill="#fff" fillOpacity="0.25" stroke="none" />
            <ellipse cx="36" cy="49" rx="8" ry="3.5" fill="#fff" fillOpacity="0.95" stroke="#fff" strokeWidth="1.2" />
            <circle cx="36" cy="49" r="1.2" fill="#dcff00" stroke="none" />
          </g>
          <g className="sd-hero-taillight">
            <rect x="200" y="46" width="22" height="2.5" rx="1.2" fill="#ff0040" stroke="#ff0040" strokeWidth="0.6" />
            <ellipse cx="211" cy="47" rx="14" ry="1.8" fill="#ff0040" fillOpacity="0.5" stroke="none" />
          </g>
          <ellipse cx="220" cy="58" rx="5" ry="2.5" fill="#000" stroke="#dcff00" strokeWidth="1.4" />
          <path d="M 48 60 Q 65 36 82 60" stroke="#dcff00" strokeWidth="2" fill="none" strokeOpacity="0.7" />
          <path d="M 175 60 Q 192 36 209 60" stroke="#dcff00" strokeWidth="2" fill="none" strokeOpacity="0.7" />
          <g className="sd-hero-wheel-front" style={{ transformOrigin: "65px 62px" }}>
            <circle cx="65" cy="62" r="14" fill="#0f0f0f" stroke="#dcff00" strokeWidth="2.4" />
            <line x1="65" y1="49" x2="65" y2="52" stroke="#dcff00" strokeWidth="1.6" />
            <line x1="65" y1="72" x2="65" y2="75" stroke="#dcff00" strokeWidth="1.6" />
            <line x1="51" y1="62" x2="54" y2="62" stroke="#dcff00" strokeWidth="1.6" />
            <line x1="76" y1="62" x2="79" y2="62" stroke="#dcff00" strokeWidth="1.6" />
            <circle cx="65" cy="62" r="9" fill="#dcff00" fillOpacity="0.12" stroke="#dcff00" strokeWidth="1.5" />
            <g stroke="#dcff00" strokeWidth="1.4" fill="none" strokeLinecap="round">
              <line x1="65" y1="62" x2="65" y2="55" />
              <line x1="65" y1="62" x2="71" y2="64" />
              <line x1="65" y1="62" x2="69" y2="69" />
              <line x1="65" y1="62" x2="61" y2="69" />
              <line x1="65" y1="62" x2="59" y2="64" />
            </g>
            <circle cx="65" cy="62" r="2.8" fill="#dcff00" stroke="none" />
          </g>
          <g className="sd-hero-wheel-rear" style={{ transformOrigin: "192px 62px" }}>
            <circle cx="192" cy="62" r="14" fill="#0f0f0f" stroke="#dcff00" strokeWidth="2.4" />
            <line x1="192" y1="49" x2="192" y2="52" stroke="#dcff00" strokeWidth="1.6" />
            <line x1="192" y1="72" x2="192" y2="75" stroke="#dcff00" strokeWidth="1.6" />
            <line x1="178" y1="62" x2="181" y2="62" stroke="#dcff00" strokeWidth="1.6" />
            <line x1="203" y1="62" x2="206" y2="62" stroke="#dcff00" strokeWidth="1.6" />
            <circle cx="192" cy="62" r="9" fill="#dcff00" fillOpacity="0.12" stroke="#dcff00" strokeWidth="1.5" />
            <g stroke="#dcff00" strokeWidth="1.4" fill="none" strokeLinecap="round">
              <line x1="192" y1="62" x2="192" y2="55" />
              <line x1="192" y1="62" x2="198" y2="64" />
              <line x1="192" y1="62" x2="196" y2="69" />
              <line x1="192" y1="62" x2="188" y2="69" />
              <line x1="192" y1="62" x2="186" y2="64" />
            </g>
            <circle cx="192" cy="62" r="2.8" fill="#dcff00" stroke="none" />
          </g>
        </svg>
      </div>

      {/* ═══ CINEMA CAMERA ═══ */}
      <div className="sd-hero-phys-obj" data-start-x="83%" data-start-y="12%" style={{ opacity: 0, pointerEvents: "none" }}>
        <svg className="sd-hero-camera-svg" width="200" height="150" viewBox="0 0 220 160" fill="none" stroke="#dcff00" strokeWidth="2" strokeLinejoin="round">
          <path d="M 70 15 L 70 8 L 165 8 L 165 15" strokeLinecap="round" />
          <rect x="70" y="6" width="95" height="4" rx="1" fill="#dcff00" fillOpacity="0.4" />
          <g className="sd-hero-reel-top">
            <circle cx="80" cy="28" r="22" fill="#0a0a0a" stroke="#dcff00" strokeWidth="2.4" />
            <circle cx="80" cy="28" r="22" />
            <circle cx="80" cy="28" r="8" fill="#dcff00" fillOpacity="0.4" stroke="#dcff00" />
            <circle cx="80" cy="28" r="3" fill="#dcff00" />
            <circle cx="80" cy="14" r="2" fill="#000" stroke="#dcff00" strokeWidth="1" />
            <circle cx="94" cy="28" r="2" fill="#000" stroke="#dcff00" strokeWidth="1" />
            <circle cx="80" cy="42" r="2" fill="#000" stroke="#dcff00" strokeWidth="1" />
            <circle cx="66" cy="28" r="2" fill="#000" stroke="#dcff00" strokeWidth="1" />
          </g>
          <g className="sd-hero-reel-bottom">
            <circle cx="145" cy="28" r="22" fill="#0a0a0a" stroke="#dcff00" strokeWidth="2.4" />
            <circle cx="145" cy="28" r="22" />
            <circle cx="145" cy="28" r="8" fill="#dcff00" fillOpacity="0.4" stroke="#dcff00" />
            <circle cx="145" cy="28" r="3" fill="#dcff00" />
            <circle cx="145" cy="14" r="2" fill="#000" stroke="#dcff00" strokeWidth="1" />
            <circle cx="159" cy="28" r="2" fill="#000" stroke="#dcff00" strokeWidth="1" />
            <circle cx="145" cy="42" r="2" fill="#000" stroke="#dcff00" strokeWidth="1" />
            <circle cx="131" cy="28" r="2" fill="#000" stroke="#dcff00" strokeWidth="1" />
          </g>
          <rect x="55" y="55" width="135" height="65" rx="5" fill="#dcff00" fillOpacity="0.1" stroke="#dcff00" strokeWidth="2.2" />
          <line x1="65" y1="62" x2="80" y2="62" strokeOpacity="0.5" />
          <line x1="65" y1="65" x2="80" y2="65" strokeOpacity="0.5" />
          <line x1="65" y1="68" x2="80" y2="68" strokeOpacity="0.5" />
          <g className="sd-hero-screen-flicker">
            <rect x="88" y="62" width="60" height="40" rx="2" fill="#dcff00" fillOpacity="0.22" stroke="#dcff00" strokeWidth="1.6" />
            <path d="M 92 75 L 96 78 L 100 70 L 104 80 L 108 72 L 112 78 L 116 73 L 120 80 L 124 75 L 128 78 L 132 73 L 136 78 L 140 75 L 144 78" stroke="#fff" strokeWidth="1.2" fill="none" strokeOpacity="0.8" />
            <text x="92" y="98" fill="#fff" fontFamily="monospace" fontSize="6" fontWeight="bold">REC ● 24p 4K</text>
          </g>
          <g className="sd-hero-rec-blink">
            <circle cx="160" cy="68" r="4" fill="#ff0040" stroke="#ff0040" />
            <circle cx="160" cy="68" r="7" fill="#ff0040" fillOpacity="0.3" stroke="none" />
          </g>
          <text x="170" y="71" fill="#ff0040" fontFamily="monospace" fontSize="7" fontWeight="bold">REC</text>
          <circle cx="160" cy="85" r="2.5" fill="#dcff00" fillOpacity="0.3" stroke="#dcff00" />
          <circle cx="170" cy="85" r="2.5" fill="#dcff00" fillOpacity="0.3" stroke="#dcff00" />
          <circle cx="180" cy="85" r="2.5" fill="#dcff00" fillOpacity="0.3" stroke="#dcff00" />
          <circle cx="170" cy="100" r="6" fill="#0a0a0a" stroke="#dcff00" strokeWidth="1.5" />
          <line x1="170" y1="100" x2="170" y2="95" stroke="#dcff00" strokeWidth="1.5" />
          <circle cx="28" cy="75" r="28" fill="#0a0a0a" stroke="#dcff00" strokeWidth="2.5" />
          <circle cx="28" cy="75" r="28" />
          <circle cx="28" cy="75" r="25" stroke="#dcff00" strokeWidth="1.2" strokeDasharray="3 2" fill="none" />
          <circle cx="28" cy="75" r="20" stroke="#dcff00" strokeWidth="1.2" fill="none" />
          <text x="28" y="51" textAnchor="middle" fill="#dcff00" fontFamily="monospace" fontSize="5" fontWeight="bold">1.4</text>
          <text x="50" y="78" textAnchor="middle" fill="#dcff00" fontFamily="monospace" fontSize="5" fontWeight="bold">2.8</text>
          <text x="28" y="101" textAnchor="middle" fill="#dcff00" fontFamily="monospace" fontSize="5" fontWeight="bold">5.6</text>
          <text x="6" y="78" textAnchor="middle" fill="#dcff00" fontFamily="monospace" fontSize="5" fontWeight="bold">11</text>
          <circle cx="28" cy="75" r="14" fill="#000" />
          <circle cx="28" cy="75" r="14" />
          <g className="sd-hero-lens-iris">
            <polygon points="28,62 38,67 38,79 28,84 18,79 18,67" fill="#dcff00" fillOpacity="0.18" stroke="#dcff00" strokeWidth="1.2" />
            <polygon points="28,65 36,69 36,77 28,81 20,77 20,69" fill="#000" stroke="#dcff00" strokeWidth="0.8" />
          </g>
          <g className="sd-hero-lens-glare">
            <ellipse cx="22" cy="69" rx="5" ry="2" fill="#fff" fillOpacity="0.7" stroke="none" transform="rotate(-30 22 69)" />
            <circle cx="20" cy="67" r="1.5" fill="#fff" fillOpacity="0.9" stroke="none" />
            <circle cx="32" cy="80" r="1" fill="#fff" fillOpacity="0.5" stroke="none" />
          </g>
          <line x1="0" y1="65" x2="3" y2="65" strokeWidth="2.5" />
          <line x1="0" y1="85" x2="3" y2="85" strokeWidth="2.5" />
          <rect x="100" y="120" width="50" height="6" rx="2" fill="#dcff00" fillOpacity="0.2" stroke="#dcff00" strokeWidth="1.5" />
          <circle cx="125" cy="125" r="3" fill="#dcff00" fillOpacity="0.4" stroke="#dcff00" />
          <line x1="125" y1="128" x2="125" y2="138" />
          <line x1="125" y1="138" x2="100" y2="158" strokeWidth="2.4" />
          <line x1="125" y1="138" x2="125" y2="158" strokeWidth="2.4" />
          <line x1="125" y1="138" x2="150" y2="158" strokeWidth="2.4" />
          <line x1="96" y1="158" x2="104" y2="158" strokeWidth="2.5" />
          <line x1="121" y1="158" x2="129" y2="158" strokeWidth="2.5" />
          <line x1="146" y1="158" x2="154" y2="158" strokeWidth="2.5" />
        </svg>
      </div>

      {/* ═══ CLAPPERBOARD ═══ */}
      <div className="sd-hero-phys-obj" data-start-x="5%" data-start-y="8%" style={{ opacity: 0, pointerEvents: "none" }}>
        <svg className="sd-hero-clapper-svg" width="130" height="115" viewBox="0 0 160 145" fill="none" stroke="#dcff00" strokeWidth="2.2" strokeLinejoin="round">
          <rect x="20" y="50" width="120" height="85" rx="3" fill="#dcff00" fillOpacity="0.1" stroke="#dcff00" strokeWidth="2.2" />
          <line x1="30" y1="70" x2="130" y2="70" strokeOpacity="0.6" />
          <line x1="30" y1="90" x2="130" y2="90" strokeOpacity="0.5" />
          <line x1="30" y1="110" x2="130" y2="110" strokeOpacity="0.5" />
          <line x1="68" y1="70" x2="68" y2="125" strokeOpacity="0.4" />
          <line x1="105" y1="70" x2="105" y2="125" strokeOpacity="0.4" />
          <text x="35" y="65" fill="#dcff00" fontFamily="monospace" fontSize="7" fontWeight="bold">PROD</text>
          <text x="73" y="65" fill="#dcff00" fontFamily="monospace" fontSize="7" fontWeight="bold">DIR</text>
          <text x="110" y="65" fill="#dcff00" fontFamily="monospace" fontSize="7" fontWeight="bold">DATE</text>
          <text x="35" y="85" fill="#dcff00" fontFamily="monospace" fontSize="6">SCENE</text>
          <text x="73" y="85" fill="#dcff00" fontFamily="monospace" fontSize="6">TAKE</text>
          <text x="110" y="85" fill="#dcff00" fontFamily="monospace" fontSize="6">ROLL</text>
          <text x="50" y="106" textAnchor="middle" fill="#dcff00" fontFamily="monospace" fontSize="13" fontWeight="bold">12A</text>
          <text x="86" y="106" textAnchor="middle" fill="#dcff00" fontFamily="monospace" fontSize="13" fontWeight="bold">03</text>
          <text x="118" y="106" textAnchor="middle" fill="#dcff00" fontFamily="monospace" fontSize="13" fontWeight="bold">07</text>
          <text x="80" y="125" textAnchor="middle" fill="#dcff00" fontFamily="monospace" fontSize="6" fontWeight="bold">SEEDANCE STUDIO</text>
          <g className="sd-hero-clap-top">
            <rect x="20" y="20" width="120" height="28" rx="3" fill="#dcff00" fillOpacity="0.15" stroke="#dcff00" strokeWidth="2.2" />
            <polygon points="22,48 38,20 54,48" fill="#dcff00" fillOpacity="0.45" />
            <polygon points="54,48 70,20 86,48" fill="#000" />
            <polygon points="86,48 102,20 118,48" fill="#dcff00" fillOpacity="0.45" />
            <polygon points="118,48 134,20 138,48" fill="#000" />
            <polygon points="138,48 138,20 138,20" fill="#dcff00" fillOpacity="0.45" />
          </g>
          <circle cx="22" cy="48" r="2.5" fill="#dcff00" stroke="none" />
        </svg>
      </div>

      {/* ═══ CINEMA LENS ═══ */}
      <div className="sd-hero-phys-obj" data-start-x="3%" data-start-y="55%" style={{ opacity: 0, pointerEvents: "none" }}>
        <svg className="sd-hero-lens-svg" width="120" height="120" viewBox="0 0 130 130" fill="none" stroke="#dcff00" strokeWidth="2.4">
          <circle cx="65" cy="65" r="60" fill="#dcff00" fillOpacity="0.06" stroke="#dcff00" strokeWidth="2.6" />
          <g className="sd-hero-focus-ring">
            <circle cx="65" cy="65" r="55" stroke="#dcff00" strokeWidth="1.2" strokeDasharray="4 3" fill="none" />
            <text x="65" y="20" textAnchor="middle" fill="#dcff00" fontFamily="monospace" fontSize="6" fontWeight="bold">∞</text>
            <text x="105" y="68" textAnchor="middle" fill="#dcff00" fontFamily="monospace" fontSize="6" fontWeight="bold">3M</text>
            <text x="65" y="115" textAnchor="middle" fill="#dcff00" fontFamily="monospace" fontSize="6" fontWeight="bold">1M</text>
            <text x="22" y="68" textAnchor="middle" fill="#dcff00" fontFamily="monospace" fontSize="6" fontWeight="bold">.5M</text>
          </g>
          <circle cx="65" cy="65" r="48" stroke="#dcff00" strokeWidth="1.8" fill="none" />
          <text x="65" y="33" textAnchor="middle" fill="#dcff00" fontFamily="monospace" fontSize="6" fontWeight="bold">T1.4</text>
          <text x="93" y="68" textAnchor="middle" fill="#dcff00" fontFamily="monospace" fontSize="6" fontWeight="bold">2.8</text>
          <text x="65" y="103" textAnchor="middle" fill="#dcff00" fontFamily="monospace" fontSize="6" fontWeight="bold">5.6</text>
          <text x="35" y="68" textAnchor="middle" fill="#dcff00" fontFamily="monospace" fontSize="6" fontWeight="bold">T11</text>
          <line x1="65" y1="14" x2="65" y2="18" strokeWidth="2" />
          <line x1="111" y1="65" x2="107" y2="65" strokeWidth="2" />
          <line x1="65" y1="116" x2="65" y2="112" strokeWidth="2" />
          <line x1="14" y1="65" x2="18" y2="65" strokeWidth="2" />
          <circle cx="65" cy="65" r="32" fill="#000" />
          <circle cx="65" cy="65" r="32" />
          <g className="sd-hero-iris-blades">
            <polygon points="65,40 80,48 88,65 80,82 65,90 50,82 42,65 50,48" fill="#dcff00" fillOpacity="0.15" stroke="#dcff00" strokeWidth="1.5" />
            <polygon points="65,45 76,52 82,65 76,78 65,85 54,78 48,65 54,52" fill="#000" stroke="#dcff00" strokeWidth="1" />
            <circle cx="65" cy="65" r="13" fill="#0a0a0a" stroke="#dcff00" strokeWidth="1.2" />
            <circle cx="65" cy="65" r="6" fill="#dcff00" fillOpacity="0.2" stroke="none" />
          </g>
          <g className="sd-hero-lens-flare">
            <ellipse cx="55" cy="55" rx="7" ry="3" fill="#fff" fillOpacity="0.8" stroke="none" transform="rotate(-30 55 55)" />
            <circle cx="50" cy="50" r="2.5" fill="#fff" fillOpacity="0.9" stroke="none" />
            <circle cx="78" cy="78" r="1.5" fill="#fff" fillOpacity="0.4" stroke="none" />
          </g>
        </svg>
      </div>

      {/* ═══ DIRECTOR'S CHAIR ═══ */}
      <div className="sd-hero-phys-obj" data-start-x="88%" data-start-y="68%" style={{ opacity: 0, pointerEvents: "none" }}>
        <svg className="sd-hero-director-svg" width="90" height="115" viewBox="0 0 110 140" fill="none" stroke="#dcff00" strokeWidth="2.4">
          <g className="sd-hero-chair-back">
            <rect x="22" y="15" width="66" height="26" rx="2" fill="#dcff00" fillOpacity="0.2" stroke="#dcff00" strokeWidth="2.2" />
            <text x="55" y="32" textAnchor="middle" fill="#dcff00" fontFamily="monospace" fontSize="9" fontWeight="bold">DIRECTOR</text>
            <line x1="22" y1="15" x2="15" y2="68" />
            <line x1="88" y1="15" x2="95" y2="68" />
            <rect x="13" y="62" width="84" height="14" rx="1.5" fill="#dcff00" fillOpacity="0.18" stroke="#dcff00" strokeWidth="2" />
            <line x1="15" y1="68" x2="95" y2="108" />
            <line x1="95" y1="68" x2="15" y2="108" />
          </g>
          <line x1="15" y1="68" x2="15" y2="130" />
          <line x1="95" y1="68" x2="95" y2="130" />
          <line x1="10" y1="130" x2="100" y2="130" strokeWidth="2.5" />
          <line x1="22" y1="108" x2="88" y2="108" />
          <circle cx="15" cy="130" r="2" fill="#dcff00" stroke="none" />
          <circle cx="95" cy="130" r="2" fill="#dcff00" stroke="none" />
        </svg>
      </div>

      {/* ═══ FILM REEL ═══ */}
      <div className="sd-hero-phys-obj" data-start-x="78%" data-start-y="42%" style={{ opacity: 0, pointerEvents: "none" }}>
        <svg className="sd-hero-reel-svg" width="110" height="110" viewBox="0 0 130 130" fill="none" stroke="#dcff00" strokeWidth="2.4">
          <g className="sd-hero-reel-spin">
            <circle cx="65" cy="65" r="55" fill="#dcff00" fillOpacity="0.08" stroke="#dcff00" strokeWidth="2.4" />
            <circle cx="65" cy="65" r="16" />
            <circle cx="65" cy="65" r="7" fill="#dcff00" fillOpacity="0.5" stroke="none" />
            <circle cx="65" cy="65" r="7" />
            <circle cx="65" cy="65" r="2.5" fill="#000" />
            <circle cx="65" cy="20" r="6" fill="#000" stroke="#dcff00" />
            <circle cx="65" cy="110" r="6" fill="#000" stroke="#dcff00" />
            <circle cx="20" cy="65" r="6" fill="#000" stroke="#dcff00" />
            <circle cx="110" cy="65" r="6" fill="#000" stroke="#dcff00" />
            <circle cx="35" cy="35" r="4" fill="#000" stroke="#dcff00" strokeWidth="1.8" />
            <circle cx="95" cy="35" r="4" fill="#000" stroke="#dcff00" strokeWidth="1.8" />
            <circle cx="35" cy="95" r="4" fill="#000" stroke="#dcff00" strokeWidth="1.8" />
            <circle cx="95" cy="95" r="4" fill="#000" stroke="#dcff00" strokeWidth="1.8" />
            <path d="M 65 30 L 78 55 L 52 55 Z" fill="#000" stroke="none" />
            <path d="M 65 100 L 52 75 L 78 75 Z" fill="#000" stroke="none" />
            <path d="M 30 65 L 55 52 L 55 78 Z" fill="#000" stroke="none" />
            <path d="M 100 65 L 75 78 L 75 52 Z" fill="#000" stroke="none" />
          </g>
          <path className="sd-hero-film-flow" d="M 120 65 L 130 65" strokeWidth="4" stroke="#dcff00" />
          <line x1="120" y1="62" x2="130" y2="62" strokeWidth="0.5" strokeOpacity="0.5" />
          <line x1="120" y1="68" x2="130" y2="68" strokeWidth="0.5" strokeOpacity="0.5" />
        </svg>
      </div>

      {/* ═══ STUDIO LIGHT ═══ */}
      <div className="sd-hero-phys-obj" data-start-x="91%" data-start-y="48%" style={{ opacity: 0, pointerEvents: "none" }}>
        <svg className="sd-hero-light-svg" width="90" height="135" viewBox="0 0 100 150" fill="none" stroke="#dcff00" strokeWidth="2.2">
          <g className="sd-hero-light-cone">
            <path d="M 30 35 L 5 130 L 95 130 L 70 35 Z" fill="#dcff00" fillOpacity="0.18" stroke="none" />
            <path d="M 35 35 L 18 110 L 82 110 L 65 35 Z" fill="#fff" fillOpacity="0.08" stroke="none" />
          </g>
          <ellipse cx="50" cy="35" rx="28" ry="10" fill="#dcff00" fillOpacity="0.15" stroke="none" />
          <rect x="22" y="22" width="56" height="24" rx="3" fill="#dcff00" fillOpacity="0.25" stroke="#dcff00" strokeWidth="2.2" />
          <line x1="22" y1="28" x2="12" y2="14" strokeWidth="2" />
          <line x1="78" y1="28" x2="88" y2="14" strokeWidth="2" />
          <line x1="22" y1="40" x2="12" y2="50" strokeWidth="2" />
          <line x1="78" y1="40" x2="88" y2="50" strokeWidth="2" />
          <g className="sd-hero-bulb">
            <circle cx="50" cy="35" r="9" fill="#fff" fillOpacity="0.9" stroke="#fff" strokeWidth="1.5" />
            <circle cx="50" cy="35" r="6" fill="#fff" fillOpacity="0.6" stroke="none" />
            <circle cx="50" cy="35" r="9" fill="none" stroke="#dcff00" strokeWidth="0.8" />
            <circle cx="50" cy="35" r="7" fill="none" stroke="#dcff00" strokeWidth="0.6" strokeOpacity="0.6" />
          </g>
          <line x1="22" y1="34" x2="14" y2="60" />
          <line x1="78" y1="34" x2="86" y2="60" />
          <circle cx="14" cy="60" r="2" fill="#dcff00" />
          <circle cx="86" cy="60" r="2" fill="#dcff00" />
          <line x1="50" y1="46" x2="50" y2="115" strokeWidth="2.2" />
          <line x1="50" y1="115" x2="25" y2="142" strokeWidth="2.2" />
          <line x1="50" y1="115" x2="50" y2="142" strokeWidth="2.2" />
          <line x1="50" y1="115" x2="75" y2="142" strokeWidth="2.2" />
          <circle cx="25" cy="142" r="2" fill="#dcff00" />
          <circle cx="50" cy="142" r="2" fill="#dcff00" />
          <circle cx="75" cy="142" r="2" fill="#dcff00" />
        </svg>
      </div>

      {/* ═══ SLATE ═══ */}
      <div className="sd-hero-phys-obj" data-start-x="14%" data-start-y="68%" style={{ opacity: 0, pointerEvents: "none" }}>
        <svg className="sd-hero-slate-svg" width="115" height="90" viewBox="0 0 145 110" fill="none" stroke="#dcff00" strokeWidth="2.2">
          <rect x="12" y="14" width="120" height="18" rx="2" fill="#dcff00" fillOpacity="0.1" />
          <polygon points="17,32 28,14 39,32" fill="#dcff00" fillOpacity="0.45" />
          <polygon points="39,32 50,14 61,32" fill="#000" />
          <polygon points="61,32 72,14 83,32" fill="#dcff00" fillOpacity="0.45" />
          <polygon points="83,32 94,14 105,32" fill="#000" />
          <polygon points="105,32 116,14 127,32" fill="#dcff00" fillOpacity="0.45" />
          <line x1="12" y1="32" x2="132" y2="32" />
          <rect x="12" y="32" width="120" height="62" rx="2" fill="#dcff00" fillOpacity="0.06" />
          <line x1="12" y1="56" x2="132" y2="56" strokeOpacity="0.5" />
          <line x1="55" y1="32" x2="55" y2="94" strokeOpacity="0.5" />
          <line x1="95" y1="32" x2="95" y2="94" strokeOpacity="0.5" />
          <text x="20" y="48" fill="#dcff00" fontFamily="monospace" fontSize="6">SCENE</text>
          <text x="63" y="48" fill="#dcff00" fontFamily="monospace" fontSize="6">TAKE</text>
          <text x="103" y="48" fill="#dcff00" fontFamily="monospace" fontSize="6">ROLL</text>
          <text className="sd-hero-scene-num" x="33" y="80" textAnchor="middle" fill="#dcff00" fontFamily="monospace" fontSize="14" fontWeight="bold">12A</text>
          <text className="sd-hero-scene-num" x="75" y="80" textAnchor="middle" fill="#dcff00" fontFamily="monospace" fontSize="14" fontWeight="bold">03</text>
          <text className="sd-hero-scene-num" x="113" y="80" textAnchor="middle" fill="#dcff00" fontFamily="monospace" fontSize="14" fontWeight="bold">07</text>
        </svg>
      </div>

      <button className="sd-hero-reset-btn" ref={resetBtnRef}>↻ RESET</button>

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

      {/* ═══════════════ All hero CSS, scoped under .sd-hero ═══════════════ */}
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
        /* Bottom-edge feather — fades the hero into pure black over the
           last ~220px so whatever section sits below (Live Gallery on
           the homepage) merges with no visible seam, regardless of
           that section's exact background colour. Sits above the
           floating props (z:80) but below the hero content (z:50 →
           overridden up to z:90 inside) so headline + buttons stay on
           top, while the bottom of any drifted prop/particle gracefully
           dissolves into black. */
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
        .sd-hero-play-hint {
          position: absolute;
          top: 80px;
          left: 50%;
          transform: translateX(-50%);
          color: #dcff00;
          font-size: 11px;
          letter-spacing: 3px;
          z-index: 60;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(10px);
          padding: 6px 14px;
          border-radius: 20px;
          border: 1px solid rgba(220, 255, 0, 0.3);
          pointer-events: none;
          opacity: 0;
          animation: sd-hero-hintIn 1s 1.5s ease-out forwards;
        }
        @keyframes sd-hero-hintIn { to { opacity: 1; } }

        /* PHYSICS OBJECTS */
        .sd-hero .sd-hero-phys-obj {
          position: absolute;
          cursor: grab;
          opacity: 0.7;
          filter: drop-shadow(0 0 10px rgba(220, 255, 0, 0.5)) drop-shadow(0 0 20px rgba(220, 255, 0, 0.25));
          will-change: transform, left, top;
          user-select: none;
          -webkit-user-drag: none;
          touch-action: none;
          transition: opacity 0.3s, filter 0.3s;
          z-index: 4;
        }
        .sd-hero .sd-hero-phys-obj.sd-hero-phys-obj--dragging {
          cursor: grabbing;
          opacity: 1;
          filter: drop-shadow(0 0 25px rgba(220, 255, 0, 1)) drop-shadow(0 0 50px rgba(220, 255, 0, 0.7));
          z-index: 90;
          transition: none;
        }
        .sd-hero .sd-hero-phys-obj:hover:not(.sd-hero-phys-obj--dragging) {
          opacity: 1;
          filter: drop-shadow(0 0 18px rgba(220, 255, 0, 1)) drop-shadow(0 0 35px rgba(220, 255, 0, 0.6));
          z-index: 50;
        }

        /* CAR */
        .sd-hero .sd-hero-car { width: 240px; height: 90px; }
        .sd-hero .sd-hero-car--driving .sd-hero-wheel-front,
        .sd-hero .sd-hero-car--driving .sd-hero-wheel-rear {
          animation: sd-hero-wheelSpinSlow 0.9s linear infinite;
        }
        @keyframes sd-hero-wheelSpinSlow { to { transform: rotate(360deg); } }
        .sd-hero .sd-hero-headlight { animation: sd-hero-pulseLight 1.5s ease-in-out infinite; }
        @keyframes sd-hero-pulseLight { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
        .sd-hero .sd-hero-taillight { animation: sd-hero-pulseTail 2s ease-in-out infinite; }
        @keyframes sd-hero-pulseTail { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }

        /* CINEMA CAMERA */
        .sd-hero .sd-hero-camera-svg .sd-hero-reel-top { transform-origin: 80px 28px; animation: sd-hero-spin 4s linear infinite; }
        .sd-hero .sd-hero-camera-svg .sd-hero-reel-bottom { transform-origin: 145px 28px; animation: sd-hero-spin 4s linear infinite reverse; }
        @keyframes sd-hero-spin { to { transform: rotate(360deg); } }
        .sd-hero .sd-hero-camera-svg .sd-hero-rec-blink { animation: sd-hero-recBlink 1.2s infinite; }
        @keyframes sd-hero-recBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .sd-hero .sd-hero-camera-svg .sd-hero-lens-iris {
          transform-origin: 28px 75px;
          animation: sd-hero-lensIrisBreathe 4s ease-in-out infinite;
        }
        @keyframes sd-hero-lensIrisBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(0.55); } }
        .sd-hero .sd-hero-camera-svg .sd-hero-lens-glare { animation: sd-hero-glareSweep 3s ease-in-out infinite; }
        @keyframes sd-hero-glareSweep { 0%, 100% { opacity: 0.3; transform: translateX(0); } 50% { opacity: 0.8; transform: translateX(3px); } }
        .sd-hero .sd-hero-camera-svg .sd-hero-screen-flicker { animation: sd-hero-screenFlicker 3s linear infinite; }
        @keyframes sd-hero-screenFlicker { 0%, 100% { opacity: 1; } 33% { opacity: 0.7; } 66% { opacity: 0.85; } }

        /* CLAPPER */
        .sd-hero .sd-hero-clapper-svg .sd-hero-clap-top {
          transform-origin: 8% 95%;
          animation: sd-hero-clapSnap 4s ease-in-out infinite;
        }
        @keyframes sd-hero-clapSnap {
          0%, 86%, 100% { transform: rotate(0deg); }
          90% { transform: rotate(-30deg); }
          93% { transform: rotate(0deg); }
          95% { transform: rotate(-3deg); }
          97% { transform: rotate(0deg); }
        }

        /* LENS */
        .sd-hero .sd-hero-lens-svg .sd-hero-iris-blades {
          transform-origin: center;
          animation: sd-hero-irisBreathe 5s ease-in-out infinite;
        }
        @keyframes sd-hero-irisBreathe { 0%, 100% { transform: scale(1) rotate(0deg); } 50% { transform: scale(0.5) rotate(15deg); } }
        .sd-hero .sd-hero-lens-svg .sd-hero-focus-ring {
          transform-origin: center;
          animation: sd-hero-focusTurn 8s ease-in-out infinite;
        }
        @keyframes sd-hero-focusTurn { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(45deg); } }
        .sd-hero .sd-hero-lens-svg .sd-hero-lens-flare { animation: sd-hero-lensFlarePulse 3s ease-in-out infinite; }
        @keyframes sd-hero-lensFlarePulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }

        /* DIRECTOR'S CHAIR */
        .sd-hero .sd-hero-director-svg .sd-hero-chair-back {
          transform-origin: 50% 100%;
          animation: sd-hero-chairSway 6s ease-in-out infinite;
        }
        @keyframes sd-hero-chairSway { 0%, 100% { transform: rotate(-1.5deg); } 50% { transform: rotate(1.5deg); } }

        /* FILM REEL */
        .sd-hero .sd-hero-reel-svg .sd-hero-reel-spin { transform-origin: center; animation: sd-hero-spin 7s linear infinite; }
        .sd-hero .sd-hero-reel-svg .sd-hero-film-flow { animation: sd-hero-filmUnspool 2s linear infinite; stroke-dasharray: 6 4; }
        @keyframes sd-hero-filmUnspool { to { stroke-dashoffset: -20; } }

        /* STUDIO LIGHT */
        .sd-hero .sd-hero-light-svg .sd-hero-light-cone {
          transform-origin: 50px 35px;
          animation: sd-hero-lightPulse 3s ease-in-out infinite;
        }
        @keyframes sd-hero-lightPulse { 0%, 100% { opacity: 0.3; transform: scaleY(1); } 50% { opacity: 0.7; transform: scaleY(1.08); } }
        .sd-hero .sd-hero-light-svg .sd-hero-bulb { animation: sd-hero-bulbGlow 2s ease-in-out infinite; }
        @keyframes sd-hero-bulbGlow { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }

        /* SLATE */
        .sd-hero .sd-hero-slate-svg .sd-hero-scene-num { animation: sd-hero-sceneFlicker 3s ease-in-out infinite; }
        @keyframes sd-hero-sceneFlicker { 0%, 100% { opacity: 1; } 20% { opacity: 0.4; } 25% { opacity: 1; } 50% { opacity: 0.7; } }

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

        .sd-hero-reset-btn {
          position: absolute;
          bottom: 24px;
          right: 24px;
          background: rgba(220, 255, 0, 0.1);
          color: #dcff00;
          border: 1px solid rgba(220, 255, 0, 0.3);
          padding: 8px 14px;
          border-radius: 20px;
          font-size: 11px;
          letter-spacing: 2px;
          cursor: pointer;
          z-index: 90;
          backdrop-filter: blur(10px);
          font-family: 'Courier New', monospace;
        }
        .sd-hero-reset-btn:hover { background: rgba(220, 255, 0, 0.2); }

        @media (max-width: 768px) {
          /* MOBILE LAYOUT FIX — stop forcing min-height: 100vh.
             On short viewports (iPhone SE @ 568 px, the iOS bottom
             URL bar that appears on scroll, etc.) the centred flex
             layout was clipping content, and the bottom feather
             created a dark band over the stats. Letting the hero
             be content-sized gives a clean, predictable layout
             that doesn't reflow when the mobile browser's URL bar
             collapses. */
          .sd-hero {
            min-height: auto !important;
            padding: 96px 18px 56px !important;
            justify-content: flex-start !important;
          }
          /* Drop the bottom feather on mobile — the hero is now
             content-sized and sits flush above the (already dark)
             gallery section. The feather was a safety net for the
             desktop 100vh layout; on mobile it just crops content. */
          .sd-hero::after { display: none !important; }
          /* Skip the masked-grid overlay too — the radial mask
             interacts badly with short viewports and adds visual
             noise without the props to anchor the rule-of-thirds
             feel. */
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

          /* Hide the desktop-only physics playground + its UX hints. */
          .sd-hero .sd-hero-phys-obj { display: none !important; }
          .sd-hero-reset-btn { display: none !important; }
          .sd-hero-play-hint { display: none !important; }

          /* Cheaper smoke blobs on mobile — kill the cyan one and
             halve the blur on the remaining two. Big blur on a
             600 px element is the most expensive mobile-GPU paint. */
          .sd-hero-smoke-2 { display: none !important; }
          .sd-hero-smoke-1,
          .sd-hero-smoke-3 { filter: blur(40px) !important; }
        }

        /* Reduced-motion respect: render a static cinematic hero,
           skip every CSS animation. Particles + physics rAF are
           also short-circuited from the JS side (see useEffect). */
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
