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
// Tightened first-popup delay on 2026-06-06 (was 5-10 s) so visitors
// who land directly on /pricing or /u/[handle] see the social proof
// before they bounce. Subsequent gap stays unchanged.
const FIRST_DELAY_MS_MIN = 3_000;
const FIRST_DELAY_MS_MAX = 7_000;
const GAP_MS_MIN_DESKTOP = 30_000;
const GAP_MS_MAX_DESKTOP = 60_000;
const GAP_MS_MIN_MOBILE  = 60_000;
const GAP_MS_MAX_MOBILE  = 90_000;
const SHOW_DURATION_DESKTOP_MS = 6_000;
const SHOW_DURATION_MOBILE_MS  = 5_000;   // a beat shorter — mobile attention is fast
const SESSION_CAP_DESKTOP = 10;
const SESSION_CAP_MOBILE  = 8;
const DISMISS_COOLDOWN_MS = 30 * 60_000;       // 30 min after manual ×
// Phone polish:
//   • Don't spawn a popup while the user is mid-scroll — would feel
//     like the page is fighting them. SCROLL_PAUSE_MS is how long we
//     wait after the last scroll event before resuming the timer.
//   • Swipe-down threshold for touch-dismiss: 50 px of downward
//     finger travel triggers the slide-out animation.
const SCROLL_PAUSE_MS    = 800;
const SWIPE_DISMISS_PX   = 50;

// localStorage keys
const LS_SHOWN_KEY      = "seedance_shown_popup_users";
const LS_DISABLE_KEY    = "seedance_disable_social_proof";
const LS_DISMISS_KEY    = "seedance_social_proof_dismissed_until";

// Routes where the popup makes sense. Two match styles:
//   • EXACT paths     — match the pathname verbatim
//   • PREFIX patterns — match any path that starts with the prefix
//                       (lets us cover /u/<any-handle> with one entry)
//
// Skip everything not in either list — admin, API, profile editor,
// settings, the generation/edits/music studios where the user is
// mid-task and a popup would feel intrusive.
const ALLOWED_PATHS = new Set([
  "/",
  "/pricing",
  "/gallery",
  "/creations",
  "/privacy",
  "/terms",
]);
const ALLOWED_PREFIXES = [
  "/u/",  // public profile pages — social proof reads natural here
];
function shouldShowOnPath(pathname) {
  if (!pathname) return false;
  if (ALLOWED_PATHS.has(pathname)) return true;
  return ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
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
  return beacon("/api/social-proof/track", userId);
}
// Phase 2 — when the visitor clicks the popup, mark the row as
// clicked so the admin dashboard can compute CTR.
function trackClicked(userId) {
  return beacon("/api/social-proof/click", userId);
}
function beacon(url, userId) {
  if (!userId) return;
  try {
    const blob = new Blob([JSON.stringify({ userId })], { type: "application/json" });
    if (navigator.sendBeacon?.(url, blob)) return;
    fetch(url, {
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
  // Phone polish — track swipe-down progress so we can pull the
  // popup down with the finger before committing to a dismiss.
  const [touchDeltaY, setTouchDeltaY] = useState(0);
  // Live mobile flag — drives the inline `bottom` value so we can
  // skip the CSS @media cascade entirely. The @media rule in the
  // style block below stays as a defence-in-depth fallback for
  // browsers where matchMedia is gated.
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => setMobile(mq.matches);
    sync();
    if (mq.addEventListener) mq.addEventListener("change", sync);
    else mq.addListener?.(sync);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", sync);
      else mq.removeListener?.(sync);
    };
  }, []);

  // Mutable bookkeeping — refs so we never re-render needlessly.
  const queueRef    = useRef([]);
  const cursorRef   = useRef(0);
  const countRef    = useRef(0);
  const timerRef    = useRef(null);
  const fetchedRef  = useRef(false);
  const mountedAtRef = useRef(0);
  // Mobile: defer popup spawning while the user is mid-scroll.
  const lastScrollAtRef = useRef(0);
  // Mobile: touch-tracking for swipe-to-dismiss.
  const touchStartYRef = useRef(null);

  const allowedHere = shouldShowOnPath(pathname);

  // Lifecycle — kick off only on allowed paths, never re-kick after
  // pathname changes mid-session.
  useEffect(() => {
    if (!allowedHere) return;
    if (typeof window === "undefined") return;
    if (isDisabled()) return;

    mountedAtRef.current = Date.now();
    const mobile     = isMobile();
    const cap        = mobile ? SESSION_CAP_MOBILE : SESSION_CAP_DESKTOP;
    const gapMin     = mobile ? GAP_MS_MIN_MOBILE : GAP_MS_MIN_DESKTOP;
    const gapMax     = mobile ? GAP_MS_MAX_MOBILE : GAP_MS_MAX_DESKTOP;
    const duration   = mobile ? SHOW_DURATION_MOBILE_MS : SHOW_DURATION_DESKTOP_MS;

    // Mobile: track scroll activity so we can hold popups while the
    // user is actively scrolling — popping in mid-swipe feels like
    // the page is fighting them.
    const onScroll = () => { lastScrollAtRef.current = Date.now(); };
    if (mobile) window.addEventListener("scroll", onScroll, { passive: true });

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
      // Phone: defer if user is mid-scroll. Re-check every 250 ms
      // until they pause for at least SCROLL_PAUSE_MS, then proceed.
      if (mobile) {
        const sinceScroll = Date.now() - lastScrollAtRef.current;
        if (sinceScroll < SCROLL_PAUSE_MS) {
          timerRef.current = window.setTimeout(showNext, 250);
          return;
        }
      }
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

      // Auto-dismiss after the device-appropriate duration.
      timerRef.current = window.setTimeout(() => {
        setExiting(true);
        // Wait for slide-out animation, then schedule the next.
        window.setTimeout(() => {
          setCurrent(null);
          setTouchDeltaY(0);
          if (countRef.current < cap) {
            timerRef.current = window.setTimeout(showNext, rand(gapMin, gapMax));
          }
        }, 260);
      }, duration);
    };

    // First popup delay.
    timerRef.current = window.setTimeout(showNext, rand(FIRST_DELAY_MS_MIN, FIRST_DELAY_MS_MAX));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (mobile) window.removeEventListener("scroll", onScroll);
    };
  }, [allowedHere]);

  // Manual dismiss: kill timers, mark cool-down, exit.
  const handleDismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setExiting(true);
    setDismissCooldown();
    window.setTimeout(() => { setCurrent(null); setTouchDeltaY(0); }, 260);
  };

  // ── Touch handlers — swipe DOWN to dismiss on phone ────────────
  // The popup sits at the bottom of the viewport on phone, so the
  // most natural dismiss gesture is a downward swipe (Tinder /
  // banking app pattern). Tracks finger Y delta; commits the
  // dismiss once the user clears SWIPE_DISMISS_PX.
  const onTouchStart = (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    touchStartYRef.current = t.clientY;
  };
  const onTouchMove = (e) => {
    const startY = touchStartYRef.current;
    if (startY == null) return;
    const t = e.touches?.[0];
    if (!t) return;
    const dy = Math.max(0, t.clientY - startY); // only track downward
    setTouchDeltaY(dy);
  };
  const onTouchEnd = () => {
    if (touchStartYRef.current == null) return;
    const dy = touchDeltaY;
    touchStartYRef.current = null;
    if (dy >= SWIPE_DISMISS_PX) {
      handleDismiss();
    } else {
      // Not enough — spring back to rest.
      setTouchDeltaY(0);
    }
  };

  if (!allowedHere || !current) return null;

  const profileHref = current.username ? `/u/${current.username}` : "/";
  const initials = (current.name || "")
    .split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase() || "·";

  // Live translate Y — combines the slide-out animation flag with
  // the in-progress swipe-down delta so the popup follows the
  // finger before either committing to dismiss or springing back.
  // Opacity fades proportionally to the swipe so the affordance is
  // visible without surprising the user with a sudden vanish.
  const swipeY = exiting ? 120 : touchDeltaY;
  const swipeOpacity = exiting
    ? 0
    : Math.max(0, 1 - touchDeltaY / 160);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        // Above the MobileBottomNav (which is z-index ~50 with
        // safe-area padding). Bump up the popup so it sits over
        // anything else in the corner.
        zIndex: 90,
        left: 16,
        right: 16,
        // Mobile: clear the bottom nav + iPhone home indicator.
        // 84 px = MobileBottomNav (~70 px) + small breathing gap;
        // env() adds the home-indicator inset on iPhone X+.
        // Desktop: 16 px from the bottom-left corner.
        bottom: mobile
          ? "calc(env(safe-area-inset-bottom, 0px) + 84px)"
          : 16,
        maxWidth: 340,
        margin: 0,
        pointerEvents: "none",
      }}
      className="social-proof-anchor"
    >
      <a
        href={profileHref}
        onClick={() => trackClicked(current.id)}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
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
          transform: `translateY(${swipeY === 120 ? "120%" : `${swipeY}px`})`,
          opacity:   swipeOpacity,
          // Only animate when committing to a state (exiting / open) —
          // mid-swipe we want 1:1 finger tracking, no easing lag.
          transition: touchDeltaY > 0
            ? "none"
            : "transform 260ms cubic-bezier(0.2,0.9,0.2,1), opacity 260ms ease-out",
          // Prevent the browser from interpreting the vertical swipe
          // as a page scroll — we want it to dismiss the popup.
          touchAction: "pan-y",
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

        {/* Close — sized to iOS HIG-friendly 36×36 hit area
            (the visible × stays small but the touch target is
            comfortable). The +grip dot row above the avatar is the
            implicit swipe-down affordance on phone. */}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDismiss(); }}
          aria-label="Dismiss"
          style={{
            flexShrink: 0,
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.06)",
            border: "none",
            color: "rgba(255,255,255,0.75)",
            fontSize: 18,
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

      {/* Two-mode position:
            • Desktop (>=641px) — bottom-LEFT per spec, 16 px anchor
            • Mobile (<641px)   — full-width bottom, lifted above the
              MobileBottomNav (which is ~70 px tall + safe-area-inset)
              so the popup never overlaps the navigation pills */}
      <style>{`
        @media (max-width: 640px) {
          .social-proof-anchor {
            bottom: calc(env(safe-area-inset-bottom, 0px) + 84px) !important;
          }
        }
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
