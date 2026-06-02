"use client";

import { useMemo, useState, useEffect } from "react";

/**
 * SignupsDashboard
 *
 * Demo client component for /demo/admin-signups. All filtering +
 * sorting is client-side over the rows the server pre-fetched
 * (already capped at 200 newest-first so the bundle isn't huge).
 *
 * Brand lime #d9ff00 for active states. Dark theme by default,
 * matches the existing /admin look.
 *
 * Auto-refresh: polls window.location.reload() every 60 seconds —
 * cheap version of the "live counter". The real port to /admin
 * will probably use a WebSocket or SWR, but for the demo this
 * keeps the slice small.
 */

const BRAND = "#d9ff00";
const BRAND_INK = "#0a0a0a";

export default function SignupsDashboard({
  todayCount, yesterdayCount, weekCount, monthCount,
  rows, topCountries, topSources,
}) {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("time"); // time | location | source
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  // Auto-refresh every 60s — full page reload keeps the slice small.
  useEffect(() => {
    const id = setInterval(() => window.location.reload(), 60_000);
    return () => clearInterval(id);
  }, []);

  // Build filter dropdown options from the actual rows so we don't
  // show countries/sources that aren't present today.
  const countryOptions = useMemo(() => {
    const set = new Set();
    for (const r of rows) if (r.country) set.add(r.country);
    return ["all", ...Array.from(set).sort()];
  }, [rows]);
  const sourceOptions = useMemo(() => {
    const set = new Set();
    for (const r of rows) set.add(r.signupSource);
    return ["all", ...Array.from(set).sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (verifiedOnly && !r.verified) return false;
      if (sourceFilter !== "all" && r.signupSource !== sourceFilter) return false;
      if (countryFilter !== "all" && r.country !== countryFilter) return false;
      if (!q) return true;
      const hay = [r.name, r.email, r.city, r.country, r.signupSource].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
    if (sortBy === "location") {
      out = out.slice().sort((a, b) => (a.country || "zz").localeCompare(b.country || "zz") || (a.city || "").localeCompare(b.city || ""));
    } else if (sortBy === "source") {
      out = out.slice().sort((a, b) => (a.signupSource || "").localeCompare(b.signupSource || ""));
    }
    // default sort is already newest-first from the server
    return out;
  }, [rows, query, sourceFilter, countryFilter, sortBy, verifiedOnly]);

  // ── Insights strip ────────────────────────────────────────────────
  // Diff vs yesterday
  const diff = todayCount - yesterdayCount;
  const diffPct = yesterdayCount > 0 ? Math.round((diff / yesterdayCount) * 100) : null;
  const diffArrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "•";
  const diffColor = diff > 0 ? BRAND : diff < 0 ? "#ff6b6b" : "#888";
  const topSourceLine = topSources[0]
    ? `${topSources[0].source} (${topSources[0].count} this week)`
    : "no source data yet";
  const topCountryLine = topCountries[0]
    ? `${topCountries[0].flag} ${topCountries[0].country} (${topCountries[0].count})`
    : "no country data yet";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#f5f5f5",
        padding: "32px 24px 80px",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Demo banner */}
        <div
          style={{
            fontSize: 10, fontWeight: 800, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "#888", marginBottom: 6,
          }}
        >
          /demo/admin-signups · staging preview · Arman-only
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 4px" }}>Daily signups</h1>
        <p style={{ color: "#888", fontSize: 13, margin: "0 0 22px" }}>
          Live tracker for new users on seedance.visualseffect.com. Auto-refresh every 60 s.
        </p>

        {/* ── Big numbers row ────────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12, marginBottom: 18,
          }}
        >
          <StatCard label="Today" value={todayCount}
            sub={diffPct === null
              ? `${diffArrow} ${diff}`
              : `${diffArrow} ${diff} (${diffPct}%) vs yesterday`}
            subColor={diffColor} />
          <StatCard label="Yesterday" value={yesterdayCount} sub="0:00–23:59 prev day" />
          <StatCard label="This week" value={weekCount} sub="last 7 days" />
          <StatCard label="This month" value={monthCount} sub="last 30 days" />
        </div>

        {/* ── Insights strip ───────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 10, marginBottom: 22,
          }}
        >
          <Insight label="Top source this week" value={topSourceLine} />
          <Insight label="Top country this week" value={topCountryLine} />
          <Insight label="Today’s rows shown" value={`${filtered.length} of ${rows.length}`} />
        </div>

        {/* ── Filters bar ──────────────────────────────────────────── */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
          padding: 12, marginBottom: 10,
          border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
          background: "rgba(255,255,255,0.02)",
        }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, city, country…"
            style={{
              flex: "1 1 240px", minWidth: 200,
              background: "rgba(255,255,255,0.05)", color: "#f5f5f5",
              border: "1px solid rgba(255,255,255,0.10)", borderRadius: 8,
              padding: "8px 12px", fontSize: 13, fontFamily: "inherit",
              outline: "none",
            }}
          />
          <Select label="Source" value={sourceFilter} onChange={setSourceFilter} options={sourceOptions} />
          <Select label="Country" value={countryFilter} onChange={setCountryFilter} options={countryOptions} />
          <Select label="Sort" value={sortBy} onChange={setSortBy} options={["time", "location", "source"]} />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#aaa", cursor: "pointer" }}>
            <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />
            Verified only
          </label>
        </div>

        {/* ── Table ──────────────────────────────────────────────── */}
        <div style={{
          border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
          overflow: "hidden", background: "rgba(255,255,255,0.02)",
        }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)", color: "#888", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  <th style={th}>User</th>
                  <th style={th}>Email</th>
                  <th style={th}>Location</th>
                  <th style={th}>IP</th>
                  <th style={th}>Source</th>
                  <th style={th}>Verified</th>
                  <th style={th}>Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#666" }}>
                    {rows.length === 0 ? "No signups today yet — get to bed Arman 😅" : "No rows match the current filters."}
                  </td></tr>
                )}
                {filtered.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {r.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.image} alt="" width={28} height={28} style={{ borderRadius: 999, objectFit: "cover" }} />
                        ) : (
                          <div style={{
                            width: 28, height: 28, borderRadius: 999,
                            background: "#222", display: "inline-flex",
                            alignItems: "center", justifyContent: "center",
                            fontSize: 12, fontWeight: 800, color: "#888",
                          }}>{(r.name || "?").charAt(0).toUpperCase()}</div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {r.name}
                          </div>
                          {r.referredBy && (
                            <div style={{ fontSize: 10, color: "#888" }}>
                              ref: {r.referredBy.name}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ ...td, color: "#bbb", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>
                      {r.email}
                    </td>
                    <td style={td}>
                      <span style={{ marginRight: 6 }}>{r.flag}</span>
                      {r.city ? `${r.city}, ` : ""}{r.country || <span style={{ color: "#666" }}>—</span>}
                    </td>
                    <td style={{ ...td, color: "#888", fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 11 }}>
                      {r.ipAddress || "—"}
                    </td>
                    <td style={td}>
                      <Tag>{r.signupSource}</Tag>
                    </td>
                    <td style={td}>
                      {r.verified
                        ? <span style={{ color: BRAND, fontWeight: 700 }}>✓</span>
                        : <span style={{ color: "#666" }}>—</span>}
                    </td>
                    <td style={{ ...td, color: "#aaa", whiteSpace: "nowrap" }}>
                      <RelativeTime iso={r.createdAtIso} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer notes */}
        <div style={{ marginTop: 28, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, background: "rgba(212,255,64,0.04)", fontSize: 12, lineHeight: 1.6, color: "#bbb" }}>
          <strong style={{ color: BRAND }}>How to review:</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li>Big number for today should match your gut feel for current signup volume</li>
            <li>Search box live-filters across name, email, city, country, source</li>
            <li>Source filter shows actual sources captured today (direct / instagram / facebook / etc.)</li>
            <li>Country filter + flag should match the country whose flag is displayed in the row</li>
            <li>Verified column = whether the user has confirmed their email</li>
            <li>IP + region/lat/lng captured but only IP shown in the table — they're stored on the row for fraud-detection in Phase 2</li>
          </ul>
          <div style={{ marginTop: 10 }}>
            Once approved: port <code style={codePill}>SignupsDashboard</code> + the data fetch into
            {" "}<code style={codePill}>src/app/admin/</code> as a new tab/subroute and delete this demo.
          </div>
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value, sub, subColor = "#888" }) {
  return (
    <div style={{
      padding: "16px 18px", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 10, background: "rgba(255,255,255,0.02)",
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "#888" }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color: "#f5f5f5", lineHeight: 1.1, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: subColor, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Insight({ label, value }) {
  return (
    <div style={{
      padding: "10px 14px", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 8, background: "rgba(255,255,255,0.02)",
      display: "flex", alignItems: "center", gap: 10, fontSize: 12,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: BRAND, boxShadow: `0 0 8px ${BRAND}` }} />
      <span style={{ color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10, fontWeight: 800 }}>{label}</span>
      <span style={{ color: "#f5f5f5", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#aaa" }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "rgba(255,255,255,0.05)", color: "#f5f5f5",
          border: "1px solid rgba(255,255,255,0.10)", borderRadius: 6,
          padding: "5px 8px", fontSize: 12, fontFamily: "inherit",
          cursor: "pointer", appearance: "none",
        }}
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Tag({ children }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px", borderRadius: 999,
      background: "rgba(212,255,64,0.08)", border: `1px solid rgba(212,255,64,0.30)`,
      color: BRAND, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
    }}>
      {children}
    </span>
  );
}

function RelativeTime({ iso }) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - t) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return new Date(iso).toLocaleString();
}

const th = { textAlign: "left", padding: "10px 14px", fontWeight: 700 };
const td = { padding: "10px 14px", verticalAlign: "middle" };
const codePill = { background: "#1a1a1a", padding: "1px 5px", borderRadius: 4, fontFamily: "ui-monospace, SFMono-Regular, monospace" };
