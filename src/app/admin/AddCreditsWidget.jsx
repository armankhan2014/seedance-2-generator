"use client";
import { useState } from "react";

export default function AddCreditsWidget({ users }) {
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState(100);
  const [custom, setCustom] = useState("");
  const [status, setStatus] = useState(null); // null | "loading" | "success" | "error"
  const [message, setMessage] = useState("");

  const presets = [50, 100, 500, 1000];

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
      } else {
        setStatus("error");
        setMessage(`❌ ${data.error || "Something went wrong."}`);
      }
    } catch (e) {
      setStatus("error");
      setMessage("❌ Network error. Try again.");
    }
  }

  return (
    <div style={{
      background: "#1a1a2e", borderRadius: 14, border: "1px solid #2a2a40",
      marginBottom: 32, overflow: "hidden"
    }}>
      {/* Header */}
      <div style={{ padding: "18px 22px", borderBottom: "1px solid #2a2a40", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 18 }}>💎</span>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Add Credits to User</h2>
      </div>

      <div style={{ padding: "22px 22px" }}>
        {/* Email selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            User Email
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="user@example.com"
              list="admin-user-emails"
              style={{
                flex: 1, background: "#12122a", border: "1px solid #3a3a5a",
                borderRadius: 8, padding: "10px 14px", color: "#f0f0f0",
                fontSize: 14, outline: "none"
              }}
            />
            <datalist id="admin-user-emails">
              {users.map(u => <option key={u.email} value={u.email}>{u.name ? `${u.name} (${u.email})` : u.email}</option>)}
            </datalist>
          </div>
        </div>

        {/* Credit presets */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Credits to Add
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                width: 110, background: "#12122a", border: custom ? "2px solid #ec4899" : "2px solid #3a3a5a",
                borderRadius: 8, padding: "8px 12px", color: "#f0f0f0", fontSize: 14, outline: "none"
              }}
            />
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleAdd}
          disabled={status === "loading"}
          style={{
            background: status === "loading" ? "#555" : "linear-gradient(135deg, #ec4899, #8b5cf6)",
            color: "#fff", border: "none", borderRadius: 9, padding: "11px 28px",
            fontSize: 15, fontWeight: 700, cursor: status === "loading" ? "not-allowed" : "pointer",
            transition: "opacity 0.15s", opacity: status === "loading" ? 0.7 : 1
          }}
        >
          {status === "loading" ? "Adding..." : `Add ${custom || amount} Credits →`}
        </button>

        {/* Status message */}
        {message && (
          <div style={{
            marginTop: 14, padding: "10px 16px", borderRadius: 8, fontSize: 13,
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
