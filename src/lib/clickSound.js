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

// Internal — pre-rendered click buffer (cached after first build).
// Switching from runtime-scheduled oscillator → pre-baked AudioBuffer
// because the oscillator approach was producing silence on some
// browsers when the AudioContext was momentarily suspended. A
// BufferSource just plays the buffer; doesn't depend on currentTime
// advancing or oscillator scheduling. Arman flagged "no audio" twice
// 2026-05-13.
let cachedBuffer = null;

function getBuffer(c) {
  if (cachedBuffer) return cachedBuffer;
  const dur = 0.08;                              // 80 ms
  const sr = c.sampleRate;
  const len = Math.floor(sr * dur);
  const buf = c.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    // Pitch glide from 900 Hz → 420 Hz over the first 40 ms.
    const k = Math.min(1, t / 0.04);
    const freq = 900 * Math.pow(420 / 900, k);
    // Exponential decay envelope — the "tk" shape.
    const env = Math.exp(-t * 40);
    // Triangle wave sample.
    const phase = (freq * t) % 1;
    const tri = phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;
    data[i] = tri * env * 0.55; // amplitude — loud enough to actually hear
  }
  cachedBuffer = buf;
  return buf;
}

function playInternal(c) {
  if (!c) return;
  // Resume kicks the AudioContext out of suspended state if needed.
  // Promise can be ignored — start() works regardless once resume is
  // initiated, and the BufferSource doesn't rely on currentTime
  // advancing the way oscillators did.
  if (c.state === "suspended") c.resume().catch(() => {});
  const buf = getBuffer(c);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  src.start();
}

export function playClick() {
  if (isMuted()) return;
  try { playInternal(ctx()); } catch {}
}

// Bypasses the mute check — used by the 🔊/🔇 toggle button so it
// ALWAYS plays a click as a sound-check, regardless of the mute state
// the user is toggling to/from.
export function playClickForce() {
  try { playInternal(ctx()); } catch {}
}
