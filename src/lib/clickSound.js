//
// clickSound — synthesised UI click sound for /generate buttons.
//
// Uses Web Audio API to generate a short pleasant "tk" click on the
// fly. No asset file means zero bandwidth + zero load time. Persists
// the mute state in localStorage as `seedance_sounds_muted` so the
// user's preference survives refresh.
//
// Usage:
//   import { playClick, isMuted, setMuted } from "@/lib/clickSound";
//   playClick();
//   setMuted(true);
//
// Browsers require a user-gesture before AudioContext can play — we
// resume() on every play to handle the case where the context was
// suspended at construction (common on mobile + autoplay-strict
// browsers). Catch-all silently swallows errors so an audio failure
// never breaks a click.

let audioCtx = null;
const STORAGE_KEY = "seedance_sounds_muted";

function ctx() {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

export function isMuted() {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}

export function setMuted(muted) {
  try {
    if (muted) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

// Internal — actually schedule the oscillator on `c`. Split out so we
// can await resume() before calling it.
function schedule(c) {
  const t = c.currentTime;
  // Triangle wave at ~900 Hz with a fast pitch drop and quick decay
  // produces a soft "tk" tone. Volume 0.22 — quiet but actually
  // audible on phone speakers (0.10 was too quiet — Arman flagged
  // 2026-05-13 "the sound is not there").
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(900, t);
  osc.frequency.exponentialRampToValueAtTime(420, t + 0.04);
  gain.gain.setValueAtTime(0.22, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.08);
}

export function playClick() {
  if (isMuted()) return;
  try {
    const c = ctx();
    if (!c) return;
    // Browsers (especially iOS) start AudioContext in "suspended" state
    // and require a user gesture to resume. resume() returns a Promise,
    // so we MUST await it before scheduling — otherwise currentTime
    // doesn't advance and the oscillator silently produces nothing.
    // Previous version called resume() without awaiting, hence "no sound".
    if (c.state === "suspended") {
      c.resume().then(() => schedule(c)).catch(() => {});
    } else {
      schedule(c);
    }
  } catch {}
}
