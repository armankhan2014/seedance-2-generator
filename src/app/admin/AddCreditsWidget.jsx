"use client";
import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function AddCreditsWidget({ users }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState(100);
  const [custom, setCustom] = useState("");
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState("");
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // ── Auto-refresh every 30 seconds ──
  useEffect(() => {
    const id = setInterval(() => {
      startTransition(() => router.refresh());
      setLastRefresh(new Date());
    }, 30000);
    return () => clearInterval(id);
  }, [router]);

  function refresh() {
    startTransition(() => router.refresh());
    setLastRefresh(new Date());
  }

  async function handleAdd() {
    const credits = custom ? parseInt(custom) : amount;
    if (!email || !credits || credits < 1) {
      setStatus("error");
      setMessage("Please enter a valid email and credit amount.");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch(
        `/api/fix-credits?secret=seedance2024&email=${encodeURIComponent(email)}&credits=${credits}`
      );
      const data = await res.json();
      if (data.success) {
        setStatus("success");
        setMessage(`✅ Done! ${data.email} now has ${data.newTotal} credits (+${data.creditsAdded} added).`);
        // ── Refresh the server data so the table updates live ──
        startTransition(() => router.refresh());
        setLastRefresh(new Date());
        setEmail("");
        setCustom("");
      } else {
        setStatus("error");
        setMessage(`❌ ${data.error || "Something went wrong."}`);
      }
    } catch (e) {
      setStatus("error");
      setMessage("❌ Network error. Try again.");
    }
  }

  const presets = [50, 100, 500, 1000];

  return (
    <div style={{
      background: "#1a1a2e", borderRadius: 14, border: "1px solid #2a2a40",
      marginBottom: 32, overflow: "hidden"
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 22px", borderBottom: "1px solid #2a2a40",
        display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>💎</span>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Add Credits to User</h2>
        </div>
        {/* Manual refresh + live indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "#555" }}>
            {isPending ? "⟳ Refreshing..." : `Updated ${lastRefresh.toLocaleTimeString()}`}
          </span>
          <button
            onClick={refresh}
            disabled={isPending}
            style={{
              background: "none", border: "1px solid #3a3a5a", borderRadius: 6,
              color: isPending ? "#555" : "#818cf8", fontSize: 12, cursor: "pointer",
              padding: "4px 12px", fontWeight: 600
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      <div style={{ padding: "20px 22px" }}>
        {/* Email */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            User Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="user@example.com"
            list="admin-user-emails"
            style={{
              width: "100%", boxSizing: "border-box",
              background: "#12122a", border: "1px solid #3a3a5a",
              borderRadius: 8, padding: "10px 14px", color: "#f0f0f0",
              fontSize: 14, outline: "none"
            }}
          />
          <datalist id="admin-user-emails">
            {users.map(u => (
              <option key={u.email} value={u.email}>
                {u.name ? `${u.name} — ${u.credits} credits` : u.email}
              </option>
            ))}
          </datalist>
        </div>

        {/* Presets + custom */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Credits to Add
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {presets.map(p => (
              <button
                key={p}
                onClick={() => { setAmount(p); setCustom(""); }}
                style={{
                  padding: "8px 18px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
                  border: (amount === p && !custom) ? "2px solid #ec4899" : "2px solid #3a3a5a",
                  background: (amount === p && !custom) ? "#3a1a2e" : "#12122a",
                  color: (amount === p && !custom) ? "#ec4899" : "#aaa",
                  transition: "all 0.15s"
                }}
              >
                +{p}
              </button>
            ))}
            <input
              type="number"
              min="1"
              value={custom}
              onChange={e => setCustom(e.target.value)}
              placeholder="Custom..."
              style={{
                width: 110, background: "#12122a",
                border: custom ? "2px solid #ec4899" : "2px solid #3a3a5a",
                borderRadius: 8, padding: "8px 12px", color: "#f0f0f0",
                fontSize: 14, outline: "none"
              }}
            />
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleAdd}
          disabled={status === "loading" || isPending}
          style={{
            background: (status === "loading" || isPending) ? "#555" : "linear-gradient(135deg, #ec4899, #8b5cf6)",
            color: "#fff", border: "none", borderRadius: 9, padding: "11px 28px",
            fontSize: 15, fontWeight: 700,
            cursor: (status === "loading" || isPending) ? "not-allowed" : "pointer",
            opacity: (status === "loading" || isPending) ? 0.7 : 1,
            transition: "opacity 0.15s"
          }}
        >
          {status === "loading" ? "Adding..." : isPending ? "Updating table..." : `Add ${custom || amount} Credits →`}
        </button>

        {/* Feedback */}
        {message && (
          <div style={{
            marginTop: 12, padding: "10px 16px", borderRadius: 8, fontSize: 13,
            background: status === "success" ? "#0d2a1a" : "#2a0d0d",
            color: status === "success" ? "#34d399" : "#f87171",
            border: `1px solid ${status === "success" ? "#1e5a3a" : "#5a1e1e"}`
          }}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
