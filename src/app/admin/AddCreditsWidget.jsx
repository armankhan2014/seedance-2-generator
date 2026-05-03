"use client";
import { useState } from "react";

export default function AddCreditsWidget() {
  const [email, setEmail] = useState("");
  const [credits, setCredits] = useState(1000);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/add-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, credits }),
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
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 400 }}>
      <input
        type="email"
        placeholder="User email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
        style={{ padding: "8px", borderRadius: 6, border: "1px solid #333", background: "#111", color: "#fff" }}
      />
      <input
        type="number"
        placeholder="Credits to add"
        value={credits}
        onChange={e => setCredits(parseInt(e.target.value))}
        min={1}
        max={100000}
        required
        style={{ padding: "8px", borderRadius: 6, border: "1px solid #333", background: "#111", color: "#fff" }}
      />
      <button
        type="submit"
        disabled={loading}
        style={{ padding: "10px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
      >
        {loading ? "Adding..." : "Add Credits"}
      </button>
      {result && (
        <pre style={{ fontSize: 12, color: result.error ? "#f87171" : "#4ade80", marginTop: 8 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </form>
  );
}
