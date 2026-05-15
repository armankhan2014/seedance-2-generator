"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  pushSupported,
  pushPermission,
  getActiveSubscription,
  enableStudioPush,
  disableStudioPush,
} from "@/lib/clientPush";

// /settings/notifications — the Settings → Notifications panel from
// the demo, wired live. Persists prefs to /api/user/push-prefs and
// drives subscribe/unsubscribe via lib/clientPush.
//
// Master toggle off → unsubscribe locally + push DELETE.
// Master toggle on → enableStudioPush (browser prompt if needed) +
// pref flip. Per-type toggles only flip the DB pref.

const C = {
  bg: "#0a0a0a",
  panel: "#141414",
  panelSoft: "#1c1c1c",
  border: "#2a2a2a",
  borderHover: "rgba(166,204,0,0.40)",
  text: "#f1f5f9",
  textSoft: "#cbd5e1",
  muted: "#64748b",
  accent: "#A6CC00",
  accentSoft: "rgba(166,204,0,0.10)",
  danger: "#ef4444",
};

export default function NotificationsSettings() {
  const router = useRouter();
  const [prefs, setPrefs] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [permission, setPermission] = useState("default");
  const [hasSub, setHasSub] = useState(false);
  const [supportsPush, setSupportsPush] = useState(true);
  const [toast, setToast] = useState(null);

  function flashToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  useEffect(() => {
    setSupportsPush(pushSupported());
    setPermission(pushPermission());
    (async () => {
      try {
        const sub = await getActiveSubscription();
        setHasSub(!!sub);
      } catch {}
      try {
        const res = await fetch("/api/user/push-prefs");
        const j = await res.json();
        if (j.ok) setPrefs(j.prefs);
      } catch {
        setPrefs({
          pushMaster: true,
          pushVideoReady: true,
          pushVideoFailed: true,
          pushFeatured: true,
        });
      }
    })();
  }, []);

  async function saveOne(key, value) {
    setBusyKey(key);
    try {
      const res = await fetch("/api/user/push-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Couldn't save");
      setPrefs(j.prefs);
    } catch (e) {
      flashToast(e.message);
    } finally {
      setBusyKey(null);
    }
  }

  async function onMasterToggle(next) {
    if (busyKey) return;
    if (next) {
      // Turning master ON — fire the OS prompt + subscribe if needed.
      setBusyKey("pushMaster");
      const result = await enableStudioPush();
      setBusyKey(null);
      setPermission(pushPermission());
      const sub = await getActiveSubscription().catch(() => null);
      setHasSub(!!sub);
      if (result.ok) {
        await saveOne("pushMaster", true);
        flashToast("Notifications enabled");
      } else if (result.reason === "denied") {
        flashToast("Permission blocked — enable in your browser settings");
      } else {
        flashToast("Couldn't enable — try again");
      }
    } else {
      // Turning master OFF — unsubscribe locally + flip the flag.
      setBusyKey("pushMaster");
      await disableStudioPush().catch(() => {});
      const sub = await getActiveSubscription().catch(() => null);
      setHasSub(!!sub);
      await saveOne("pushMaster", false);
      setBusyKey(null);
      flashToast("Notifications turned off");
    }
  }

  function onTypeToggle(key, next) {
    if (busyKey) return;
    saveOne(key, next);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
      }}
    >
      <header
        style={{
          background: C.panel,
          borderBottom: `1px solid ${C.border}`,
          padding: "16px 20px",
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={() => router.back()}
            style={{
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.textSoft,
              padding: "6px 10px",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 12.5,
              fontFamily: "inherit",
            }}
          >
            ← Back
          </button>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: C.accent,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Settings
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>Notifications</div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 96px" }}>
        {!supportsPush && (
          <Note tone="warn">
            This browser doesn’t support web push (Safari &lt; 16.4 on iOS, in-app browsers).
            You’ll still see in-app updates when you return — just no system-level pings.
          </Note>
        )}
        {supportsPush && permission === "denied" && (
          <Note tone="warn">
            Permission is blocked at the browser level. Open your site settings (click the lock
            icon next to the URL) and switch <b>Notifications</b> to Allow, then toggle the master
            switch below.
          </Note>
        )}

        <section
          style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            overflow: "hidden",
            marginTop: 16,
          }}
        >
          <div
            style={{
              padding: "14px 16px",
              borderBottom: `1px solid ${C.border}`,
              background: C.panelSoft,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Push notifications
          </div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 4 }}>
            <ToggleRow
              label="Push notifications"
              sub="Master switch — turning off disables every push below + unsubscribes this browser."
              value={!!prefs?.pushMaster && hasSub}
              busy={busyKey === "pushMaster"}
              onChange={onMasterToggle}
              accent
            />
            <Divider />
            <ToggleRow
              label="🎬 Video ready"
              sub="Ping me when a generation finishes."
              value={!!prefs?.pushVideoReady}
              busy={busyKey === "pushVideoReady"}
              disabled={!prefs?.pushMaster}
              onChange={(v) => onTypeToggle("pushVideoReady", v)}
            />
            <ToggleRow
              label="⚠️ Generation failed / refunded"
              sub="So you don't sit waiting on a render that hit a content-policy block."
              value={!!prefs?.pushVideoFailed}
              busy={busyKey === "pushVideoFailed"}
              disabled={!prefs?.pushMaster}
              onChange={(v) => onTypeToggle("pushVideoFailed", v)}
            />
            <ToggleRow
              label="⭐ Featured by an admin"
              sub="Studio pinned your video to the home feed."
              value={!!prefs?.pushFeatured}
              busy={busyKey === "pushFeatured"}
              disabled={!prefs?.pushMaster}
              onChange={(v) => onTypeToggle("pushFeatured", v)}
            />
          </div>
        </section>
      </main>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: C.panel,
            border: `1px solid ${C.borderHover}`,
            color: C.text,
            padding: "10px 18px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 700,
            boxShadow: "0 12px 32px -8px rgba(0,0,0,0.6)",
            zIndex: 100,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function ToggleRow({ label, sub, value, onChange, busy, disabled, accent }) {
  const click = () => {
    if (busy || disabled) return;
    onChange(!value);
  };
  return (
    <div
      onClick={click}
      style={{
        padding: "10px 4px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled || busy ? "default" : "pointer",
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: accent ? 800 : 600,
            color: accent ? C.accent : C.text,
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>{sub}</div>
      </div>
      <Switch on={value} busy={busy} />
    </div>
  );
}

function Switch({ on, busy }) {
  return (
    <div
      style={{
        width: 36,
        height: 22,
        borderRadius: 999,
        background: on ? C.accent : C.panelSoft,
        border: `1px solid ${on ? C.accent : C.border}`,
        position: "relative",
        transition: "background 0.18s, border-color 0.18s",
        flexShrink: 0,
        opacity: busy ? 0.7 : 1,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          left: on ? 16 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: on ? "#0a0a0a" : C.muted,
          transition: "left 0.18s",
        }}
      />
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: C.border, margin: "6px 0" }} />;
}

function Note({ children, tone }) {
  const palette = tone === "warn" ? "#f59e0b" : C.accent;
  return (
    <div
      style={{
        background: palette + "12",
        border: `1px solid ${palette}55`,
        color: C.textSoft,
        padding: "10px 14px",
        borderRadius: 10,
        fontSize: 12.5,
        lineHeight: 1.55,
        marginTop: 16,
      }}
    >
      {children}
    </div>
  );
}
