"use client";

/**
 * AdminSocialProofClient — interactive panel for the social-proof
 * popup system. Server gates owner; this just renders + calls the
 * /api/admin/social-proof endpoint.
 *
 * Surfaces (top → bottom):
 *   • Master toggle + source picker
 *   • Stats: served/clicks last 24 h + 7 d, CTR%, unique IPs, total
 *   • Recent activity: last 10 (IP · name · dummy? · clicked?)
 *   • Reset-shown-for-IP form
 */

import { useEffect, useState } from "react";
import Link from "next/link";

// Reuse the admin palette from AdminDashboard.jsx for visual parity.
const C = {
  bg:        "#0a0a0a",
  panel:     "#141414",
  panelSoft: "#1c1c1c",
  border:    "#2a2a2a",
  text:      "#f1f5f9",
  textSoft:  "#cbd5e1",
  muted:     "#64748b",
  accent:    "#c8f135",
  danger:    "#ef4444",
  warning:   "#f59e0b",
  ok:        "#22c55e",
};

const SRC_OPTIONS = [
  { value: "both",  label: "Both (real + dummies)" },
  { value: "real",  label: "Real signups only" },
  { value: "dummy", label: "Dummies only" },
];

export default function AdminSocialProofClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [data, setData]       = useState(null);
  const [resetIp, setResetIp] = useState("");
  const [toast, setToast]     = useState(null);

  const refresh = async () => {
    try {
      const r = await fetch("/api/admin/social-proof", { cache: "no-store" });
      if (r.ok) setData(await r.json());
    } catch (e) {
      console.error("[admin/social-proof] fetch:", e);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const patchConfig = async (patch) => {
    if (saving) return;
    setSaving(true);
    try {
      const r = await fetch("/api/admin/social-proof", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        showToast("err", j.error || "Save failed");
      } else {
        setData((d) => d ? { ...d, config: j.config } : d);
        showToast("ok", "Saved");
      }
    } finally { setSaving(false); }
  };

  const doReset = async (e) => {
    e?.preventDefault();
    const ip = resetIp.trim();
    if (!ip) return;
    try {
      const r = await fetch("/api/admin/social-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetIp: ip }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        showToast("err", j.error || "Reset failed");
        return;
      }
      showToast("ok", `Cleared ${j.deleted} rows for ${ip}`);
      setResetIp("");
      refresh();
    } catch (err) {
      showToast("err", err?.message || "Reset failed");
    }
  };

  const showToast = (kind, text) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 2600);
  };

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 40, fontFamily: "Inter, sans-serif" }}>
        <p style={{ color: C.muted }}>Loading…</p>
      </main>
    );
  }
  const { config, stats, recent } = data || {};

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "Inter, sans-serif" }}>
      <header style={{ borderBottom: `1px solid ${C.border}`, background: C.panel, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <Link href="/admin" style={{ color: C.muted, fontSize: 12, textDecoration: "none" }}>← Admin</Link>
          <h1 style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em" }}>Social proof popups</h1>
        </div>
        <button type="button" onClick={refresh} style={ghostBtn(C)}>↻ Refresh</button>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 80px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Master toggle + source picker ─────────────────────── */}
        <section style={card(C)}>
          <SectionHeading C={C}>Controls</SectionHeading>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center" }}>
            <ToggleRow
              C={C}
              label={config?.enabled ? "ENABLED — popups firing live" : "DISABLED — no popups served"}
              checked={!!config?.enabled}
              disabled={saving}
              onChange={(v) => patchConfig({ enabled: v })}
            />
          </div>
          <div style={{ marginTop: 18 }}>
            <div style={smallLabel(C)}>Source</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {SRC_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => patchConfig({ sourceMode: o.value })}
                  disabled={saving}
                  style={{
                    background: config?.sourceMode === o.value ? C.accent : "transparent",
                    color:      config?.sourceMode === o.value ? "#0a0a0a" : C.text,
                    border:     `1px solid ${config?.sourceMode === o.value ? C.accent : C.border}`,
                    padding:    "8px 14px",
                    borderRadius: 8,
                    fontSize:   13,
                    fontWeight: 700,
                    cursor:     saving ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
              <strong>Both</strong> — real signups in last 24 h first, dummies fill the rest.
              <strong> Real only</strong> — surface dies when there are no recent real signups.
              <strong> Dummies only</strong> — useful for screenshots / promo footage.
            </div>
          </div>
        </section>

        {/* ── Stats ──────────────────────────────────────────────── */}
        <section style={card(C)}>
          <SectionHeading C={C}>Stats</SectionHeading>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
            <StatTile C={C} label="Served · 24 h"   value={stats?.served24h?.toLocaleString() || 0} />
            <StatTile C={C} label="Clicks · 24 h"   value={stats?.clicks24h?.toLocaleString() || 0} accent />
            <StatTile C={C} label="CTR · 24 h"      value={`${stats?.ctrPct24h ?? 0}%`} accent />
            <StatTile C={C} label="Unique IPs · 24 h" value={stats?.uniqueIps24h?.toLocaleString() || 0} />
            <StatTile C={C} label="Served · 7 d"    value={stats?.served7d?.toLocaleString() || 0} />
            <StatTile C={C} label="Clicks · 7 d"    value={stats?.clicks7d?.toLocaleString() || 0} accent />
            <StatTile C={C} label="CTR · 7 d"       value={`${stats?.ctrPct7d ?? 0}%`} accent />
            <StatTile C={C} label="Total ever"      value={stats?.totalEver?.toLocaleString() || 0} />
          </div>
        </section>

        {/* ── Reset shown for IP ─────────────────────────────────── */}
        <section style={card(C)}>
          <SectionHeading C={C}>Reset shown list for an IP</SectionHeading>
          <p style={{ margin: "0 0 10px", fontSize: 12.5, color: C.muted, lineHeight: 1.55 }}>
            Use this when testing: deletes every <code style={chip(C)}>SocialProofShown</code> row for
            the given IP so that visitor immediately sees fresh popups again.
          </p>
          <form onSubmit={doReset} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              value={resetIp}
              onChange={(e) => setResetIp(e.target.value)}
              placeholder="e.g. 86.13.27.142"
              style={{
                flex: "1 1 240px",
                background: C.panelSoft,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "10px 12px",
                color: C.text,
                fontSize: 13,
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                outline: "none",
              }}
            />
            <button type="submit" style={dangerBtn(C)} disabled={!resetIp.trim()}>
              Clear rows
            </button>
          </form>
        </section>

        {/* ── Recent activity ────────────────────────────────────── */}
        <section style={card(C)}>
          <SectionHeading C={C}>Recent (last 10)</SectionHeading>
          {(!recent || recent.length === 0) ? (
            <p style={{ margin: 0, color: C.muted, fontSize: 13 }}>No popups served yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {recent.map((r, i) => (
                <div key={i} style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(120px,1fr) minmax(120px,1.4fr) auto auto",
                  gap: 10,
                  alignItems: "center",
                  padding: "8px 10px",
                  background: C.panelSoft,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  fontSize: 12.5,
                }}>
                  <code style={{ ...chip(C), background: "rgba(255,255,255,0.04)", color: C.textSoft }}>
                    {r.visitorIp}
                  </code>
                  <span style={{ color: C.text }}>
                    {r.user?.name || "(deleted user)"}
                    {r.user?.isDummy && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: C.warning, fontWeight: 700, textTransform: "uppercase" }}>
                        dummy
                      </span>
                    )}
                  </span>
                  {r.clicked
                    ? <span style={{ fontSize: 11, color: C.ok, fontWeight: 800 }}>CLICKED</span>
                    : <span style={{ fontSize: 11, color: C.muted }}>—</span>}
                  <span style={{ fontSize: 11, color: C.muted, fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
                    {new Date(r.shownAt).toISOString().slice(11, 19)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {toast && (
        <div role="status" style={{
          position: "fixed",
          bottom: 22,
          left: "50%",
          transform: "translateX(-50%)",
          background: "#0b0b10",
          border: `1px solid ${toast.kind === "ok" ? C.ok : C.danger}`,
          color: toast.kind === "ok" ? C.ok : C.danger,
          padding: "10px 16px",
          borderRadius: 12,
          fontSize: 13,
          fontWeight: 700,
          zIndex: 90,
        }}>{toast.text}</div>
      )}
    </main>
  );
}

// ── Atoms ────────────────────────────────────────────────────────
function SectionHeading({ children, C }) {
  return (
    <h2 style={{
      margin: "0 0 14px",
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: ".14em",
      textTransform: "uppercase",
      color: C.muted,
    }}>{children}</h2>
  );
}

function StatTile({ label, value, accent, C }) {
  return (
    <div style={{
      background: C.panelSoft,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: "12px 14px",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".09em", color: C.muted }}>
        {label}
      </div>
      <div style={{
        fontSize: 22,
        fontWeight: 900,
        marginTop: 4,
        letterSpacing: "-0.01em",
        color: accent ? C.accent : C.text,
      }}>
        {value}
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange, disabled, C }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: disabled ? "not-allowed" : "pointer" }}>
      <span
        role="switch"
        aria-checked={checked}
        style={{
          width: 42,
          height: 24,
          borderRadius: 999,
          background: checked ? C.accent : "rgba(255,255,255,0.08)",
          position: "relative",
          transition: "background 180ms ease",
          flexShrink: 0,
        }}
      >
        <span style={{
          position: "absolute",
          top: 3,
          left: checked ? 21 : 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: checked ? "#0a0a0a" : "#fff",
          transition: "left 180ms ease",
          boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
        }} />
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
      />
      <span style={{ fontSize: 13.5, fontWeight: 700, color: checked ? C.text : C.textSoft }}>{label}</span>
    </label>
  );
}

// ── Inline-style helpers ─────────────────────────────────────────
const card = (C) => ({
  background:   C.panel,
  border:       `1px solid ${C.border}`,
  borderRadius: 14,
  padding:      "18px 18px 20px",
});
const smallLabel = (C) => ({
  fontSize:     11,
  fontWeight:   700,
  textTransform: "uppercase",
  letterSpacing: ".09em",
  color:        C.muted,
});
const ghostBtn = (C) => ({
  background:   "transparent",
  border:       `1px solid ${C.border}`,
  color:        C.text,
  padding:      "8px 12px",
  borderRadius: 8,
  fontSize:     12,
  fontWeight:   700,
  cursor:       "pointer",
  fontFamily:   "inherit",
});
const dangerBtn = (C) => ({
  background:   C.danger,
  border:       "none",
  color:        "#fff",
  padding:      "10px 16px",
  borderRadius: 8,
  fontSize:     13,
  fontWeight:   800,
  cursor:       "pointer",
  fontFamily:   "inherit",
});
const chip = (C) => ({
  background:   "rgba(255,255,255,0.05)",
  color:        C.textSoft,
  padding:      "2px 6px",
  borderRadius: 4,
  fontFamily:   "ui-monospace, SFMono-Regular, monospace",
  fontSize:     "0.92em",
});
