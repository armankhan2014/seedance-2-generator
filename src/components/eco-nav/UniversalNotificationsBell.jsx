"use client";
// Universal notifications bell for the EcosystemNav.
//
// Polls community's CORS-enabled /api/me/notifications cross-origin
// (the same shared-session-cookie pattern /api/me/credits uses).
// Renders a bell icon + unread badge; tap opens a dropdown of the
// latest 15 grouped notifications. Tap a row → cross-domain link to
// the originating surface (the API returns absolute hrefs).
//
// On community we still use the inline NotificationBell with avatar
// story rings + real-time per-route hooks. THIS bell is the lean
// sibling-subdomain variant — single fetch, no story-ring provider,
// no per-route bell-rerender hooks.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const POLL_MS = 30_000;
const BASE = "https://community.visualseffect.com";

export default function UniversalNotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(true);
  const wrapRef = useRef(null);

  // Poll. Visibility-aware. Skips when the tab is hidden.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/me/notifications`, {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        setAuthed(false);
        setUnread(0);
        setItems([]);
        return;
      }
      if (!res.ok) return;
      const j = await res.json();
      setAuthed(true);
      setItems(Array.isArray(j.notifications) ? j.notifications : []);
      setUnread(Number(j.unreadCount) || 0);
    } catch {
      /* network blip — try again next tick */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  // Click-outside / Esc to close.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Mark-read fires the first time the user OPENS the panel after a
  // new unread arrives. Cheap: skips when unread = 0.
  const markRead = useCallback(async () => {
    if (unread === 0) return;
    try {
      await fetch(`${BASE}/api/me/notifications/mark-read`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      // Optimistically zero the badge — next poll reconciles.
      setUnread(0);
      setItems((cur) => cur.map((n) => ({ ...n, read: true })));
    } catch {
      /* ignore */
    }
  }, [unread]);

  const handleOpen = () => {
    setOpen((v) => {
      const next = !v;
      if (next) markRead();
      return next;
    });
  };

  const badge = useMemo(() => {
    if (unread === 0) return null;
    return unread > 9 ? "9+" : String(unread);
  }, [unread]);

  // Don't render the bell at all when the user is signed out — the
  // strip already shows a Sign in button in that case.
  if (!authed) return null;

  return (
    <span ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={handleOpen}
        title="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: 10,
          color: "var(--text-primary, #fff)",
          position: "relative",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {badge && (
          <span
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 8,
              background: "var(--accent-mid, #D9FF00)",
              color: "#0a0a0a",
              fontSize: 9,
              fontWeight: 900,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid var(--bg-page, #0a0a0a)",
              lineHeight: 1,
            }}
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: 44,
            right: 0,
            width: 340,
            maxHeight: 460,
            background: "var(--bg-card, #111)",
            border: "1px solid var(--border-soft, #1f1f1f)",
            borderRadius: 14,
            boxShadow: "0 18px 50px -12px rgba(0,0,0,0.65)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            zIndex: 70,
            animation: "uvBellIn 180ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        >
          <style>{`
            @keyframes uvBellIn {
              from { opacity: 0; transform: translateY(-6px) scale(0.96); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid var(--border-soft, #1f1f1f)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary, #fff)" }}>
              Notifications
            </span>
            <a
              href={`${BASE}/notifications`}
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--accent-text, #D9FF00)",
                textDecoration: "none",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              See all →
            </a>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div style={emptyStyle}>Loading…</div>
            ) : items.length === 0 ? (
              <div style={emptyStyle}>
                You're all caught up.
              </div>
            ) : (
              items.map((n) => (
                <a
                  key={n.id}
                  href={n.href}
                  target={n.href.startsWith(BASE) ? "_self" : undefined}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "10px 14px",
                    textDecoration: "none",
                    background: n.read
                      ? "transparent"
                      : "color-mix(in srgb, var(--accent-mid) 6%, transparent)",
                    borderBottom: "1px solid var(--border-soft, #1f1f1f)",
                  }}
                >
                  {n.actors && n.actors[0]?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={n.actors[0].image}
                      alt=""
                      width={32}
                      height={32}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        objectFit: "cover",
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "var(--accent-soft, color-mix(in srgb, #D9FF00 12%, transparent))",
                        color: "var(--accent-text, #D9FF00)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        fontWeight: 900,
                        flexShrink: 0,
                      }}
                    >
                      🔔
                    </span>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: n.read ? 600 : 800,
                        color: "var(--text-primary, #fff)",
                        lineHeight: 1.4,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {n.text}
                    </div>
                    {n.sub && (
                      <div
                        style={{
                          fontSize: 11.5,
                          color: "var(--text-muted, #888)",
                          marginTop: 2,
                          lineHeight: 1.4,
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {n.sub}
                      </div>
                    )}
                    {n.createdAt && (
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--text-muted, #888)",
                          marginTop: 3,
                        }}
                      >
                        {relativeTime(n.createdAt)}
                      </div>
                    )}
                  </div>
                </a>
              ))
            )}
          </div>
        </div>
      )}
    </span>
  );
}

const emptyStyle = {
  color: "var(--text-muted, #888)",
  fontSize: 12.5,
  textAlign: "center",
  padding: "28px 14px",
};

function relativeTime(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
