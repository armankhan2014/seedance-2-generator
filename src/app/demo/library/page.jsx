"use client";
//
// DEMO — Library sidebar reorganisation for /music/studio.
//
// v3 — every action pill self-explains. Each row shows title, meta,
// and a single horizontal strip of 4 LABELED pills: icon + short
// word + credit cost. Always visible (no hover guessing). Fixed
// row height ~62px.
//
// Trade-off: wider sidebar (310px vs current 260px) to fit the four
// labeled pills inline below the meta. Worth it for readability.
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

// The 4 stem/voice actions for each library track. Defined once so
// every row stays identical + descriptions live in one place. Each
// pill self-explains: icon + word + cost. Tooltip carries the full
// sentence for clarity. `key` matches the existing splitStems /
// splitVocals / cleanVoice handlers in StudioClient.jsx.
const ACTIONS = [
  { key: "split6",   icon: "🔬",  word: "Split",  cost: 30, color: "#D9FF00", border: "rgba(217,255,0,0.40)",  desc: "Split into 6 stems (vocals / drum / bass / piano / electric guitar / acoustic guitar)" },
  { key: "split9",   icon: "🔬+", word: "Pro 9",  cost: 50, color: "#fbbf24", border: "rgba(251,191,36,0.45)", desc: "Pro 9-stem split — adds synthesizer / strings / wind" },
  { key: "vocals",   icon: "🎤",  word: "Vocals", cost: 10, color: "#c4b5fd", border: "rgba(196,181,253,0.55)", desc: "Split vocal into lead + backing harmonies" },
  { key: "clean",    icon: "🧹",  word: "Clean",  cost: 6,  color: "#93c5fd", border: "rgba(96,165,250,0.50)",  desc: "Strip background noise from the vocal" },
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
        Demo · Library sidebar (v3)
      </h1>
      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.55, maxWidth: 640, marginBottom: 18 }}>
        Every pill now reads its own name and credit cost. No more guessing what 🔬 means.
        Sidebar widened to 310&nbsp;px so the four labeled pills fit on one line below each track.
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
            What each pill does
          </div>
          <ul style={{ paddingLeft: 18, margin: 0, fontSize: 12 }}>
            {ACTIONS.map((a) => (
              <li key={a.key} style={{ marginBottom: 4 }}>
                <span style={{ color: a.color, fontWeight: 700 }}>{a.icon} {a.word}</span>
                <span style={{ color: C.muted }}> — {a.cost} credits — </span>
                <span style={{ color: C.textSoft }}>{a.desc}</span>
              </li>
            ))}
          </ul>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 14, lineHeight: 1.5 }}>
            Drag a row onto a lane, or tap to load into the next empty lane. Search filters title /
            genre / mood. Sort newest / oldest preserves date-section headers; other sorts present a
            single flat list.
          </div>
        </div>
      </div>
    </div>
  );
}

function LibrarySidebar({ tracks, grouped, query, setQuery, sort, setSort }) {
  return (
    <aside
      style={{
        width: 310,
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
            if (rows.length === 0) return null;
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

function TrackRow({ t }) {
  const [hover, setHover] = useState(false);
  const meta = [
    t.genre || "—",
    t.tempo ? `${t.tempo} BPM` : null,
    t.actualDuration ? formatTime(t.actualDuration) : null,
  ].filter(Boolean).join(" · ");

  return (
    <div
      style={{
        padding: "8px 12px 8px 14px",
        borderBottom: `1px solid ${C.border}`,
        cursor: "grab",
        userSelect: "none",
        transition: "background 0.12s",
        background: hover ? C.panelSoft : "transparent",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Drag onto a lane, or tap to load into the next empty lane"
    >
      {/* Title */}
      <div
        style={{
          fontSize: 12.5,
          fontWeight: 700,
          color: C.text,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          lineHeight: 1.25,
        }}
      >
        {t.title}
      </div>

      {/* Meta */}
      <div
        style={{
          fontSize: 10.5,
          color: C.muted,
          marginTop: 2,
          marginBottom: 6,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          lineHeight: 1.2,
        }}
      >
        {meta}
      </div>

      {/* Action pills — always visible, labeled, single row */}
      <div style={{ display: "flex", gap: 4 }}>
        {ACTIONS.map((a) => (
          <LabeledPill key={a.key} icon={a.icon} word={a.word} cost={a.cost} title={a.desc} color={a.color} borderColor={a.border} />
        ))}
      </div>
    </div>
  );
}

// A self-explaining pill: icon + word + cost number. Tooltip carries
// the full sentence. The pill is wide enough that its purpose is
// obvious at a glance — no need to hover for a tooltip just to
// learn what 🔬 means.
function LabeledPill({ icon, word, cost, title, color, borderColor }) {
  const [h, setH] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); }}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      title={`${title} · ${cost} credits`}
      style={{
        flex: 1,
        minWidth: 0,
        padding: "4px 6px",
        borderRadius: 999,
        background: h ? `${color}1a` : "transparent",
        border: `1px solid ${borderColor}`,
        color,
        fontSize: 10,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        whiteSpace: "nowrap",
        transition: "background 0.1s",
      }}
    >
      <span style={{ fontSize: 11 }}>{icon}</span>
      <span style={{ letterSpacing: "0.02em" }}>{word}</span>
      <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.7 }}>{cost}</span>
    </button>
  );
}
