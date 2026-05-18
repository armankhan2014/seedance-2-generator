"use client";
//
// DEMO — Library sidebar reorganisation for /music/studio.
//
// v2 (Arman flagged v1 as still cluttered). Now: hover-reveal action
// pills, single-line meta with truncation, fixed row height, denser
// section dividers. Default row is just title + meta — clean. Pills
// fade in on hover so the row stays calm at rest.
//
// All 4 actions (Split / Pro 9 / Vocals / Clean) remain available
// per Arman's spec — they're just hidden until intent (hover) is
// shown. Cost moves into the native tooltip.
//
// Once approved, this gets ported into LibrarySidebar inside
// StudioClient.jsx and this file gets deleted.

import { useMemo, useState } from "react";

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
};

// ── Mock library data — covers all 3 date buckets + varied genres ──
const MOCK_TRACKS = [
  { id: "t01", title: "Midnight Run",                 genre: "synthwave",   mood: "driving",    tempo: 128, actualDuration: 184, createdAt: hoursAgo(2) },
  { id: "t02", title: "Vapor Cathedral",              genre: "ambient",     mood: "ethereal",   tempo: 70,  actualDuration: 245, createdAt: hoursAgo(5) },
  { id: "t03", title: "Glow",                         genre: "pop",         mood: "uplifting",  tempo: 118, actualDuration: 198, createdAt: hoursAgo(20) },
  { id: "t04", title: "Heartline (alt mix)",          genre: "indie pop",   mood: "wistful",    tempo: 92,  actualDuration: 211, createdAt: daysAgo(2) },
  { id: "t05", title: "Tundra Pulse",                 genre: "deep house",  mood: "hypnotic",   tempo: 122, actualDuration: 312, createdAt: daysAgo(3) },
  { id: "t06", title: "Lemon Sky",                    genre: "indie",       mood: "summer",     tempo: 110, actualDuration: 176, createdAt: daysAgo(5) },
  { id: "t07", title: "Last Caller",                  genre: "lo-fi",       mood: "nocturnal",  tempo: 86,  actualDuration: 162, createdAt: daysAgo(12) },
  { id: "t08", title: "Citrus Drive",                 genre: "synth pop",   mood: "playful",    tempo: 124, actualDuration: 205, createdAt: daysAgo(21) },
  { id: "t09", title: "Sandlot Hymn",                 genre: "folk",        mood: "warm",       tempo: 96,  actualDuration: 235, createdAt: daysAgo(45) },
];

function hoursAgo(h) { return new Date(Date.now() - h * 3600_000).toISOString(); }
function daysAgo(d)  { return new Date(Date.now() - d * 86400_000).toISOString(); }

const SORT_OPTIONS = [
  { id: "newest",   label: "Newest first"  },
  { id: "oldest",   label: "Oldest first"  },
  { id: "az",       label: "A → Z"         },
  { id: "za",       label: "Z → A"         },
  { id: "longest",  label: "Longest first" },
  { id: "shortest", label: "Shortest first"},
];

function formatTime(s) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

function bucketTrack(iso) {
  const ageHr = (Date.now() - new Date(iso).getTime()) / 3600_000;
  if (ageHr < 24)   return "Today";
  if (ageHr < 24*7) return "This week";
  return "Earlier";
}

export default function LibraryDemoPage() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = MOCK_TRACKS;
    if (q) {
      out = out.filter((t) =>
        t.title.toLowerCase().includes(q)
        || (t.genre || "").toLowerCase().includes(q)
        || (t.mood  || "").toLowerCase().includes(q)
      );
    }
    const sorted = [...out];
    switch (sort) {
      case "newest":   sorted.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)); break;
      case "oldest":   sorted.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt)); break;
      case "az":       sorted.sort((a,b) => a.title.localeCompare(b.title)); break;
      case "za":       sorted.sort((a,b) => b.title.localeCompare(a.title)); break;
      case "longest":  sorted.sort((a,b) => (b.actualDuration||0) - (a.actualDuration||0)); break;
      case "shortest": sorted.sort((a,b) => (a.actualDuration||0) - (b.actualDuration||0)); break;
    }
    return sorted;
  }, [query, sort]);

  const grouped = useMemo(() => {
    if (sort !== "newest" && sort !== "oldest") return null;
    const buckets = { "Today": [], "This week": [], "Earlier": [] };
    for (const t of filtered) buckets[bucketTrack(t.createdAt)].push(t);
    return buckets;
  }, [filtered, sort]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 16, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: C.accent, marginBottom: 6 }}>
        Demo · Library sidebar (v2)
      </h1>
      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.55, maxWidth: 640, marginBottom: 18 }}>
        Each row is now just title + meta. <strong style={{ color: C.textSoft }}>Hover a row</strong>
        {" "}to reveal the 4 action pills. Cost moved into tooltip. Search + sort sticky at top.
        Date-group dividers stay subtle.
      </p>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <LibrarySidebar
          tracks={filtered}
          grouped={grouped}
          query={query}
          setQuery={setQuery}
          sort={sort}
          setSort={setSort}
        />

        <div style={{ flex: 1, fontSize: 12, color: C.textSoft, lineHeight: 1.6, maxWidth: 480 }}>
          <div style={{ fontSize: 11, color: C.accent, letterSpacing: "0.16em", fontWeight: 800, textTransform: "uppercase", marginBottom: 8 }}>
            What changed vs. v1
          </div>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li>Action pills are <strong>hidden by default</strong> — only show on row hover. Row stays calm.</li>
            <li>Single-line meta with ellipsis truncation; row height is fixed at ~46px.</li>
            <li>Cost lives in the tooltip, not on the pill — pill is icon-only.</li>
            <li>Search + sort are sticky and use the same monochrome treatment as the rest of Studio.</li>
            <li>Section dividers are 1px thin rules with a small uppercase label.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function LibrarySidebar({ tracks, grouped, query, setQuery, sort, setSort }) {
  return (
    <aside
      style={{
        width: 300,
        flexShrink: 0,
        height: "calc(100vh - 100px)",
        borderRight: `1px solid ${C.border}`,
        background: C.panel,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        borderRadius: 8,
      }}
    >
      {/* Sticky header */}
      <div
        style={{
          padding: "14px 14px 10px",
          borderBottom: `1px solid ${C.border}`,
          position: "sticky",
          top: 0,
          background: C.panel,
          zIndex: 2,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: C.accent, letterSpacing: "0.16em", fontWeight: 800, textTransform: "uppercase" }}>
            Your library
          </div>
          <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>
            {tracks.length} track{tracks.length === 1 ? "" : "s"}
          </div>
        </div>

        <div style={{ position: "relative", marginBottom: 8 }}>
          <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.muted, pointerEvents: "none" }}>🔍</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, genre, mood…"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "7px 8px 7px 28px",
              fontSize: 12,
              background: C.panelSoft,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              color: C.text,
              outline: "none",
              fontFamily: "inherit",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = C.borderHover)}
            onBlur={(e) => (e.currentTarget.style.borderColor = C.border)}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 9.5, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 }}>Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            style={{
              flex: 1,
              padding: "4px 6px",
              fontSize: 11.5,
              background: C.panelSoft,
              border: `1px solid ${C.border}`,
              borderRadius: 5,
              color: C.text,
              fontFamily: "inherit",
              outline: "none",
              cursor: "pointer",
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {tracks.length === 0 && (
        <div style={{ padding: 20, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
          No tracks match &ldquo;<span style={{ color: C.textSoft }}>{query}</span>&rdquo;.
        </div>
      )}

      {tracks.length > 0 && !grouped && tracks.map((t) => <TrackRow key={t.id} t={t} />)}

      {tracks.length > 0 && grouped && (
        <>
          {(["Today", "This week", "Earlier"]).map((bucket) => {
            const rows = grouped[bucket];
            if (rows.length === 0) return null; // hide empty sections entirely
            return (
              <Section key={bucket} title={bucket} count={rows.length}>
                {rows.map((t) => <TrackRow key={t.id} t={t} />)}
              </Section>
            );
          })}
        </>
      )}
    </aside>
  );
}

function Section({ title, count, children }) {
  return (
    <div>
      <div
        style={{
          padding: "10px 14px 5px",
          fontSize: 9.5,
          fontWeight: 800,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: C.muted,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>{title}</span>
        <span style={{ fontSize: 9, color: C.muted, fontWeight: 600, opacity: 0.7 }}>{count}</span>
      </div>
      {children}
    </div>
  );
}

// One library row. Fixed-height. Hover reveals action pills.
function TrackRow({ t }) {
  const [hover, setHover] = useState(false);
  // Single-line meta string. Genre + (BPM) + (duration).
  const meta = [
    t.genre || "—",
    t.tempo ? `${t.tempo} BPM` : null,
    t.actualDuration ? formatTime(t.actualDuration) : null,
  ].filter(Boolean).join(" · ");

  return (
    <div
      style={{
        position: "relative",
        height: 46,
        padding: "0 12px 0 14px",
        borderBottom: `1px solid ${C.border}`,
        cursor: "grab",
        userSelect: "none",
        transition: "background 0.12s",
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: hover ? C.panelSoft : "transparent",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Drag onto a lane, or tap to load into the next empty lane"
    >
      {/* Title + meta — left side, claims the row */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: C.text,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            lineHeight: 1.2,
          }}
        >
          {t.title}
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: C.muted,
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            lineHeight: 1.2,
          }}
        >
          {meta}
        </div>
      </div>

      {/* Action pills — fade in on hover. The right edge gets a subtle
          gradient mask so long titles don't visibly slam into the pills. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          flexShrink: 0,
          opacity: hover ? 1 : 0,
          pointerEvents: hover ? "auto" : "none",
          transition: "opacity 0.14s",
          // Subtle paint behind the pills to ensure legibility even
          // if the title is long and overflows visually.
          background: hover ? `linear-gradient(to right, transparent 0, ${C.panelSoft} 12px)` : "transparent",
          paddingLeft: 12,
        }}
      >
        <IconPill icon="🔬"  cost={30} title="Split into 6 stems"                       color="#D9FF00" borderColor="rgba(217,255,0,0.40)" />
        <IconPill icon="🔬+" cost={50} title="Pro 9-stem (adds synth / strings / wind)"  color="#fbbf24" borderColor="rgba(251,191,36,0.45)" />
        <IconPill icon="🎤"  cost={10} title="Split lead vs backing vocals"              color="#c4b5fd" borderColor="rgba(196,181,253,0.55)" />
        <IconPill icon="🧹"  cost={6}  title="Strip background noise from vocals"        color="#93c5fd" borderColor="rgba(96,165,250,0.50)" />
      </div>
    </div>
  );
}

// Compact circular icon button. Cost lives in the tooltip.
function IconPill({ icon, cost, title, color, borderColor }) {
  const [h, setH] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); }}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      title={`${title} · ${cost} credits`}
      style={{
        width: 26,
        height: 26,
        borderRadius: 999,
        background: h ? `${color}1a` : "transparent",  // 1a = 10% alpha
        border: `1px solid ${borderColor}`,
        color,
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        lineHeight: 1,
        transition: "background 0.1s",
      }}
    >
      {icon}
    </button>
  );
}
