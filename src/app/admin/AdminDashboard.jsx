"use client";
import Link from "next/link";
//
// Studio Admin dashboard — production. Client component that receives
// real Prisma data via initialData from page.jsx. The 8-tab UI ported
// from /demo/admin sign-off 2026-05-14.
//
// Existing widgets preserved + integrated:
//   • AddCreditsWidget — bulk credit grants (now in Filmmakers toolbar)
//   • VerifyToggle     — per-row verified flip (in Filmmakers row actions)
//   • BackupNowButton  — DB backup (in Settings tab)
//
// Auth: page.jsx already redirects non-Arman to "/" before this
// component ever mounts. No extra auth checks here.

import { useMemo, useState } from "react";
import AddCreditsWidget from "./AddCreditsWidget";
import BackupNowButton from "./BackupNowButton";

const C = {
  bg: "#0a0a0a",
  panel: "#141414",
  panelSoft: "#1c1c1c",
  border: "#2a2a2a",
  borderHover: "rgba(200,241,53,0.40)",
  text: "#f1f5f9",
  textSoft: "#cbd5e1",
  muted: "#64748b",
  accent: "#c8f135",
  accentSoft: "rgba(200,241,53,0.10)",
  verified: "#ec4899",
  danger: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
};

const PLAN_COLORS = {
  "Quantum Flow":     { fg: "#D9FF00", bg: "#2a1a40" },
  "Power Engine":     { fg: "#818cf8", bg: "#1a2040" },
  "Starter Manifest": { fg: "#34d399", bg: "#1a3028" },
  "Custom":           { fg: "#f59e0b", bg: "#2a2010" },
};

function relTime(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function countryFlag(country) {
  if (!country) return "🌐";
  // Common ones we want to render explicitly. Visit doesn't store
  // countryCode, only `country` full name — map a handful.
  const map = {
    "United Kingdom": "🇬🇧", "United States": "🇺🇸", "India": "🇮🇳",
    "Brazil": "🇧🇷", "Germany": "🇩🇪", "France": "🇫🇷", "Vietnam": "🇻🇳",
    "Pakistan": "🇵🇰", "Mexico": "🇲🇽", "New Zealand": "🇳🇿",
    "Australia": "🇦🇺", "Japan": "🇯🇵", "Canada": "🇨🇦", "Italy": "🇮🇹",
  };
  return map[country] || "🌐";
}

export default function AdminDashboard({ initialData }) {
  const [tab, setTab] = useState("overview");
  const { counts } = initialData;

  const TABS = [
    { id: "overview",    label: "Overview",     icon: "📊" },
    { id: "filmmakers",  label: "Filmmakers",   icon: "🎥", badge: counts.filmmakers },
    { id: "generations", label: "Generations",  icon: "🎬", badge: counts.generationsToday || undefined },
    { id: "payments",    label: "Payments",     icon: "💳", badge: counts.totalOrders || undefined },
    { id: "visits",      label: "Visits",       icon: "👀" },
    { id: "security",    label: "Security",     icon: "🛡", badge: counts.securityFlags || undefined },
    { id: "settings",    label: "Settings",     icon: "⚙" },
  ];

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.text,
      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    }}>
      <Header />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "0 16px 96px" }}>
        {tab === "overview"    && <OverviewTab data={initialData} />}
        {tab === "filmmakers"  && <FilmmakersTab rows={initialData.filmmakers} />}
        {tab === "generations" && <GenerationsTab rows={initialData.generations} />}
        {tab === "payments"    && <PaymentsTab rows={initialData.payments} />}
        {tab === "visits"      && <VisitsTab rows={initialData.visits} />}
        {tab === "security"    && <SecurityTab flags={initialData.securityFlags} />}
        {tab === "settings"    && <SettingsTab data={initialData} />}
      </main>
      <ResponsiveCSS />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Chrome
// ─────────────────────────────────────────────────────────────────────────
function Header() {
  return (
    <header style={{ borderBottom: `1px solid ${C.border}`, background: C.panel }}>
      <div style={{
        maxWidth: 1280, margin: "0 auto", padding: 16,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Link href="/" style={{
            width: 36, height: 36, borderRadius: 8,
            background: C.accentSoft, border: `1px solid ${C.borderHover}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, textDecoration: "none",
          }} title="Back to site">🎬</Link>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.accent, letterSpacing: "0.18em", textTransform: "uppercase" }}>
              Studio Admin
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
              <span style={{ color: C.accent }}>● </span>
              Restricted to your email · all actions audited
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Quick link to the new Daily Signups tracker. Opens the
              /demo/admin-signups route in the same tab so the back
              button returns to /admin. Styled to match BackupNowButton
              so the two read as a pair of admin shortcuts. */}
          <a
            href="/demo/admin-signups"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 999,
              background: C.accent,
              color: "#0a0a0a",
              border: `1px solid ${C.accent}`,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "0.02em",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
            title="Daily signups tracker (location, source, IP)"
          >
            <span aria-hidden="true">📊</span> Today&rsquo;s Signups
          </a>
          {/* Phase 2 social-proof admin control panel. Same lime
              pill style so the three shortcuts (Signups, Social
              Proof, Backup Now) read as a row. */}
          <a
            href="/admin/social-proof"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 999,
              background: "transparent",
              color: C.accent,
              border: `1px solid ${C.accent}`,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "0.02em",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
            title="Social-proof popup controls + stats + reset"
          >
            <span aria-hidden="true">📣</span> Social Proof
          </a>
          <BackupNowButton />
        </div>
      </div>
    </header>
  );
}

function Tabs({ tabs, active, onChange }) {
  return (
    <nav style={{
      borderBottom: `1px solid ${C.border}`, background: C.bg,
      position: "sticky", top: 0, zIndex: 5, overflowX: "auto",
    }}>
      <div style={{
        maxWidth: 1280, margin: "0 auto", padding: "0 16px",
        display: "flex", gap: 2, minWidth: "max-content",
      }}>
        {tabs.map((t) => {
          const on = active === t.id;
          return (
            <button key={t.id} onClick={() => onChange(t.id)} style={{
              position: "relative", background: "transparent",
              color: on ? C.accent : C.muted, border: "none",
              padding: "14px 14px 12px", fontSize: 12.5, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.04em",
              whiteSpace: "nowrap",
            }}>
              <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
              {t.badge != null && t.badge > 0 && (
                <span style={{
                  marginLeft: 6, fontSize: 10, fontWeight: 800,
                  padding: "1px 6px", borderRadius: 999,
                  background: on ? C.accent : C.panel,
                  color: on ? "#0a0a0a" : C.muted,
                  border: on ? "none" : `1px solid ${C.border}`,
                }}>{t.badge.toLocaleString()}</span>
              )}
              {on && <span style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 2, background: C.accent }} />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tab: Overview
// ─────────────────────────────────────────────────────────────────────────
function OverviewTab({ data }) {
  const { counts } = data;
  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 24 }}>
      <SectionHeading title="Overview" sub="Live production data" />

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <Stat label="Filmmakers"        value={counts.filmmakers.toLocaleString()} delta={`${counts.paidUsers} paid`} icon="🎥" />
        <Stat label="Revenue (total)"   value={`$${(counts.revenueCents / 100).toFixed(2)}`} delta={`${counts.totalOrders} order${counts.totalOrders === 1 ? "" : "s"}`} icon="💎" />
        <Stat label="Generations"       value={counts.generations.toLocaleString()} delta={`${counts.generationsToday} today`} icon="🎬" />
        <Stat label="Failed (30d)"      value={counts.generationsFailed30d.toLocaleString()} delta="auto-refund where applicable" icon="↯" tone={counts.generationsFailed30d > 10 ? "warn" : undefined} />
        <Stat label="Visits"            value={counts.visits.toLocaleString()} delta={`${counts.uniqueVisitors} unique`} icon="👀" />
        <Stat label="Security Flags"    value={counts.securityFlags.toLocaleString()} delta="see Security tab" icon="🛡" tone={counts.securityFlags > 0 ? "warn" : undefined} />
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <Panel title="Plan distribution">
          {Object.entries(counts.plans).map(([plan, n], i, arr) => (
            <div key={plan} style={{
              display: "flex", justifyContent: "space-between",
              padding: "8px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none",
              fontSize: 13,
            }}>
              <span><span style={{ color: PLAN_COLORS[plan]?.fg || C.muted }}>● </span><span style={{ color: C.text }}>{plan}</span></span>
              <b style={{ color: C.accent }}>{n}</b>
            </div>
          ))}
        </Panel>

        <Panel title="Today">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <KV k="New generations" v={counts.generationsToday.toLocaleString()} />
            <KV k="Visitors" v={counts.visitorsToday.toLocaleString()} />
            <KV k="Credits in circulation" v={counts.totalCredits.toLocaleString()} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tab: Filmmakers
// ─────────────────────────────────────────────────────────────────────────
function FilmmakersTab({ rows }) {
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("all");
  const [kind, setKind] = useState("all"); // "all" | "real" | "dummy"

  const filtered = useMemo(() => {
    let r = rows;
    if (q) {
      const ql = q.toLowerCase();
      r = r.filter((u) =>
        (u.name || "").toLowerCase().includes(ql) ||
        (u.email || "").toLowerCase().includes(ql)
      );
    }
    if (plan !== "all") r = r.filter((u) => u.plan === plan);
    if (kind === "real")  r = r.filter((u) => !u.isDummy);
    if (kind === "dummy") r = r.filter((u) => u.isDummy);
    return r;
  }, [rows, q, plan, kind]);

  // Split for the divided rendering: real users above, dummies below.
  const real    = filtered.filter((u) => !u.isDummy);
  const dummies = filtered.filter((u) => u.isDummy);

  // Shape to AddCreditsWidget's expected input — real users only,
  // adding credits to a dummy is a footgun.
  const userList = rows.filter((u) => !u.isDummy).map((u) => ({ email: u.email, name: u.name, credits: u.credits }));

  const realCount  = rows.filter((u) => !u.isDummy).length;
  const dummyCount = rows.filter((u) =>  u.isDummy).length;

  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeading
        title="Filmmakers"
        sub={`${realCount} real · ${dummyCount} community dummies (pinned bottom) · plan + spend + credits`}
      />

      <AddCreditsWidget users={userList} />

      <Panel padding={0}>
        <div style={{ padding: 14, borderBottom: `1px solid ${C.border}`, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <SearchInput value={q} onChange={setQ} wide placeholder="Search name or email…" />
          <Select value={kind} onChange={setKind} options={[
            { value: "all",   label: `All (${realCount + dummyCount})` },
            { value: "real",  label: `🟢 Real (${realCount})` },
            { value: "dummy", label: `🎬 Dummies only (${dummyCount})` },
          ]} />
          <Select value={plan} onChange={setPlan} options={[
            { value: "all", label: "All plans" },
            { value: "Quantum Flow", label: "💎 Quantum Flow" },
            { value: "Power Engine", label: "⚡ Power Engine" },
            { value: "Starter Manifest", label: "🌱 Starter Manifest" },
            { value: "Custom", label: "Custom" },
          ]} />
        </div>

        {/* Real users — top section, full opacity */}
        <div className="row-table">
          <FilmmakerHeader />
          {real.length === 0 ? <Empty>No real filmmakers match this filter.</Empty> : real.map((u) => <FilmmakerRow key={u.id} u={u} />)}
        </div>
        <div className="row-cards" style={{ display: "none" }}>
          {real.length === 0 ? <Empty>No real filmmakers match this filter.</Empty> : real.map((u) => <FilmmakerCard key={u.id} u={u} />)}
        </div>

        {/* Dummies section — visible separator + dimmed rows so Arman
            can scroll past at a glance. Only renders if any dummies
            match the current filter. */}
        {dummies.length > 0 && (
          <>
            <div style={{
              padding: "12px 14px",
              background: C.panelSoft,
              borderTop: `1px solid ${C.border}`,
              borderBottom: `1px solid ${C.border}`,
              fontSize: 10.5, fontWeight: 800, color: C.muted,
              letterSpacing: "0.18em", textTransform: "uppercase",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.muted }} />
              Community dummies · {dummies.length} below
            </div>
            <div className="row-table" style={{ opacity: 0.55 }}>
              {dummies.map((u) => <FilmmakerRow key={u.id} u={u} />)}
            </div>
            <div className="row-cards" style={{ display: "none", opacity: 0.55 }}>
              {dummies.map((u) => <FilmmakerCard key={u.id} u={u} />)}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

function FilmmakerHeader() {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(180px,1.5fr) minmax(140px,1.3fr) 120px 80px 80px 80px",
      gap: 12, padding: "10px 14px",
      borderBottom: `1px solid ${C.border}`,
      fontSize: 10.5, fontWeight: 700, color: C.muted,
      letterSpacing: "0.10em", textTransform: "uppercase",
    }}>
      <span>Filmmaker</span><span>Email</span><span>Plan</span>
      <span style={{ textAlign: "center" }}>Gens</span>
      <span style={{ textAlign: "right" }}>Credits</span>
      <span style={{ textAlign: "right" }}>$ Spent</span>
    </div>
  );
}

function FilmmakerRow({ u }) {
  const planColor = PLAN_COLORS[u.plan] || { fg: C.muted, bg: C.panelSoft };
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(180px,1.5fr) minmax(140px,1.3fr) 120px 80px 80px 80px",
      gap: 12, padding: "12px 14px",
      borderBottom: `1px solid ${C.border}`,
      fontSize: 13, alignItems: "center",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <Avatar handle={u.email || u.name || u.id} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name || "—"}</span>
            {u.verified && <VerifiedDot />}
            {u.isAdmin && <Pill label="ADMIN" color={C.accent} />}
            {u.isDummy && <Pill label="DUMMY" color={C.muted} />}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: C.textSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={u.email}>{u.email || "—"}</div>
      <div>
        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 7px", borderRadius: 4, background: planColor.bg, color: planColor.fg, letterSpacing: "0.04em" }}>
          {u.plan}
        </span>
      </div>
      <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700 }}>{u.creationCount}</div>
      <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: C.accent, fontFamily: "ui-monospace, monospace" }}>{u.credits.toLocaleString()}</div>
      <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, fontFamily: "ui-monospace, monospace" }}>${(u.totalSpentCents / 100).toFixed(2)}</div>
    </div>
  );
}

function FilmmakerCard({ u }) {
  return (
    <div style={{ padding: 14, borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar handle={u.email || u.name || u.id} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, flexWrap: "wrap" }}>
            {u.name || "—"}
            {u.verified && <VerifiedDot />}
            {u.isAdmin && <Pill label="ADMIN" color={C.accent} />}
            {u.isDummy && <Pill label="DUMMY" color={C.muted} />}
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{u.email || "—"}</div>
        </div>
        <Pill label={u.plan.toUpperCase()} color={u.plan === "Custom" ? C.warning : C.accent} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: C.panelSoft, borderRadius: 8, padding: "10px 12px", fontSize: 11.5 }}>
        <KV k="Credits" v={u.credits.toLocaleString()} mono />
        <KV k="Spent" v={`$${(u.totalSpentCents / 100).toFixed(2)}`} mono />
        <KV k="Generations" v={u.creationCount.toString()} />
        <KV k="Plan" v={u.plan} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tab: Generations
// ─────────────────────────────────────────────────────────────────────────
function GenerationsTab({ rows }) {
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((g) => g.status === filter);
  }, [rows, filter]);

  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeading title="Generations" sub={`${filtered.length} of ${rows.length} recent · status + MuAPI request ID + per-gen cost`} />

      <Panel padding={0}>
        <div style={{ padding: 14, borderBottom: `1px solid ${C.border}`, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Select value={filter} onChange={setFilter} options={[
            { value: "all", label: "All status" },
            { value: "processing", label: "🔄 Processing" },
            { value: "completed", label: "✅ Completed" },
            { value: "failed", label: "❌ Failed" },
          ]} />
        </div>

        {filtered.length === 0 ? <Empty>No generations match this filter.</Empty> : filtered.map((g) => (
          <div key={g.id} style={{
            padding: 14, borderBottom: `1px solid ${C.border}`,
            display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap",
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%", marginTop: 6,
              background: g.status === "completed" ? C.accent : g.status === "failed" ? C.danger : C.warning,
              flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.textSoft, marginBottom: 4, flexWrap: "wrap" }}>
                <b style={{ color: C.text }}>{g.userEmail !== "—" ? g.userEmail : g.userName}</b>
                <Pill label={g.status.toUpperCase()} color={g.status === "completed" ? C.accent : g.status === "failed" ? C.danger : C.warning} />
                {g.duration && <span style={{ color: C.muted, fontSize: 11 }}>{g.duration}s · {g.resolution || "—"} · {g.quality || "—"}</span>}
                <span style={{ color: C.muted, fontSize: 11 }}>· {relTime(g.createdAt)}</span>
              </div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word" }}>
                {g.prompt}
              </div>
              {g.error && (
                <div style={{ fontSize: 11.5, color: C.danger, marginTop: 6, padding: "6px 10px", background: "rgba(239,68,68,0.08)", borderRadius: 6 }}>
                  ❌ {g.error}
                </div>
              )}
              {g.requestId && (
                <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6, fontFamily: "ui-monospace, monospace" }}>
                  MuAPI: {g.requestId}
                </div>
              )}
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tab: Payments
// ─────────────────────────────────────────────────────────────────────────
function PaymentsTab({ rows }) {
  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeading title="Payments" sub={`${rows.length} Stripe payment${rows.length === 1 ? "" : "s"}`} />
      <Panel padding={0}>
        {rows.length === 0 ? <Empty>No payments yet.</Empty> : rows.map((p) => (
          <div key={p.id} style={{
            padding: 14, borderBottom: `1px solid ${C.border}`,
            display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
          }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.accent, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, flexWrap: "wrap" }}>
                <span style={{ color: C.accent, fontFamily: "ui-monospace, monospace" }}>${p.amountUsd.toFixed(2)}</span>
                <span style={{ color: C.muted }}>·</span>
                {p.user}
                <span style={{ color: C.muted }}>· {p.credits.toLocaleString()} credits</span>
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4, fontFamily: "ui-monospace, monospace" }}>
                {p.stripeSessionId} · {relTime(p.createdAt)}
              </div>
            </div>
            <a href={`https://dashboard.stripe.com/payments/${p.stripeSessionId}`} target="_blank" rel="noreferrer" style={smallBtnStyle()}>
              Stripe →
            </a>
          </div>
        ))}
      </Panel>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tab: Visits
// ─────────────────────────────────────────────────────────────────────────
function VisitsTab({ rows }) {
  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeading title="Visits" sub={`Last ${rows.length} page visits with IP + country + ISP`} />
      <Panel padding={0}>
        {rows.length === 0 ? <Empty>No visits tracked yet.</Empty> : rows.map((v) => (
          <div key={v.id} style={{
            padding: 14, borderBottom: `1px solid ${C.border}`,
            display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
          }}>
            <div style={{ fontSize: 18, flexShrink: 0 }}>{countryFlag(v.country)}</div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "ui-monospace, monospace" }}>{v.ip}</span>
                <span style={{ color: C.muted }}>·</span>
                {v.city || v.country || "Unknown"}
                {v.isp && <span style={{ color: C.muted, fontSize: 11 }}>· {v.isp}</span>}
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                visited <code style={{ color: C.accent }}>{v.page || "/"}</code> · {relTime(v.createdAt)}
              </div>
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tab: Security
// ─────────────────────────────────────────────────────────────────────────
function SecurityTab({ flags }) {
  if (!flags || flags.length === 0) {
    return (
      <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <SectionHeading title="Security" sub="Auto-detected risk signals" />
        <Panel>
          <p style={{ fontSize: 13.5, color: C.accent, margin: "0 0 6px", fontWeight: 700 }}>
            ✓ Nothing flagged.
          </p>
          <p style={{ fontSize: 12.5, color: C.muted, margin: 0, lineHeight: 1.55 }}>
            No VPN-pattern visits or unusual failure rates detected. Detection sweeps on every page load.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeading title="Security" sub={`${flags.length} flag${flags.length === 1 ? "" : "s"}`} />
      <Panel padding={0}>
        {flags.map((f) => (
          <div key={f.id} style={{
            padding: 14, borderBottom: `1px solid ${C.border}`,
            display: "flex", gap: 14, alignItems: "flex-start",
          }}>
            <div style={{
              width: 32, height: 32, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, borderRadius: 8,
              background: f.severity === "high" ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)",
            }}>{f.severity === "high" ? "🔴" : "🟠"}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700, flexWrap: "wrap" }}>
                {f.title}
                <Pill label={f.severity.toUpperCase()} color={f.severity === "high" ? C.danger : C.warning} />
              </div>
              <div style={{ fontSize: 12.5, color: C.textSoft, marginTop: 4, lineHeight: 1.55 }}>{f.detail}</div>
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tab: Settings
// ─────────────────────────────────────────────────────────────────────────
function SettingsTab({ data }) {
  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeading title="Settings" sub="Studio admin configuration" />

      <Panel title="Admin access">
        <ConfigRow label="Admin email" value={data.ownerEmail} hint="Hardcoded in /src/app/admin/page.jsx" />
        <ConfigRow label="Session timeout" value="14 days" />
      </Panel>

      <Panel title="MuAPI + pricing">
        <ConfigRow label="MuAPI endpoint" value="api.muapi.ai" tone="ok" />
        <ConfigRow label="Webhook" value="✓ wired" tone="ok" />
        <ConfigRow label="Auto-refund (infra)" value="ON" tone="ok" hint="Refunds on 5xx + network, not user-fault (face-detect IS user-fault but auto-refunded by policy)" />
      </Panel>

      <Panel title="Database">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Backup now</div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>
              Snapshot the live DB on demand. Header button does the same — extra one here for habit.
            </div>
          </div>
          <BackupNowButton />
        </div>
      </Panel>

      <Panel title="Visit tracking">
        <ConfigRow label="Total visits"    value={data.counts.visits.toLocaleString()} />
        <ConfigRow label="Unique visitors" value={data.counts.uniqueVisitors.toLocaleString()} />
        <ConfigRow label="GDPR retention"  value="∞ (no cap)" tone="warn" hint="Add a 90-day Visit purge cron when convenient" />
      </Panel>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────
function SectionHeading({ title, sub }) {
  return (<div><h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: "-0.01em" }}>{title}</h2>{sub && <p style={{ fontSize: 12.5, color: C.muted, margin: "4px 0 0" }}>{sub}</p>}</div>);
}
function Panel({ title, subtitle, children, padding = 16 }) {
  return (
    <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      {title && <header style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, background: C.panelSoft }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: "0.10em", textTransform: "uppercase" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>{subtitle}</div>}
      </header>}
      <div style={{ padding }}>{children}</div>
    </section>
  );
}
function Stat({ label, value, delta, icon, tone }) {
  const a = tone === "danger" ? C.danger : tone === "warn" ? C.warning : C.accent;
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: C.muted }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8, color: a, letterSpacing: "-0.02em" }}>{value}</div>
      {delta && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{delta}</div>}
    </div>
  );
}
function Avatar({ handle, size = 36 }) {
  const safe = (handle || "??").toString();
  const seed = safe.charCodeAt(0) + safe.charCodeAt(safe.length - 1);
  const hue = (seed * 37) % 360;
  return (<div style={{ width: size, height: size, borderRadius: "50%", background: `hsl(${hue}, 50%, 30%)`, color: `hsl(${hue}, 80%, 75%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.4, fontWeight: 700, flexShrink: 0 }}>{safe.slice(0, 2).toUpperCase()}</div>);
}
function VerifiedDot() {
  return (<span title="Verified" style={{ width: 14, height: 14, borderRadius: "50%", background: C.verified, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900 }}>✓</span>);
}
function Pill({ label, color }) {
  return (<span style={{ fontSize: 8.5, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: `${color}22`, color, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</span>);
}
function SearchInput({ value, onChange, placeholder = "Search…", wide }) {
  return (
    <div style={{ position: "relative", flex: wide ? "1 1 240px" : "0 0 240px", maxWidth: 360 }}>
      <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: 13, pointerEvents: "none" }}>🔍</span>
      <input type="text" value={value ?? ""} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px 8px 32px", borderRadius: 8, fontSize: 12.5, outline: "none", fontFamily: "inherit" }} />
    </div>
  );
}
function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange?.(e.target.value)}
      style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, padding: "8px 10px", borderRadius: 8, fontSize: 12.5, outline: "none", cursor: "pointer", fontFamily: "inherit" }}>
      {options.map((o) => (<option key={o.value} value={o.value} style={{ background: C.panel, color: C.text }}>{o.label}</option>))}
    </select>
  );
}
function KV({ k, v, mono }) {
  return (<div>
    <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>{k}</div>
    <div style={{ fontSize: 12, color: C.text, marginTop: 2, fontFamily: mono ? "ui-monospace, monospace" : "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</div>
  </div>);
}
function ConfigRow({ label, value, hint, tone }) {
  return (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 13 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "ui-monospace, monospace", color: tone === "ok" ? C.accent : tone === "warn" ? C.warning : C.text }}>{value}</span>
      </div>
      {hint && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
function Empty({ children }) {
  return (<div style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: C.muted }}>{children}</div>);
}
function smallBtnStyle() {
  return {
    padding: "4px 10px",
    background: "transparent",
    border: `1px solid ${C.border}`,
    color: C.textSoft,
    fontSize: 11, fontWeight: 700,
    borderRadius: 6,
    textDecoration: "none",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
    display: "inline-block",
  };
}
function ResponsiveCSS() {
  return (<style>{`@media (max-width: 880px) { .row-table { display: none !important; } .row-cards { display: block !important; } }`}</style>);
}
