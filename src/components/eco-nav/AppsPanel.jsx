"use client";
// Apps switcher panel — drops down from the ⊞ icon on desktop,
// becomes a bottom-sheet on mobile. Shown by EcosystemNav when
// `open` is true.
//
// Layout:
//   1. Recent tools strip (≤3 tiles, horizontal)
//   2. "Jump back in" cards (≤3 cards with subtitle copy)
//   3. Full 2-column tile grid grouped by family (Generate / Make
//      / Share / You)
//
// Each tile prefetches on hover via plain Next Link prefetch
// behaviour for in-domain hops; external subdomain hops use
// rel="noopener noreferrer" + target="_self" so the apps menu
// closes naturally on full-page nav.

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { APPS, FAMILIES } from "./ecosystem";

export default function AppsPanel({
  open,
  onClose,
  activeAppId,
  recentIds = [],
  resume = [],
}) {
  const ref = useRef(null);

  // Esc closes; outside click is wired by the backdrop element.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const a of APPS) {
      const fam = a.family || "you";
      if (!map.has(fam)) map.set(fam, []);
      map.get(fam).push(a);
    }
    return [...map.entries()].sort(
      ([a], [b]) => (FAMILIES[a]?.order || 99) - (FAMILIES[b]?.order || 99)
    );
  }, []);

  const recents = recentIds
    .map((id) => APPS.find((a) => a.id === id))
    .filter(Boolean);

  if (!open) return null;
  return (
    <div
      className="eco-apps-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="App switcher"
    >
      <div
        ref={ref}
        className="eco-apps-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            padding: "14px 18px 10px",
            gap: 12,
            borderBottom: "1px solid var(--border-soft)",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              color: "var(--accent-mid)",
            }}
          >
            Visualseffect ecosystem
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={closeBtnStyle}
          >
            ×
          </button>
        </header>

        {/* Recent strip */}
        {recents.length > 0 && (
          <section style={sectionStyle}>
            <p style={sectionEyebrowStyle}>Recent</p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.max(
                  3,
                  recents.length
                )}, 1fr)`,
                gap: 8,
              }}
            >
              {recents.map((a) => (
                <RecentTile
                  key={a.id}
                  app={a}
                  active={a.id === activeAppId}
                  onClick={onClose}
                />
              ))}
            </div>
          </section>
        )}

        {/* Resume cards */}
        {resume.length > 0 && (
          <section style={sectionStyle}>
            <p style={sectionEyebrowStyle}>Jump back in</p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {resume.map((r, i) => {
                const a = APPS.find((x) => x.id === r.appId);
                if (!a) return null;
                return (
                  <ResumeCard key={i} app={a} item={r} onClick={onClose} />
                );
              })}
            </div>
          </section>
        )}

        {/* Family-grouped tile grid */}
        {grouped.map(([famKey, apps]) => (
          <section key={famKey} style={sectionStyle}>
            <p style={sectionEyebrowStyle}>
              {FAMILIES[famKey]?.label || famKey}
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              {apps.map((a) => (
                <AppTile
                  key={a.id}
                  app={a}
                  active={a.id === activeAppId}
                  onClick={onClose}
                />
              ))}
            </div>
          </section>
        ))}

        <footer
          style={{
            padding: "10px 18px",
            borderTop: "1px solid var(--border-soft)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 11,
            color: "var(--text-faint)",
          }}
        >
          <span>Esc to close</span>
          <Link
            href="/me/analytics"
            onClick={onClose}
            style={{
              color: "var(--accent)",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Your dashboard →
          </Link>
        </footer>
      </div>

      <style>{`
        .eco-apps-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.55);
          z-index: 60;
          display: flex;
          justify-content: flex-end;
          align-items: flex-start;
          padding: 60px 18px 18px;
          animation: eco-fade-in 0.16s ease-out;
        }
        .eco-apps-panel {
          width: 100%;
          max-width: 420px;
          max-height: calc(100vh - 80px);
          background: var(--bg-card);
          border: 1px solid var(--border-strong);
          border-radius: 16px;
          box-shadow: 0 24px 56px -16px rgba(0,0,0,0.55);
          color: var(--text-primary);
          font-family: inherit;
          overflow-y: auto;
          animation: eco-pop-in 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2);
        }
        @media (max-width: 720px) {
          .eco-apps-backdrop {
            align-items: flex-end;
            padding: 0;
          }
          .eco-apps-panel {
            max-width: none;
            max-height: 88vh;
            border-bottom-left-radius: 0;
            border-bottom-right-radius: 0;
            border-bottom: none;
            animation: eco-slide-up 0.22s ease-out;
          }
        }
        @keyframes eco-fade-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes eco-pop-in {
          from { transform: translateY(-12px) scale(0.97); opacity: 0 }
          to { transform: translateY(0) scale(1); opacity: 1 }
        }
        @keyframes eco-slide-up {
          from { transform: translateY(100%) }
          to { transform: translateY(0) }
        }
      `}</style>
    </div>
  );
}

function AppTile({ app, active = false, onClick }) {
  return (
    <a
      href={app.href}
      onClick={onClick}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: 12,
        borderRadius: 12,
        background: active
          ? "color-mix(in srgb, var(--accent) 16%, transparent)"
          : "var(--bg-input)",
        border: active
          ? "1px solid color-mix(in srgb, var(--accent) 45%, transparent)"
          : "1px solid var(--border-soft)",
        textDecoration: "none",
        color: "inherit",
        transition: "background 0.12s, border-color 0.12s, transform 0.08s",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "var(--bg-card-hover)";
          e.currentTarget.style.borderColor =
            "color-mix(in srgb, var(--accent) 32%, transparent)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "var(--bg-input)";
          e.currentTarget.style.borderColor = "var(--border-soft)";
        }
      }}
    >
      <span
        aria-hidden
        style={{
          fontSize: 22,
          lineHeight: 1,
          marginBottom: 2,
        }}
      >
        {app.icon}
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: active ? "var(--accent)" : "var(--text-primary)",
        }}
      >
        {app.name}
      </span>
      <span
        style={{
          fontSize: 11,
          color: "var(--text-faint)",
        }}
      >
        {app.sub}
      </span>
      {active && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 7,
            height: 7,
            borderRadius: 999,
            background: "var(--accent)",
            boxShadow:
              "0 0 8px color-mix(in srgb, var(--accent) 60%, transparent)",
          }}
        />
      )}
    </a>
  );
}

function RecentTile({ app, active = false, onClick }) {
  return (
    <a
      href={app.href}
      onClick={onClick}
      title={app.name}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        padding: "10px 6px",
        borderRadius: 12,
        background: active
          ? "color-mix(in srgb, var(--accent) 16%, transparent)"
          : "var(--bg-input)",
        border: "1px solid var(--border-soft)",
        textDecoration: "none",
        color: "var(--text-primary)",
      }}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden>
        {app.icon}
      </span>
      <span style={{ fontSize: 11, fontWeight: 700 }}>{app.name.split(" ")[0]}</span>
    </a>
  );
}

function ResumeCard({ app, item, onClick }) {
  return (
    <a
      href={app.href}
      onClick={onClick}
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        padding: "9px 10px",
        borderRadius: 10,
        background: "var(--bg-input)",
        border: "1px solid var(--border-soft)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <span
        aria-hidden
        style={{
          fontSize: 20,
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "var(--bg-card)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {app.icon}
      </span>
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.title}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
          {item.sub}
        </span>
      </span>
      <span
        aria-hidden
        style={{
          marginLeft: "auto",
          color: "var(--accent)",
          fontSize: 14,
        }}
      >
        →
      </span>
    </a>
  );
}

const sectionStyle = {
  padding: "12px 18px 14px",
  borderBottom: "1px solid var(--border-soft)",
};

const sectionEyebrowStyle = {
  margin: "0 0 8px",
  fontSize: 9.5,
  fontWeight: 800,
  letterSpacing: "0.24em",
  textTransform: "uppercase",
  color: "var(--text-faint)",
};

const closeBtnStyle = {
  padding: "4px 9px",
  background: "transparent",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  color: "var(--text-secondary)",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  lineHeight: 1,
};
