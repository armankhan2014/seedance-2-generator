"use client";
export const dynamic = "force-dynamic";
import { useSession, signIn } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

const PLANS = [
  { id: "starter", n: "Starter",      c: 3000,  p: 10  },
  { id: "power",   n: "Power Engine", c: 7000,  p: 35, hot: true },
  { id: "quantum", n: "Quantum Flow", c: 24000, p: 120 }
];

export default function Page() {
  const { data: session, update: updateSession } = useSession();
  const [loading, setLoading] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success"); // "success" | "error"
  const [verifying, setVerifying] = useState(false);
  const searchParams = useSearchParams();
  const verified = useRef(false);

  useEffect(() => {
    const success = searchParams?.get("success") === "true";
    const sessionId = searchParams?.get("session_id");

    if (success && sessionId && !verified.current) {
      verified.current = true;
      verifyPayment(sessionId);
    } else if (success && !sessionId) {
      // Legacy: no session_id (old purchase links)
      setMessage("✅ Payment successful! Credits may take a moment to appear.");
      setMessageType("success");
    }
  }, [searchParams]);

  async function verifyPayment(sessionId) {
    setVerifying(true);
    setMessage("⏳ Verifying your payment...");
    setMessageType("success");

    try {
      const res = await fetch("/api/stripe/verify-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId })
      });
      const data = await res.json();

      if (data.success) {
        if (data.alreadyRedeemed) {
          setMessage(`✅ Credits already applied! Your balance: ${data.credits.toLocaleString()} credits.`);
        } else {
          setMessage(`🎉 ${data.creditsAdded.toLocaleString()} credits added! New balance: ${data.credits.toLocaleString()} credits.`);
        }
        setMessageType("success");
        // Refresh session so navbar updates
        await updateSession();
      } else {
        setMessage(`⚠️ ${data.error || "Could not verify payment. Contact support if credits are missing."}`);
        setMessageType("error");
      }
    } catch (err) {
      setMessage("⚠️ Could not verify payment automatically. Your credits will be added shortly.");
      setMessageType("error");
    } finally {
      setVerifying(false);
    }
  }

  async function buy(id) {
    if (!session) { signIn("google"); return; }
    setLoading(id);
    try {
      const r = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: id })
      });
      const d = await r.json();
      if (d.url) window.location.href = d.url;
      else { setMessage("Error: " + (d.error || "unknown")); setMessageType("error"); }
    } catch (e) {
      setMessage("Error: " + e.message);
      setMessageType("error");
    }
    setLoading(null);
  }

  const msgStyle = {
    textAlign: "center",
    padding: "12px 16px",
    borderRadius: "8px",
    marginBottom: 24,
    background: messageType === "success" ? "rgba(139,92,246,.12)" : "rgba(239,68,68,.12)",
    color: messageType === "success" ? "#a78bfa" : "#f87171",
    border: messageType === "success" ? "1px solid rgba(139,92,246,.3)" : "1px solid rgba(239,68,68,.3)",
    fontSize: ".9rem"
  };

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "Inter,sans-serif", padding: "60px 20px" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <h1 style={{ textAlign: "center", color: "#fff", fontSize: "2rem", fontWeight: 900, marginBottom: 8 }}>
          Simple Pricing
        </h1>
        <p style={{ textAlign: "center", color: "#64748b", marginBottom: 40 }}>
          Buy credits once. No subscriptions. Never expire.
        </p>

        {message && (
          <div style={msgStyle}>
            {verifying && <span style={{ marginRight: 8 }}>⏳</span>}
            {message}
          </div>
        )}

        {session?.user?.credits !== undefined && (
          <p style={{ textAlign: "center", color: "#8b5cf6", fontSize: ".85rem", marginBottom: 24, fontWeight: 600 }}>
            ⚡ Your current balance: {(session.user.credits).toLocaleString()} credits
          </p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
          {PLANS.map(plan => (
            <div key={plan.id} style={{
              background: "#111",
              border: plan.hot ? "1px solid #8b5cf6" : "1px solid rgba(255,255,255,.08)",
              borderRadius: 16,
              padding: "32px 24px",
              position: "relative"
            }}>
              {plan.hot && (
                <div style={{
                  position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
                  background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", color: "#fff",
                  fontSize: ".7rem", fontWeight: 700, padding: "3px 14px", borderRadius: 50
                }}>Most Popular</div>
              )}
              <div style={{ fontSize: ".75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>
                {plan.n}
              </div>
              <div style={{ fontSize: "2.4rem", fontWeight: 900, color: "#fff", marginBottom: 4 }}>
                <sup style={{ fontSize: "1.1rem", verticalAlign: "top", marginTop: 6 }}>$</sup>{plan.p}
              </div>
              <div style={{ fontSize: ".82rem", color: "#8b5cf6", fontWeight: 600, marginBottom: 24 }}>
                {plan.c.toLocaleString()} Credits
              </div>
              <button
                onClick={() => buy(plan.id)}
                disabled={loading === plan.id || verifying}
                style={{
                  width: "100%", padding: "11px", borderRadius: 9, fontSize: ".88rem", fontWeight: 700,
                  cursor: (loading === plan.id || verifying) ? "not-allowed" : "pointer",
                  border: plan.hot ? "none" : "1px solid rgba(255,255,255,.12)",
                  background: plan.hot ? "linear-gradient(135deg,#8b5cf6,#7c3aed)" : "transparent",
                  color: plan.hot ? "#fff" : "#94a3b8",
                  fontFamily: "inherit",
                  opacity: (loading === plan.id || verifying) ? 0.5 : 1
                }}
              >
                {loading === plan.id ? "Redirecting..." : (session ? "Buy Credits" : "Sign in to Buy")}
              </button>
            </div>
          ))}
        </div>
        <p style={{ textAlign: "center", color: "#475569", fontSize: ".75rem", marginTop: 28 }}>
          Secure payments via Stripe. Credits never expire.
        </p>
      </div>
    </div>
  );
}
