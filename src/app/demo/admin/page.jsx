"use client";
//
// DEMO — Seedance Studio admin redesign.
//
// Throwaway design preview at /demo/admin (no gate) so Arman can
// review before I port to /admin (which already has the email-based
// gate locked to armankhan0826@gmail.com via OWNER_EMAIL).
//
// Different tabs from community:
//   • No "Cast" — Studio has no dummy users
//   • No "Posts" — Studio is a SaaS, not a feed
//   • New "Generations" — recent Creation rows + status filter
//   • New "Payments" — Stripe Payment rows + refunds
//   • New "Visits" — IP-tracked page visits (Visit model already exists)
//   • Same "Overview" / "Filmmakers" / "Reports" / "Security" / "Settings"
//
// Design tokens match community admin EXCEPT primary accent is
// #c8f135 (Seedance Studio's brand green) instead of #A6CC00
// (community's variant of brand green). Pink verified badges.

import { useMemo, useState } from "react";

const C = {
  bg: "#0a0a0a",
  panel: "#141414",
  panelSoft: "#1c1c1c",
  border: "#2a2a2a",
  borderHover: "rgba(200,241,53,0.40)",
  text: "#f1f5f9",
  textSoft: "#cbd5e1",
  muted: "#64748b",
  mutedSoft: "#475569",
  accent: "#c8f135",
  accentSoft: "rgba(200,241,53,0.10)",
  verified: "#ec4899",
  danger: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
};

// ─────────────────────────────────────────────────────────────────────────
// Mock data — realistic Studio scenarios
// ─────────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "overview",    label: "Overview",     icon: "📊" },
  { id: "filmmakers",  label: "Filmmakers",   icon: "🎥", badge: 18 },
  { id: "generations", label: "Generations",  icon: "🎬", badge: 6 },
  { id: "payments",    label: "Payments",     icon: "💳" },
  { id: "visits",      label: "Visits",       icon: "👀" },
  { id: "reports",     label: "Reports",      icon: "🚩", badge: 1 },
  { id: "security",    label: "Security",     icon: "🛡", badge: 2 },
  { id: "settings",    label: "Settings",     icon: "⚙" },
];

const FILMMAKERS = [
  { id: "u1",  handle: "armankhan",    name: "Arman Khan",      email: "armankhan0826@gmail.com",    plan: "Quantum Flow",     credits: 24000, totalSpent: 320, ip: "82.34.121.45", flag: "🇬🇧", city: "London",      isp: "BT Broadband",     joined: "2025-04-12", lastSeen: "2026-05-14 12:08", verified: true,  isAdmin: true,  gens: 78, failed: 2, flags: [] },
  { id: "u2",  handle: "kiwifilm",     name: "Hana Tane",       email: "h.tane@gmail.com",           plan: "Power Engine",     credits: 7000,  totalSpent: 85,  ip: "118.92.18.66", flag: "🇳🇿", city: "Auckland",    isp: "Spark NZ",         joined: "2026-03-15", lastSeen: "2026-05-14 11:30", verified: true,  isAdmin: false, gens: 42, failed: 1, flags: [] },
  { id: "u3",  handle: "mayatran",     name: "Maya Tran",       email: "maya.t@gmail.com",           plan: "Power Engine",     credits: 4200,  totalSpent: 60,  ip: "14.169.45.221",flag: "🇻🇳", city: "Hanoi",       isp: "Viettel",          joined: "2026-04-22", lastSeen: "2026-05-13 17:01", verified: true,  isAdmin: false, gens: 28, failed: 0, flags: [] },
  { id: "u4",  handle: "sara_films",   name: "Sara Mendes",     email: "saramendes@gmail.com",       plan: "Starter Manifest", credits: 3000,  totalSpent: 38,  ip: "201.34.55.18", flag: "🇧🇷", city: "São Paulo",   isp: "Vivo Fibra",       joined: "2026-05-01", lastSeen: "2026-05-13 16:30", verified: true,  isAdmin: false, gens: 18, failed: 0, flags: [] },
  { id: "u5",  handle: "deepak.s",     name: "Deepak Sharma",   email: "deepak.sharma@outlook.com",  plan: "Starter Manifest", credits: 2500,  totalSpent: 32,  ip: "27.107.144.32",flag: "🇮🇳", city: "Mumbai",      isp: "Jio Fiber",        joined: "2026-04-18", lastSeen: "2026-05-13 18:01", verified: true,  isAdmin: false, gens: 14, failed: 1, flags: [] },
  { id: "u6",  handle: "danielwest",   name: "Daniel West",     email: "dwest@protonmail.com",       plan: "Custom",           credits: 580,   totalSpent: 7,   ip: "73.211.180.4", flag: "🇺🇸", city: "Brooklyn",    isp: "Spectrum",         joined: "2026-04-30", lastSeen: "2026-05-13 14:55", verified: false, isAdmin: false, gens: 4,  failed: 0, flags: [] },
  { id: "u7",  handle: "lucas_dp",     name: "Lucas Müller",    email: "lucas.muller@web.de",        plan: "Custom",           credits: 320,   totalSpent: 4,   ip: "84.156.7.89",  flag: "🇩🇪", city: "Berlin",      isp: "Deutsche Telekom", joined: "2026-05-03", lastSeen: "2026-05-13 12:08", verified: false, isAdmin: false, gens: 2,  failed: 0, flags: [] },
  { id: "u8",  handle: "anya.r",       name: "Anya Ramirez",    email: "anya.r@icloud.com",          plan: "Custom",           credits: 200,   totalSpent: 2.5, ip: "189.176.44.91",flag: "🇲🇽", city: "Guadalajara", isp: "Telmex Infinitum", joined: "2026-05-05", lastSeen: "2026-05-13 11:00", verified: false, isAdmin: false, gens: 1,  failed: 0, flags: ["new"] },
  { id: "u9",  handle: "throwaway92",  name: "—",               email: "throwaway92@protonmail.com", plan: "Custom",           credits: 10,    totalSpent: 0,   ip: "185.107.56.18",flag: "🌐", city: "Unknown",     isp: "NordVPN",          joined: "2026-05-12", lastSeen: "2026-05-13 09:14", verified: false, isAdmin: false, gens: 0,  failed: 0, flags: ["vpn", "new"] },
];

const GENERATIONS = [
  { id: "g1", user: "@mayatran",     prompt: "Three sisters walking through Hanoi market at dusk, cinematic anamorphic 2.39:1, golden hour…", status: "completed",  duration: 10, resolution: "1080p", quality: "high", muapi: "565b312c-…", cost: 8.50, when: "2m ago" },
  { id: "g2", user: "@armankhan",    prompt: "Espresso pour at golden hour, slow motion, warm light streaming through wooden blinds…",       status: "completed",  duration: 5,  resolution: "720p",  quality: "basic",muapi: "8e21f4d0-…", cost: 1.50, when: "12m ago" },
  { id: "g3", user: "@throwaway92",  prompt: "Tom Cruise as a wizard in the Sahara desert flying on a magic carpet, photorealistic style…", status: "failed",     duration: 5,  resolution: "720p",  quality: "basic",muapi: "4c987a11-…", cost: 0,    when: "18m ago", error: "Face detected in uploaded image. Please use an image without real people." },
  { id: "g4", user: "@sara_films",   prompt: "São Paulo skyline at twilight, sweeping aerial shot, cyberpunk neon mood…",                    status: "processing", duration: 10, resolution: "1080p", quality: "high", muapi: "f7b3e892-…", cost: 8.50, when: "22m ago" },
  { id: "g5", user: "@deepak.s",     prompt: "Mumbai monsoon street scene — rain on glass, motorcycles, evening glow…",                       status: "completed",  duration: 5,  resolution: "1080p", quality: "basic",muapi: "11d04b6f-…", cost: 2.25, when: "45m ago" },
  { id: "g6", user: "@kiwifilm",     prompt: "Maori warrior ceremony, slow zoom in, cinematic film grain, deep blacks…",                     status: "completed",  duration: 15, resolution: "1080p", quality: "high", muapi: "9a82c3e5-…", cost: 13.0, when: "1h ago" },
];

const PAYMENTS = [
  { id: "p1", user: "@mayatran",    credits: 7000,  amount: 87.50, stripe: "cs_test_a1b2…",  when: "3h ago",  status: "succeeded" },
  { id: "p2", user: "@kiwifilm",    credits: 24000, amount: 299,   stripe: "cs_test_c3d4…",  when: "1d ago",  status: "succeeded" },
  { id: "p3", user: "@deepak.s",    credits: 3000,  amount: 37.50, stripe: "cs_test_e5f6…",  when: "2d ago",  status: "succeeded" },
  { id: "p4", user: "@sara_films",  credits: 3000,  amount: 37.50, stripe: "cs_test_g7h8…",  when: "3d ago",  status: "succeeded" },
  { id: "p5", user: "@throwaway92", credits: 200,   amount: 2.50,  stripe: "cs_test_i9j0…",  when: "1d ago",  status: "refunded", refundReason: "Face-detect refund (content policy)" },
];

const VISITS = [
  { id: "v1", ip: "82.34.121.45",  flag: "🇬🇧", city: "London",    isp: "BT Broadband",    page: "/generate", when: "1m ago",  user: "@armankhan" },
  { id: "v2", ip: "14.169.45.221", flag: "🇻🇳", city: "Hanoi",     isp: "Viettel",         page: "/generate", when: "5m ago",  user: "@mayatran" },
  { id: "v3", ip: "118.92.18.66",  flag: "🇳🇿", city: "Auckland",  isp: "Spark NZ",        page: "/",         when: "8m ago",  user: "@kiwifilm" },
  { id: "v4", ip: "185.107.56.18", flag: "🌐", city: "Zurich (VPN)",isp: "NordVPN",        page: "/pricing",  when: "12m ago", user: "—" },
  { id: "v5", ip: "203.45.99.181", flag: "🇮🇩", city: "Jakarta",    isp: "Telkomsel",      page: "/",         when: "14m ago", user: "—" },
];

const REPORTS = [
  { id: "r1", reporter: "@danielwest", target: "Generation #g3",  reason: "Face-detect bypass attempt", severity: "high", status: "open", when: "18m ago" },
];

const SECURITY_FLAGS = [
  { id: "s1", severity: "high",   title: "VPN signup with refund history", detail: "@throwaway92 signed up from NordVPN (185.107.56.18), made a £2.50 purchase that got refunded for face-detect violation, then tried again. Worth flagging." },
  { id: "s2", severity: "medium", title: "Burst-velocity signup",          detail: "@anya.r created account and ran 1 generation in under 4 minutes. Plausible new-user enthusiasm, but watch the next 24h." },
];

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────
export default function StudioAdminDemo() {
  const [tab, setTab] = useState("overview");

  return (
    <div style={{
      minHeight: "100vh",
      background: C.bg,
      color: C.text,
      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    }}>
      <DemoBanner />
      <Header />
      <Tabs active={tab} onChange={setTab} />
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "0 16px 96px" }}>
        {tab === "overview"    && <OverviewTab />}
        {tab === "filmmakers"  && <FilmmakersTab />}
        {tab === "generations" && <GenerationsTab />}
        {tab === "payments"    && <PaymentsTab />}
        {tab === "visits"      && <VisitsTab />}
        {tab === "reports"     && <ReportsTab />}
        {tab === "security"    && <SecurityTab />}
        {tab === "settings"    && <SettingsTab />}
      </main>
      <ResponsiveCSS />
    </div>
  );
}

function DemoBanner() {
  return (
    <div style={{
      background: C.accentSoft,
      borderBottom: `1px solid ${C.borderHover}`,
      padding: "8px 16px",
      textAlign: "center",
      fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em",
      color: C.accent, textTransform: "uppercase",
    }}>
      ⚡ DEMO — Studio admin redesign · throwaway preview · real /admin gated to OWNER_EMAIL
    </div>
  );
}

function Header() {
  return (
    <header style={{ borderBottom: `1px solid ${C.border}`, background: C.panel }}>
      <div style={{
        maxWidth: 1280, margin: "0 auto", padding: "16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: C.accentSoft, border: `1px solid ${C.borderHover}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>🎬</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.accent, letterSpacing: "0.18em", textTransform: "uppercase" }}>
              Studio Admin
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
              <span style={{ color: C.accent }}>● </span>
              seedance.visualseffect.com · gated to your email · all actions logged
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function Tabs({ active, onChange }) {
  return (
    <nav style={{
      borderBottom: `1px solid ${C.border}`, background: C.bg,
      position: "sticky", top: 0, zIndex: 5, overflowX: "auto",
    }}>
      <div style={{
        maxWidth: 1280, margin: "0 auto", padding: "0 16px",
        display: "flex", gap: 2, minWidth: "max-content",
      }}>
        {TABS.map((t) => {
          const on = active === t.id;
          return (
            <button key={t.id} onClick={() => onChange(t.id)} style={{
              position: "relative", background: "transparent",
              color: on ? C.accent : C.muted,
              border: "none", padding: "14px 14px 12px",
              fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit", letterSpacing: "0.04em", whiteSpace: "nowrap",
            }}>
              <span style={{ marginRight: 6 }}>{t.icon}</span>
              {t.label}
              {t.badge != null && (
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
// Tabs
// ─────────────────────────────────────────────────────────────────────────
function OverviewTab() {
  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 24 }}>
      <SectionHeading title="Overview" sub="Last 30 days · production data refreshed live" />
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <Stat label="Paying Filmmakers" value="18"   delta="↑ 4 this week"           icon="🎥" />
        <Stat label="Revenue (30d)"     value="£842" delta="↑ 18% vs Apr"            icon="💎" />
        <Stat label="Generations today" value="47"   delta="6 in progress"           icon="🎬" />
        <Stat label="MuAPI cost (30d)"  value="£326" delta="38% of revenue"          icon="🔌" />
        <Stat label="Refund rate"       value="2.1%" delta="3 refunds / 142 gens"    icon="↩" tone="warn" />
        <Stat label="Security Flags"    value="2"    delta="1 high · 1 medium"       icon="🛡" tone="danger" />
      </div>

      <Panel title="Today at a glance">
        {[
          { t: "2m ago",  what: "Generation completed for", target: "@mayatran",     side: "+£0.50 MuAPI cost" },
          { t: "12m ago", what: "Generation completed for", target: "@armankhan",    side: "+£0.18 MuAPI cost" },
          { t: "18m ago", what: "Generation FAILED for",    target: "@throwaway92",  side: "Auto-refunded £2.50 · face-detect" },
          { t: "3h ago",  what: "Stripe payment from",      target: "@mayatran",     side: "+£87.50 (7,000 credits)" },
          { t: "1d ago",  what: "Stripe payment from",      target: "@kiwifilm",     side: "+£299 (24,000 credits — Quantum Flow)" },
        ].map((r, i) => <ActionRow key={i} {...r} />)}
      </Panel>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <Panel title="Plan distribution">
          {[
            { label: "Quantum Flow (24k+)",     n: 2, color: "#D9FF00" },
            { label: "Power Engine (7k+)",      n: 3, color: "#818cf8" },
            { label: "Starter Manifest (3k+)",  n: 4, color: "#34d399" },
            { label: "Custom (< 3k)",           n: 9, color: "#f59e0b" },
          ].map((p, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < 3 ? `1px solid ${C.border}` : "none", fontSize: 13 }}>
              <span style={{ color: p.color }}>● <span style={{ color: C.text }}>{p.label}</span></span>
              <b style={{ color: C.accent }}>{p.n}</b>
            </div>
          ))}
        </Panel>
        <Panel title="Top countries">
          {[
            { flag: "🇬🇧", c: "United Kingdom", n: 4 },
            { flag: "🇮🇳", c: "India",          n: 3 },
            { flag: "🇧🇷", c: "Brazil",         n: 2 },
            { flag: "🇻🇳", c: "Vietnam",        n: 2 },
            { flag: "🇺🇸", c: "United States",  n: 2 },
            { flag: "🌐", c: "VPN / Unknown",  n: 1 },
          ].map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < 5 ? `1px solid ${C.border}` : "none", fontSize: 13 }}>
              <span>{r.flag} {r.c}</span>
              <b style={{ color: C.accent }}>{r.n}</b>
            </div>
          ))}
        </Panel>
        <Panel title="MuAPI health">
          {[
            { ok: true,  label: "API endpoint",         v: "200 OK, 1.4s p95" },
            { ok: true,  label: "Webhook delivery",     v: "100% last 24h" },
            { ok: true,  label: "Auto-refund on fail",  v: "ON" },
            { ok: true,  label: "Face-detect surface",  v: "Live" },
            { ok: false, label: "Story mode metrics",   v: "Not yet tracked" },
          ].map((c, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < 4 ? `1px solid ${C.border}` : "none", fontSize: 13 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.ok ? C.accent : C.danger }} />
                {c.label}
              </span>
              <span style={{ fontSize: 11.5, color: c.ok ? C.muted : C.danger }}>{c.v}</span>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function FilmmakersTab() {
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("all");
  const filtered = useMemo(() => {
    let r = FILMMAKERS;
    if (q) {
      const ql = q.toLowerCase();
      r = r.filter((u) => [u.handle, u.name, u.email, u.ip, u.city].some((f) => (f || "").toLowerCase().includes(ql)));
    }
    if (plan !== "all") r = r.filter((u) => u.plan === plan);
    return r;
  }, [q, plan]);

  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeading title="Filmmakers" sub={`${filtered.length} of ${FILMMAKERS.length} paying customers · IP + plan + spend per user`} />
      <Panel padding={0}>
        <div style={{ padding: 14, borderBottom: `1px solid ${C.border}`, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <SearchInput value={q} onChange={setQ} wide placeholder="Search handle, name, email, IP, city…" />
          <Select value={plan} onChange={setPlan} options={[
            { value: "all", label: "All plans" },
            { value: "Quantum Flow", label: "💎 Quantum Flow" },
            { value: "Power Engine", label: "⚡ Power Engine" },
            { value: "Starter Manifest", label: "🌱 Starter Manifest" },
            { value: "Custom", label: "Custom" },
          ]} />
        </div>
        <div className="row-table">
          <FilmmakerHeader />
          {filtered.map((u) => <FilmmakerRow key={u.id} u={u} />)}
        </div>
        <div className="row-cards" style={{ display: "none" }}>
          {filtered.map((u) => <FilmmakerCard key={u.id} u={u} />)}
        </div>
      </Panel>
    </div>
  );
}

function FilmmakerHeader() {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(180px,1.5fr) minmax(140px,1.3fr) 120px minmax(120px,1fr) 90px 80px 80px",
      gap: 12, padding: "10px 14px",
      borderBottom: `1px solid ${C.border}`,
      fontSize: 10.5, fontWeight: 700, color: C.muted,
      letterSpacing: "0.10em", textTransform: "uppercase",
    }}>
      <span>Filmmaker</span><span>Email</span><span>Plan</span><span>IP / Location</span>
      <span style={{ textAlign: "center" }}>Gens</span><span style={{ textAlign: "right" }}>Credits</span>
      <span style={{ textAlign: "right" }}>£ Spent</span>
    </div>
  );
}

function FilmmakerRow({ u }) {
  const planColor = {
    "Quantum Flow":     { fg: "#D9FF00", bg: "#2a1a40" },
    "Power Engine":     { fg: "#818cf8", bg: "#1a2040" },
    "Starter Manifest": { fg: "#34d399", bg: "#1a3028" },
    "Custom":           { fg: "#f59e0b", bg: "#2a2010" },
  }[u.plan] || { fg: C.muted, bg: C.panelSoft };
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(180px,1.5fr) minmax(140px,1.3fr) 120px minmax(120px,1fr) 90px 80px 80px",
      gap: 12, padding: "12px 14px",
      borderBottom: `1px solid ${C.border}`,
      fontSize: 13, alignItems: "center",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <Avatar handle={u.handle} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{u.handle}</span>
            {u.verified && <VerifiedDot />}
            {u.isAdmin && <Pill label="ADMIN" color={C.accent} />}
            {u.flags?.map((f) => <FlagDot key={f} type={f} />)}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: C.textSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={u.email}>{u.email}</div>
      <div>
        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 7px", borderRadius: 4, background: planColor.bg, color: planColor.fg, letterSpacing: "0.04em" }}>
          {u.plan}
        </span>
      </div>
      <div>
        <div style={{ fontSize: 11.5, fontFamily: "ui-monospace, monospace" }}>{u.ip}</div>
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>{u.flag} {u.city} · {u.isp}</div>
      </div>
      <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700 }}>
        {u.gens}
        {u.failed > 0 && <span style={{ fontSize: 10, color: C.danger, marginLeft: 4 }}>·{u.failed}↯</span>}
      </div>
      <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: C.accent, fontFamily: "ui-monospace, monospace" }}>{u.credits.toLocaleString()}</div>
      <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, fontFamily: "ui-monospace, monospace" }}>£{u.totalSpent}</div>
    </div>
  );
}

function FilmmakerCard({ u }) {
  return (
    <div style={{ padding: 14, borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar handle={u.handle} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, flexWrap: "wrap" }}>
            @{u.handle}
            {u.verified && <VerifiedDot />}
            {u.isAdmin && <Pill label="ADMIN" color={C.accent} />}
            {u.flags?.map((f) => <FlagDot key={f} type={f} />)}
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{u.name}</div>
        </div>
        <Pill label={u.plan.toUpperCase()} color={u.plan === "Custom" ? C.warning : C.accent} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: C.panelSoft, borderRadius: 8, padding: "10px 12px", fontSize: 11.5 }}>
        <KV k="Credits" v={u.credits.toLocaleString()} mono />
        <KV k="Spent" v={`£${u.totalSpent}`} mono />
        <KV k="Generations" v={`${u.gens}${u.failed > 0 ? ` (${u.failed} failed)` : ""}`} />
        <KV k="Joined" v={u.joined} />
        <KV k="IP" v={u.ip} mono />
        <KV k="Location" v={`${u.flag} ${u.city}`} />
      </div>
    </div>
  );
}

function GenerationsTab() {
  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeading title="Generations" sub="Recent video gens — status, prompt preview, MuAPI request ID, cost" />
      <Panel padding={0}>
        <div style={{ padding: 14, borderBottom: `1px solid ${C.border}`, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <SearchInput placeholder="Search prompt, user, MuAPI ID…" wide />
          <Select value="all" options={[
            { value: "all", label: "All status" },
            { value: "processing", label: "🔄 Processing" },
            { value: "completed", label: "✅ Completed" },
            { value: "failed", label: "❌ Failed" },
          ]} onChange={() => {}} />
        </div>
        {GENERATIONS.map((g) => (
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
                <b style={{ color: C.text }}>{g.user}</b>
                <Pill label={g.status.toUpperCase()} color={g.status === "completed" ? C.accent : g.status === "failed" ? C.danger : C.warning} />
                <span style={{ color: C.muted, fontSize: 11 }}>{g.duration}s · {g.resolution} · {g.quality}</span>
                <span style={{ color: C.muted, fontSize: 11 }}>· {g.when}</span>
              </div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {g.prompt}
              </div>
              {g.error && (
                <div style={{ fontSize: 11.5, color: C.danger, marginTop: 6, padding: "6px 10px", background: "rgba(239,68,68,0.08)", borderRadius: 6 }}>
                  ❌ {g.error}
                </div>
              )}
              <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6, fontFamily: "ui-monospace, monospace" }}>
                MuAPI: {g.muapi} · Cost: £{g.cost.toFixed(2)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {g.status === "completed" && <SmallBtn>Watch</SmallBtn>}
              {g.status === "failed" && <SmallBtn tone="warn">Refund</SmallBtn>}
              <SmallBtn>Logs</SmallBtn>
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function PaymentsTab() {
  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeading title="Payments" sub="Stripe payments + refunds — link to Stripe dashboard for full details" />
      <Panel padding={0}>
        {PAYMENTS.map((p) => (
          <div key={p.id} style={{
            padding: 14, borderBottom: `1px solid ${C.border}`,
            display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: p.status === "succeeded" ? C.accent : p.status === "refunded" ? C.warning : C.danger,
              flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, flexWrap: "wrap" }}>
                <span style={{ color: C.accent, fontFamily: "ui-monospace, monospace" }}>£{p.amount}</span>
                <span style={{ color: C.muted }}>·</span>
                {p.user}
                <span style={{ color: C.muted }}>· {p.credits.toLocaleString()} credits</span>
                <Pill label={p.status.toUpperCase()} color={p.status === "succeeded" ? C.accent : p.status === "refunded" ? C.warning : C.danger} />
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4, fontFamily: "ui-monospace, monospace" }}>
                {p.stripe} · {p.when}
                {p.refundReason && <span style={{ color: C.warning }}> · {p.refundReason}</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <SmallBtn>Stripe →</SmallBtn>
              {p.status === "succeeded" && <SmallBtn tone="warn">Refund</SmallBtn>}
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function VisitsTab() {
  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeading title="Visits" sub="Live page visits with IP / geolocation — already tracked via Visit table" />
      <Panel padding={0}>
        {VISITS.map((v) => (
          <div key={v.id} style={{
            padding: 14, borderBottom: `1px solid ${C.border}`,
            display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
          }}>
            <div style={{ fontSize: 18, flexShrink: 0 }}>{v.flag}</div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "ui-monospace, monospace" }}>{v.ip}</span>
                <span style={{ color: C.muted }}>·</span>
                {v.city}
                <span style={{ color: C.muted, fontSize: 11 }}>· {v.isp}</span>
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                {v.user !== "—" && <b style={{ color: C.textSoft }}>{v.user} </b>}
                visited <code style={{ color: C.accent }}>{v.page}</code> · {v.when}
              </div>
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function ReportsTab() {
  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeading title="Reports" sub="User-flagged content + auto-detected policy violations" />
      <Panel padding={0}>
        {REPORTS.map((r) => (
          <div key={r.id} style={{ padding: 14, borderBottom: `1px solid ${C.border}`, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: r.severity === "high" ? C.danger : C.warning }} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.reason}</div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>
                {r.reporter} reported {r.target} · {r.when}
              </div>
            </div>
            <Pill label={r.status.toUpperCase()} color={C.warning} />
          </div>
        ))}
      </Panel>
    </div>
  );
}

function SecurityTab() {
  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeading title="Security" sub="Auto-detected risk signals · pulled from Visit table + payment patterns" />
      <Panel padding={0}>
        {SECURITY_FLAGS.map((f) => (
          <div key={f.id} style={{ padding: 14, borderBottom: `1px solid ${C.border}`, display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{
              width: 32, height: 32, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, borderRadius: 8,
              background: f.severity === "high" ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)",
            }}>{f.severity === "high" ? "🔴" : "🟠"}</div>
            <div style={{ flex: 1 }}>
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

function SettingsTab() {
  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeading title="Settings" sub="Studio admin configuration" />

      <Panel title="Admin access">
        <ConfigRow label="Admin email"      value="armankhan0826@gmail.com" hint="Hardcoded as OWNER_EMAIL in /src/app/admin/page.jsx" />
        <ConfigRow label="Audit logging"    value="ON" tone="ok" />
        <ConfigRow label="Session timeout"  value="14 days" />
      </Panel>

      <Panel title="MuAPI + pricing">
        <ConfigRow label="MuAPI endpoint"    value="api.muapi.ai" tone="ok" />
        <ConfigRow label="Webhook secret"    value="✓ SET" tone="ok" />
        <ConfigRow label="Auto-refund"       value="ON" tone="ok" hint="Refund on infra failure, not user-fault" />
        <ConfigRow label="Face-detect path"  value="LIVE" tone="ok" hint="Refunds + clear error surfaced" />
      </Panel>

      <Panel title="Visit tracking + GDPR">
        <ConfigRow label="Visit table"          value="✓ Tracking IP + geo" tone="ok" />
        <ConfigRow label="ip-api.com integration"value="✓ Wired" tone="ok" />
        <ConfigRow label="VPN detection"        value="NOT WIRED" tone="warn" hint="Could add ipqualityscore.com" />
        <ConfigRow label="Visit retention"      value="∞ (no cap)" tone="warn" hint="Set a 90-day purge cron for GDPR" />
      </Panel>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Primitives (same as community admin)
// ─────────────────────────────────────────────────────────────────────────
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
function ActionRow({ t, what, target, side }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "8px 0", borderBottom: `1px solid ${C.border}`, gap: 10, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12.5 }}>
        <span style={{ color: C.muted }}>{what} </span>
        <b style={{ color: C.accent }}>{target}</b>
        {side && <span style={{ color: C.muted }}> — {side}</span>}
      </span>
      <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap" }}>{t}</span>
    </div>
  );
}
function Avatar({ handle, size = 36 }) {
  const seed = handle.charCodeAt(0) + handle.charCodeAt(handle.length - 1);
  const hue = (seed * 37) % 360;
  return (<div style={{ width: size, height: size, borderRadius: "50%", background: `hsl(${hue}, 50%, 30%)`, color: `hsl(${hue}, 80%, 75%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.4, fontWeight: 700, flexShrink: 0 }}>{handle.slice(0, 2).toUpperCase()}</div>);
}
function VerifiedDot() {
  return (<span title="Verified" style={{ width: 14, height: 14, borderRadius: "50%", background: C.verified, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900 }}>✓</span>);
}
function FlagDot({ type }) {
  const def = { vpn: { color: C.danger, title: "VPN detected" }, new: { color: C.warning, title: "New account (< 24h)" } }[type] || { color: C.muted, title: type };
  return <span title={def.title} style={{ width: 8, height: 8, borderRadius: "50%", background: def.color, marginLeft: 2, boxShadow: "0 0 0 2px rgba(0,0,0,0.4)" }} />;
}
function Pill({ label, color }) {
  return (<span style={{ fontSize: 8.5, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: `${color}22`, color: color, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</span>);
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
function SmallBtn({ children, tone }) {
  const palette = {
    danger: { color: C.danger, border: "rgba(239,68,68,0.4)", bg: "rgba(239,68,68,0.08)" },
    warn:   { color: C.warning, border: "rgba(245,158,11,0.4)", bg: "rgba(245,158,11,0.08)" },
    default:{ color: C.textSoft, border: C.border, bg: "transparent" },
  }[tone || "default"];
  return (<button style={{ padding: "4px 10px", background: palette.bg, border: `1px solid ${palette.border}`, color: palette.color, fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{children}</button>);
}
function KV({ k, v, mono }) {
  return (<div>
    <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>{k}</div>
    <div style={{ fontSize: 12, color: C.text, marginTop: 2, fontFamily: mono ? "ui-monospace, monospace" : "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</div>
  </div>);
}
function ResponsiveCSS() {
  return (<style>{`@media (max-width: 880px) { .row-table { display: none !important; } .row-cards { display: block !important; } }`}</style>);
}
