"use client";

/**
 * SocialProofPopup — bottom-left toast that cycles through recent
 * signups (real first, dummies as filler).
 *
 * Mounted once in the root layout. Self-throttling:
 *   • First popup:        5-10 s after first paint
 *   • Subsequent popups:  30-60 s apart
 *   • Display duration:   6 s
 *   • Session cap:        10 popups (8 on mobile)
 *
 * Double-layer dedupe (matches the spec):
 *   1. SERVER — IP-keyed via SocialProofShown table. Queue returns
 *      only users this IP has never seen. (src/lib/social-proof.js)
 *   2. CLIENT — localStorage list of user IDs already shown on
 *      THIS device. Catches mobile IP rotation and shared-IP cases
 *      (cafes, offices, household routers).
 *
 * Disable hooks:
 *   • localStorage.setItem("seedance_disable_social_proof", "1")
 *     — kills the popup for this device permanently
 *   • Anyone tapping the × on a popup gets a 30-min cool-down (UX —
 *     no aggressive re-popping after a dismiss)
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// ── Tuning constants ─────────────────────────────────────────────
const FIRST_DELAY_MS_MIN = 5_000;
const FIRST_DELAY_MS_MAX = 10_000;
const GAP_MS_MIN_DESKTOP = 30_000;
const GAP_MS_MAX_DESKTOP = 60_000;
const GAP_MS_MIN_MOBILE  = 60_000;
const GAP_MS_MAX_MOBILE  = 90_000;
const SHOW_DURATION_MS   = 6_000;
const SESSION_CAP_DESKTOP = 10;
const SESSION_CAP_MOBILE  = 8;
const DISMISS_COOLDOWN_MS = 30 * 60_000;       // 30 min after manual ×

// localStorage keys
const LS_SHOWN_KEY      = "seedance_shown_popup_users";
const LS_DISABLE_KEY    = "seedance_disable_social_proof";
const LS_DISMISS_KEY    = "seedance_social_proof_dismissed_until";

// Routes where the popup makes sense. Skip everything else (admin,
// API, profile editor, generation flows where the user is mid-task).
const ALLOWED_PATHS = ["/", "/pricing", "/gallery"];
function shouldShowOnPath(pathname) {
  if (!pathname) return false;
  return ALLOWED_PATHS.includes(pathname);
}

function isMobile() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(max-width: 640px)").matches ?? false;
}

function rand(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

// localStorage helpers — every read is try/catch because Safari
// private mode + cookie-blocked browsers throw on access.
function readShownIds() {
  try {
    const raw = window.localStorage.getItem(LS_SHOWN_KEY);
    return new Set(JSON.parse(raw || "[]"));
  } catch { return new Set(); }
}
function appendShownId(id) {
  try {
    const set = readShownIds();
    set.add(id);
    // Cap at 5000 so a heavy-use device doesn't bloat localStorage.
    // FIFO trim — drop the oldest 500 when we hit the cap.
    let arr = Array.from(set);
    if (arr.length > 5000) arr = arr.slice(arr.length - 4500);
    window.localStorage.setItem(LS_SHOWN_KEY, JSON.stringify(arr));
  } catch { /* ignore */ }
}
function isDisabled() {
  try {
    if (window.localStorage.getItem(LS_DISABLE_KEY) === "1") return true;
    const until = Number(window.localStorage.getItem(LS_DISMISS_KEY) || "0");
    if (until && Date.now() < until) return true;
  } catch { /* ignore */ }
  return false;
}
function setDismissCooldown() {
  try {
    window.localStorage.setItem(LS_DISMISS_KEY, String(Date.now() + DISMISS_COOLDOWN_MS));
  } catch { /* ignore */ }
}

// Track call — sendBeacon with fetch fallback so it never blocks.
function trackShown(userId) {
  if (!userId) return;
  try {
    const blob = new Blob([JSON.stringify({ userId })], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/social-proof/track", blob)) return;
    fetch("/api/social-proof/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* ignore */ }
}

// Build the byline. Spec asks for "Sarah from London" — first name
// only + location if present, else just the first name. The server
// resolves the location chain (community location → real-user city
// → real-user country) and hands us a single `location` string.
function bylineFor(user) {
  const firstName = (user.name || "").trim().split(/\s+/)[0] || "Someone";
  return user.location ? `${firstName} from ${user.location}` : firstName;
}

// "Just signed up" / "Just joined" — round-robin so successive
// popups read fresh.
const ACTIONS = [
  "just signed up 🎬",
  "just joined ✨",
  "started creating videos 🎥",
  "joined Seedance ✨",
];
function actionFor(index) {
  return ACTIONS[index % ACTIONS.length];
}

// Simple relative-time helper. We don't have a createdAt on the
// queue rows so fallback to a small fuzzy span ("Just now" /
// "2 min ago") chosen by index.
function timestampFor(index) {
  if (index < 2) return "Just now";
  return `${1 + Math.floor(Math.random() * 5)} min ago`;
}

// ── Component ────────────────────────────────────────────────────
export default function SocialProofPopup() {
  const pathname = usePathname();
  const [current, setCurrent] = useState(null);   // currently-rendered user (or null)
  const [exiting, setExiting] = useState(false);  // slide-out animation flag

  // Mutable bookkeeping — refs so we never re-render needlessly.
  const queueRef    = useRef([]);
  const cursorRef   = useRef(0);
  const countRef    = useRef(0);
  const timerRef    = useRef(null);
  const fetchedRef  = useRef(false);
  const mountedAtRef = useRef(0);

  const allowedHere = shouldShowOnPath(pathname);

  // Lifecycle — kick off only on allowed paths, never re-kick after
  // pathname changes mid-session.
  useEffect(() => {
    if (!allowedHere) return;
    if (typeof window === "undefined") return;
    if (isDisabled()) return;

    mountedAtRef.current = Date.now();
    const mobile  = isMobile();
    const cap     = mobile ? SESSION_CAP_MOBILE : SESSION_CAP_DESKTOP;
    const gapMin  = mobile ? GAP_MS_MIN_MOBILE : GAP_MS_MIN_DESKTOP;
    const gapMax  = mobile ? GAP_MS_MAX_MOBILE : GAP_MS_MAX_DESKTOP;

    const fetchQueue = async () => {
      if (fetchedRef.current) return queueRef.current;
      fetchedRef.current = true;
      try {
        const res = await fetch("/api/social-proof/queue", { cache: "no-store" });
        if (!res.ok) return [];
        const data = await res.json();
        const raw = Array.isArray(data.queue) ? data.queue : [];
        // Client-side localStorage filter — the second layer of
        // dedupe. Even if the IP layer let something through (mobile
        // rotation, shared IP), this device won't re-see it.
        const shown = readShownIds();
        const cleaned = raw.filter((u) => u && u.id && !shown.has(u.id));
        queueRef.current = cleaned;
        return cleaned;
      } catch { return []; }
    };

    const showNext = async () => {
      if (countRef.current >= cap) return;
      const q = queueRef.current.length > 0 ? queueRef.current : await fetchQueue();
      if (!q || q.length === 0) return;
      // Find the next un-shown one (defensive — readShownIds may have
      // updated since fetch).
      const shown = readShownIds();
      let next = null;
      while (cursorRef.current < q.length) {
        const candidate = q[cursorRef.current];
        cursorRef.current++;
        if (candidate?.id && !shown.has(candidate.id)) { next = candidate; break; }
      }
      if (!next) return;

      countRef.current++;
      // Bake the rotating copy + relative time at show-time so the
      // render path never reads countRef (React 19 forbids reading
      // refs during render).
      const enriched = {
        ...next,
        action: actionFor(countRef.current - 1),
        timeAgo: timestampFor(countRef.current - 1),
      };
      setExiting(false);
      setCurrent(enriched);
      // Record + report.
      appendShownId(next.id);
      trackShown(next.id);

      // Auto-dismiss after SHOW_DURATION_MS.
      timerRef.current = window.setTimeout(() => {
        setExiting(true);
        // Wait for slide-out animation, then schedule the next.
        window.setTimeout(() => {
          setCurrent(null);
          if (countRef.current < cap) {
            timerRef.current = window.setTimeout(showNext, rand(gapMin, gapMax));
          }
        }, 260);
      }, SHOW_DURATION_MS);
    };

    // First popup delay.
    timerRef.current = window.setTimeout(showNext, rand(FIRST_DELAY_MS_MIN, FIRST_DELAY_MS_MAX));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [allowedHere]);

  // Manual dismiss: kill timers, mark cool-down, exit.
  const handleDismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setExiting(true);
    setDismissCooldown();
    window.setTimeout(() => setCurrent(null), 260);
  };

  if (!allowedHere || !current) return null;

  const profileHref = current.username ? `/u/${current.username}` : "/";
  const initials = (current.name || "")
    .split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase() || "·";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        zIndex: 70,
        left: 16,
        right: 16,
        bottom: 16,
        maxWidth: 340,
        margin: 0,
        pointerEvents: "none",
      }}
      className="social-proof-anchor"
    >
      <a
        href={profileHref}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          textDecoration: "none",
          color: "inherit",
          pointerEvents: "auto",
          background: "rgba(20,20,24,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(217,255,0,0.30)",
          borderRadius: 14,
          padding: "12px 14px",
          boxShadow:
            "0 18px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(217,255,0,0.04)",
          fontFamily: "Inter, system-ui, sans-serif",
          transform: exiting ? "translateY(120%)" : "translateY(0)",
          opacity:   exiting ? 0 : 1,
          transition: "transform 260ms cubic-bezier(0.2,0.9,0.2,1), opacity 260ms ease-out",
        }}
      >
        {/* Avatar */}
        <div style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          flexShrink: 0,
          background: current.image
            ? `#000 url(${current.image}) center/cover no-repeat`
            : "linear-gradient(135deg, #D9FF00, #A6CC00)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#000",
          fontWeight: 800,
          fontSize: 14,
          border: "1.5px solid rgba(217,255,0,0.45)",
        }}>
          {!current.image && initials}
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 700,
            color: "#fff",
          }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {bylineFor(current)}
            </span>
            {current.verified && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#e91e8c" style={{ flexShrink: 0 }}>
                <path d="M23 12l-2.44-2.79.34-3.69-3.61-.82-1.89-3.2L12 2.96 8.6 1.5 6.71 4.69 3.1 5.5l.34 3.7L1 12l2.44 2.79-.34 3.7 3.61.82 1.89 3.2L12 21.04l3.4 1.46 1.89-3.19 3.61-.82-.34-3.69z" />
                <path d="M10 17l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9z" fill="white" />
              </svg>
            )}
          </div>
          <div style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.78)",
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {current.action}
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>
            {current.timeAgo}
          </div>
        </div>

        {/* Close */}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDismiss(); }}
          aria-label="Dismiss"
          style={{
            flexShrink: 0,
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.06)",
            border: "none",
            color: "rgba(255,255,255,0.65)",
            fontSize: 14,
            lineHeight: 1,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "auto",
          }}
        >
          ×
        </button>
      </a>

      {/* Desktop positioning: bottom-LEFT (not centred) per spec.
          On mobile we keep the full-width-bottom feel — left/right
          stay 16 px in the anchor above. */}
      <style>{`
        @media (min-width: 641px) {
          .social-proof-anchor {
            right: auto !important;
            left: 16px !important;
            max-width: 340px !important;
          }
        }
      `}</style>
    </div>
  );
}
