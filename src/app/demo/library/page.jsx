"use client";
//
// DEMO — Library sidebar reorganisation for /music/studio.
//
// Three changes vs. the live sidebar:
//   1. Search box + sort dropdown at the top.
//   2. Date-grouped sections (Today / This week / Earlier).
//   3. Tighter rows — 2x2 grid of action pills instead of 1x4 stack.
//
// All 4 action pills (Split / Pro 9 / Vocals / Clean) remain visible
// per Arman's spec. Once approved, this gets ported into LibrarySidebar
// inside StudioClient.jsx and this file gets deleted.

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
  { id: "newest",  label: "Newest first"  },
  { id: "oldest",  label: "Oldest first"  },
  { id: "az",      label: "A → Z"          },
  { id: "za",      label: "Z → A"          },
  { id: "longest", label: "Longest first" },
  { id: "shortest",label: "Shortest first"},
];

function formatTime(s) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

// Group tracks into Today / This week / Earlier. Boundaries:
//   Today    = last 24h
//   This week = last 7 days (excluding Today)
//   Earlier  = everything else
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

  // Group only when sort respects time order. Other sorts present a
  // single flat list so the user's chosen order isn't fragmented.
  const grouped = useMemo(() => {
    if (sort !== "newest" && sort !== "oldest") return null;
    const buckets = { "Today": [], "This week": [], "Earlier": [] };
    for (const t of filtered) buckets[bucketTrack(t.createdAt)].push(t);
    return buckets;
  }, [filtered, sort]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 16, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: C.accent, marginBottom: 6 }}>
        Demo · Library sidebar reorg
      </h1>
      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.55, maxWidth: 640, marginBottom: 18 }}>
        Search + sort at the top, date-grouped sections, tighter rows with a 2x2 pill grid.
        All 4 actions stay visible. Mock data — once you approve the look, I&rsquo;ll port this
        into the real <code style={{ background: C.panelSoft, padding: "1px 5px", borderRadius: 4 }}>LibrarySidebar</code>
        in <code style={{ background: C.panelSoft, padding: "1px 5px", borderRadius: 4 }}>StudioClient.jsx</code> and delete this page.
      </p>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        {/* Left: the new sidebar. */}
        <LibrarySidebar
          tracks={filtered}
          grouped={grouped}
          query={query}
          setQuery={setQuery}
          sort={sort}
          setSort={setSort}
        />

        {/* Right: side-by-side reference of what the live one looks like today. */}
        <div style={{ flex: 1, fontSize: 12, color: C.textSoft, lineHeight: 1.6 }}>
          <div style={{ fontSize: 11, color: C.accent, letterSpacing: "0.16em", fontWeight: 800, textTransform: "uppercase", marginBottom: 8 }}>
            What&rsquo;s new
          </div>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li>Sticky <strong>search</strong> filters title, genre, mood.</li>
            <li>Sort dropdown: newest / oldest / A-Z / Z-A / longest / shortest.</li>
            <li>Sections: <em>Today</em> · <em>This week</em> · <em>Earlier</em> (only shown for time-based sorts).</li>
            <li>Action pills go from a vertical 1x4 stack to a <strong>2x2 grid</strong> — row height ~halved.</li>
            <li>Drag-handle indicator <code>⋮⋮</code> on hover so the drag affordance is obvious.</li>
            <li>Empty state inside a section reads &ldquo;Nothing here&rdquo; (vs. silent blank).</li>
          </ul>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 14, lineHeight: 1.5 }}>
            Try the search and sort live ↑. Hover a row to see the drag handle. Action pills are click-stubbed
            (no-op) in the demo.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── The new library sidebar component ────────────────────────────
function LibrarySidebar({ tracks, grouped, query, setQuery, sort, setSort }) {
  return (
    <aside
      style={{
        width: 280,
        flexShrink: 0,
        height: "calc(100vh - 100px)",
        borderRight: `1px solid ${C.border}`,
        background: C.panel,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        borderRadius: 6,
      }}
    >
      {/* Sticky header: title + search + sort */}
      <div
        style={{
          padding: "12px 14px 10px",
          borderBottom: `1px solid ${C.border}`,
          position: "sticky",
          top: 0,
          background: C.panel,
          zIndex: 2,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: C.accent, letterSpacing: "0.16em", fontWeight: 800, textTransform: "uppercase" }}>
            Your library
          </div>
          <div style={{ fontSize: 10, color: C.muted }}>{tracks.length} track{tracks.length === 1 ? "" : "s"}</div>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 6 }}>
          <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.muted, pointerEvents: "none" }}>🔍</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, genre, mood…"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "6px 8px 6px 26px",
              fontSize: 11.5,
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

        {/* Sort */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            style={{
              flex: 1,
              padding: "4px 6px",
              fontSize: 11,
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

      {/* Track list */}
      {tracks.length === 0 && (
        <div style={{ padding: 18, fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
          No tracks match &ldquo;<span style={{ color: C.textSoft }}>{query}</span>&rdquo;.
        </div>
      )}
      {tracks.length > 0 && !grouped && tracks.map((t) => <TrackRow key={t.id} t={t} />)}
      {tracks.length > 0 && grouped && (
        <>
          {(["Today", "This week", "Earlier"]).map((bucket) => (
            <Section key={bucket} title={bucket} count={grouped[bucket].length}>
              {grouped[bucket].length === 0
                ? <div style={{ padding: "8px 14px", fontSize: 10.5, color: C.muted, fontStyle: "italic" }}>Nothing here.</div>
                : grouped[bucket].map((t) => <TrackRow key={t.id} t={t} />)
              }
            </Section>
          ))}
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
          padding: "8px 14px 4px",
          fontSize: 9.5,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: C.muted,
          background: C.panel,
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>{title}</span>
        <span style={{ fontSize: 9, color: C.muted, fontWeight: 600 }}>{count}</span>
      </div>
      {children}
    </div>
  );
}

function TrackRow({ t }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        padding: "7px 10px 7px 14px",
        borderBottom: `1px solid ${C.border}`,
        cursor: "grab",
        userSelect: "none",
        transition: "background 0.12s",
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        background: hover ? C.panelSoft : "transparent",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Drag onto a lane, or tap to load into the next empty lane"
    >
      {/* Drag handle — visible on hover only, keeps row clean by default */}
      <div
        style={{
          fontSize: 11,
          color: hover ? C.muted : "transparent",
          paddingTop: 2,
          transition: "color 0.12s",
          flexShrink: 0,
          fontFamily: "monospace",
          letterSpacing: "-2px",
        }}
      >
        ⋮⋮
      </div>

      {/* Title + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            color: C.text,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {t.title}
        </div>
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 1 }}>
          {(t.genre || "—")}{t.mood ? ` · ${t.mood}` : ""}{t.tempo ? ` · ${t.tempo} BPM` : ""}
          {t.actualDuration ? ` · ${formatTime(t.actualDuration)}` : ""}
        </div>
      </div>

      {/* 2x2 action pill grid — half the vertical bulk of the live 1x4 stack */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto auto",
          gap: 3,
          flexShrink: 0,
        }}
      >
        <ActionPill label="🔬"  cost={30} title="Split into 6 stems"                       color="#D9FF00" borderColor="rgba(217,255,0,0.40)" />
        <ActionPill label="🔬+" cost={50} title="Pro 9-stem (adds synth / strings / wind)"  color="#fbbf24" borderColor="rgba(251,191,36,0.45)" />
        <ActionPill label="🎤"  cost={10} title="Split lead vs backing vocals"              color="#c4b5fd" borderColor="rgba(196,181,253,0.55)" />
        <ActionPill label="🧹"  cost={6}  title="Strip background noise from vocals"        color="#93c5fd" borderColor="rgba(96,165,250,0.50)" />
      </div>
    </div>
  );
}

// Compact icon-only pill — wider tooltips carry the full description.
// The cost is on a second line so we keep the pill near-square in the
// 2x2 grid. Hover surfaces full title text via the native tooltip.
function ActionPill({ label, cost, title, color, borderColor }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); }}
      title={`${title} · ${cost} credits`}
      style={{
        padding: "3px 6px",
        borderRadius: 8,
        background: "transparent",
        border: `1px solid ${borderColor}`,
        color,
        fontSize: 11,
        fontWeight: 800,
        cursor: "pointer",
        fontFamily: "inherit",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        lineHeight: 1,
        minWidth: 30,
      }}
    >
      <span style={{ fontSize: 12 }}>{label}</span>
      <span style={{ fontSize: 8.5, fontWeight: 600, opacity: 0.7, marginTop: 1, letterSpacing: 0 }}>{cost}c</span>
    </button>
  );
}
