"use client";
import { useState } from "react";

// Admin credit-adjustment widget. Despite the historical filename
// "AddCreditsWidget" — kept so existing /admin imports still
// resolve — it now also handles deductions. Mode toggle picks the
// endpoint:
//
//   • Add mode    → POST /api/admin/add-credits     (delta = +amount, reason "admin_grant")
//   • Deduct mode → POST /api/admin/deduct-credits  (delta = -amount, reason "admin_deduct")
//
// Both endpoints write to User.credits AND CreditTransaction in
// one Prisma transaction so the ledger stays in lock-step with
// the live balance. Deduct refuses to drop the balance below
// zero — the API returns the user's current balance in that case
// so the admin can adjust the amount.

export default function AddCreditsWidget() {
  const [mode, setMode] = useState("add"); // "add" | "deduct"
  const [email, setEmail] = useState("");
  const [credits, setCredits] = useState(1000);
  const [note, setNote] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const isDeduct = mode === "deduct";
  const endpoint = isDeduct ? "/api/admin/deduct-credits" : "/api/admin/add-credits";

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Deductions are higher-stakes — confirm before firing.
    if (isDeduct) {
      const ok = confirm(
        `Deduct ${credits} credits from ${email}? This writes a negative CreditTransaction row and decrements User.credits.`
      );
      if (!ok) return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, credits, note: note || undefined }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 400 }}
    >
      {/* Mode toggle — segmented control */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          background: "#0a0a0a",
          border: "1px solid #333",
          borderRadius: 8,
        }}
      >
        <ModeButton
          active={!isDeduct}
          accent="#A6CC00"
          onClick={() => setMode("add")}
          label="+ Add"
        />
        <ModeButton
          active={isDeduct}
          accent="#f87171"
          onClick={() => setMode("deduct")}
          label="− Deduct"
        />
      </div>

      <input
        type="email"
        placeholder="User email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        style={{
          padding: "8px",
          borderRadius: 6,
          border: "1px solid #333",
          background: "#111",
          color: "#fff",
        }}
      />
      <input
        type="number"
        placeholder={isDeduct ? "Credits to deduct" : "Credits to add"}
        value={credits}
        onChange={(e) => setCredits(parseInt(e.target.value))}
        min={1}
        max={100000}
        required
        style={{
          padding: "8px",
          borderRadius: 6,
          border: "1px solid #333",
          background: "#111",
          color: "#fff",
        }}
      />
      {isDeduct && (
        <input
          type="text"
          placeholder="Reason / note (optional — for the audit log)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          style={{
            padding: "8px",
            borderRadius: 6,
            border: "1px solid #333",
            background: "#111",
            color: "#fff",
            fontSize: 13,
          }}
        />
      )}
      <button
        type="submit"
        disabled={loading}
        style={{
          padding: "10px",
          background: isDeduct ? "#f87171" : "#A6CC00",
          color: isDeduct ? "#fff" : "#0a0a0a",
          border: "none",
          borderRadius: 6,
          cursor: loading ? "not-allowed" : "pointer",
          fontWeight: 700,
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading
          ? isDeduct
            ? "Deducting..."
            : "Adding..."
          : isDeduct
          ? "Deduct Credits"
          : "Add Credits"}
      </button>
      {result && (
        <pre
          style={{
            fontSize: 12,
            color: result.error ? "#f87171" : "#4ade80",
            marginTop: 8,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </form>
  );
}

function ModeButton({ active, accent, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "8px 12px",
        background: active ? accent : "transparent",
        color: active ? "#0a0a0a" : "#888",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        fontWeight: 700,
        fontSize: 13,
        transition: "background 0.15s, color 0.15s",
      }}
    >
      {label}
    </button>
  );
}
