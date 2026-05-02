"use client";
import { useSession, signIn } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import toast from "@/lib/toast";

const CREDITS_PER_DOLLAR = 80;

const PLANS = [
  { id: "starter",  n: "Starter",      c: 3000,  p: 37.50, v15: 9,  v10: 15, v5: 25 },
  { id: "power",    n: "Power Engine", c: 7000,  p: 87.50, v15: 21, v10: 35, v5: 58, hot: true },
  { id: "quantum",  n: "Quantum Flow", c: 24000, p: 300,   v15: 75, v10: 120, v5: 200 },
];

// ── Currency detection + live exchange rates ───────────────────────────────────
// Maps ISO currency code → display symbol
const CURRENCY_SYMBOLS = {
  USD: "$", GBP: "£", EUR: "€", PKR: "₨", INR: "₹",
  AUD: "A$", CAD: "C$", AED: "AED ", SAR: "SAR ", TRY: "₺",
  BRL: "R$", MXN: "$", NGN: "₦", ZAR: "R", JPY: "¥",
  KRW: "₩", CNY: "¥", BDT: "৳", EGP: "E£", MYR: "RM ",
  SGD: "S$", HKD: "HK$", SEK: "kr", NOK: "kr", DKK: "kr",
  CHF: "Fr", NZD: "NZ$", QAR: "QAR ", KWD: "KD ", BHD: "BD ",
  OMR: "OMR ", LKR: "Rs", NPR: "Rs", THB: "฿", PHP: "₱",
  IDR: "Rp", VND: "₫",
};

// Zero-decimal currencies — don't show cents
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "IDR"]);

function useCurrency() {
  const [currency, setCurrency] = useState({ code: "USD", symbol: "$", rate: 1, loading: true });

  useEffect(() => {
    const CACHE_KEY = "sdance_currency";
    const CACHE_TTL = 3600 * 1000; // 1 hour

    const cached = (() => {
      try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const { data, ts } = JSON.parse(raw);
        if (Date.now() - ts > CACHE_TTL) return null;
        return data;
      } catch { return null; }
    })();

    if (cached) {
      setCurrency({ ...cached, loading: false });
      return;
    }

    (async () => {
      try {
        // 1. Detect user's currency via IP geolocation (free, no key needed)
        const geoRes = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(4000) });
        const geo = await geoRes.json();
        const code = geo?.currency || "USD";
        const symbol = CURRENCY_SYMBOLS[code] || code + " ";

        if (code === "USD") {
          const data = { code, symbol, rate: 1 };
          try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch {}
          setCurrency({ ...data, loading: false });
          return;
        }

        // 2. Fetch live exchange rate (free, no key needed)
        const fxRes = await fetch(
          `https://open.er-api.com/v6/latest/USD`,
          { signal: AbortSignal.timeout(5000) }
        );
        const fx = await fxRes.json();
        const rate = fx?.rates?.[code];

        if (!rate) throw new Error("No rate for " + code);

        const data = { code, symbol, rate };
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch {}
        setCurrency({ ...data, loading: false });
      } catch {
        // Silently fall back to USD
        setCurrency({ code: "USD", symbol: "$", rate: 1, loading: false });
      }
    })();
  }, []);

  return currency;
}

function formatPrice(usdAmount, { code, symbol, rate }) {
  const converted = usdAmount * rate;
  const isZeroDecimal = ZERO_DECIMAL.has(code);

  if (code === "USD") {
    return { whole: Math.floor(converted), cents: ".00".slice(0, 3) };
  }

  if (isZeroDecimal) {
    return { whole: Math.round(converted), cents: "" };
  }

  // Round to 2 decimal places; show 0 cents as blank for cleanliness
  const rounded = Math.round(converted * 100) / 100;
  const whole = Math.floor(rounded);
  const decimal = Math.round((rounded - whole) * 100);
  return {
    whole,
    cents: decimal === 0 ? "" : "." + String(decimal).padStart(2, "0"),
  };
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function PricingClient() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(null);
  const [message, setMessage] = useState("");
  const [customDollars, setCustomDollars] = useState("");
  const [liveCredits, setLiveCredits] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const searchParams = useSearchParams();
  const success = searchParams?.get("success") === "true";
  const successCredits = searchParams?.get("credits");
  const successSessionId = searchParams?.get("session_id");

  const cur = useCurrency();
  const isUSD = cur.code === "USD";

  const fetchLiveCredits = async () => {
    try {
      const r = await fetch("/api/user/credits", { cache: "no-store" });
      if (r.ok) { const d = await r.json(); setLiveCredits(d.credits); return d.credits; }
    } catch {}
    return null;
  };

  useEffect(() => { if (session) fetchLiveCredits(); }, [session]);

  useEffect(() => {
    if (!success || !session) return;
    const purchased = parseInt(successCredits || "0");
    const added = purchased.toLocaleString();
    setMessage(`✅ Payment successful! ${added} credits added to your account.`);
    toast.success(`${added} credits added to your account!`);
    const optimistic = (session?.user?.credits ?? 0) + purchased;
    setLiveCredits(prev => Math.max(prev ?? 0, optimistic));
    if (successSessionId) {
      setVerifying(true);
      fetch(`/api/stripe/verify?session_id=${successSessionId}`, { cache: "no-store" })
        .then(r => r.json())
        .then(data => { if (data.credits !== undefined) setLiveCredits(data.credits); })
        .catch(() => {})
        .finally(() => setVerifying(false));
    }
  }, [success, session?.user?.id]);

  const customAmount = parseInt(customDollars) || 0;
  const customCredits = customAmount * CREDITS_PER_DOLLAR;

  async function buy(id) {
    if (!session) { signIn("google"); return; }
    setLoading(id);
    setMessage("");
    try {
      const body = id === "custom" ? { plan: "custom", amount: customAmount } : { plan: id };
      const r = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.url) window.location.href = d.url;
      else { const msg = "Error: " + (d.error || "unknown"); setMessage(msg); toast.error(msg); }
    } catch (e) { const msg = "Error: " + e.message; setMessage(msg); toast.error(msg); }
    setLoading(null);
  }

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "Inter,sans-serif", padding: "60px 20px" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>
        <h1 style={{ textAlign: "center", color: "#fff", fontSize: "2rem", fontWeight: 900, marginBottom: 8 }}>Simple Pricing</h1>
        <p style={{ textAlign: "center", color: "#64748b", marginBottom: !isUSD ? 8 : 40 }}>Buy credits once. No subscriptions. Never expire.</p>

        {/* Local currency badge */}
        {!cur.loading && !isUSD && (
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)",
              borderRadius: 50, padding: "5px 14px", fontSize: ".75rem", color: "#a78bfa", fontWeight: 600,
            }}>
              <span style={{ fontSize: "1em" }}>🌍</span>
              Prices shown in <strong style={{ color: "#c4b5fd" }}>{cur.code}</strong> &nbsp;·&nbsp;
              <span style={{ color: "#64748b", fontWeight: 400 }}>Charged in USD at checkout</span>
            </span>
          </div>
        )}

        {message && (
          <div style={{ textAlign: "center", padding: "10px", borderRadius: "8px", marginBottom: 24, background: "rgba(139,92,246,.1)", color: "#a78bfa", border: "1px solid rgba(139,92,246,.3)" }}>
            {message}
          </div>
        )}

        {session && liveCredits !== null && (
          <p style={{ textAlign: "center", color: "#8b5cf6", fontSize: ".85rem", marginBottom: 24, fontWeight: 600, opacity: verifying ? 0.7 : 1, transition: "opacity 0.3s" }}>
            {verifying ? "⏳" : "⚡"} Your current balance: {liveCredits.toLocaleString()} credits
          </p>
        )}

        {/* Fixed plans */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20, marginBottom: 20 }}>
          {PLANS.map(plan => {
            const { whole, cents } = formatPrice(plan.p, cur);
            return (
              <div key={plan.id} style={{ background: "#111", border: plan.hot ? "1px solid #8b5cf6" : "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: "32px 24px", position: "relative" }}>
                {plan.hot && (
                  <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", color: "#fff", fontSize: ".7rem", fontWeight: 700, padding: "3px 14px", borderRadius: 50 }}>
                    Most Popular
                  </div>
                )}
                <div style={{ fontSize: ".75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>{plan.n}</div>

                {/* Price display */}
                <div style={{ marginBottom: 4 }}>
                  {cur.loading ? (
                    <div style={{ height: 52, background: "rgba(255,255,255,0.05)", borderRadius: 8, animation: "pulse 1.5s infinite" }} />
                  ) : (
                    <div style={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                      <sup style={{ fontSize: "1.1rem", verticalAlign: "top", marginTop: 6, color: "#fff", fontWeight: 900 }}>{cur.symbol}</sup>
                      <span style={{ fontSize: "2.4rem", fontWeight: 900, color: "#fff" }}>{whole.toLocaleString()}</span>
                      {cents && <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#94a3b8", alignSelf: "flex-end", marginBottom: 4 }}>{cents}</span>}
                    </div>
                  )}
                  {!isUSD && !cur.loading && (
                    <div style={{ fontSize: ".68rem", color: "#475569", marginTop: 2 }}>≈ ${plan.p} USD</div>
                  )}
                </div>

                <div style={{ fontSize: ".82rem", color: "#8b5cf6", fontWeight: 600, marginBottom: 8 }}>{plan.c.toLocaleString()} Credits</div>

                {/* Video count hook */}
                <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 10, padding: "10px 12px", marginBottom: 16 }}>
                  <div style={{ fontSize: ".78rem", fontWeight: 800, color: "#e2e8f0", marginBottom: 4 }}>
                    🎬 Up to <span style={{ color: "#a78bfa" }}>{plan.v15} full videos</span> (15s each)
                  </div>
                  <div style={{ fontSize: ".7rem", color: "#64748b", lineHeight: 1.5 }}>
                    Or <strong style={{ color: "#94a3b8" }}>{plan.v10} videos</strong> at 10s · <strong style={{ color: "#94a3b8" }}>{plan.v5} clips</strong> at 5s
                  </div>
                  <div style={{ fontSize: ".65rem", color: "#475569", marginTop: 4, fontStyle: "italic" }}>
                    Shorter videos = more content from your credits
                  </div>
                </div>

                <button
                  onClick={() => buy(plan.id)}
                  disabled={loading === plan.id}
                  style={{ width: "100%", padding: "11px", borderRadius: 9, fontSize: ".88rem", fontWeight: 700, cursor: loading === plan.id ? "wait" : "pointer", border: plan.hot ? "none" : "1px solid rgba(255,255,255,.12)", background: plan.hot ? "linear-gradient(135deg,#8b5cf6,#7c3aed)" : "transparent", color: plan.hot ? "#fff" : "#94a3b8", fontFamily: "inherit", opacity: loading === plan.id ? 0.5 : 1 }}
                >
                  {loading === plan.id ? "Redirecting…" : (session ? "Buy Credits" : "Sign in to Buy")}
                </button>
              </div>
            );
          })}
        </div>

        {/* Custom credits card */}
        <div style={{ background: "#111", border: "1px solid rgba(139,92,246,0.35)", borderRadius: 16, padding: "32px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ fontSize: ".75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "1px" }}>Custom Amount</div>
            <div style={{ fontSize: ".68rem", fontWeight: 600, color: "#a78bfa", background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 50, padding: "2px 10px" }}>
              $1 = {CREDITS_PER_DOLLAR} credits
            </div>
          </div>
          <p style={{ fontSize: ".82rem", color: "#475569", marginBottom: 20, marginTop: 0 }}>
            Need an exact amount? Enter any dollar value and get exactly {CREDITS_PER_DOLLAR} credits per dollar.
          </p>

          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* Dollar input */}
            <div style={{ flex: "1 1 180px" }}>
              <label style={{ display: "block", fontSize: ".72rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                Amount (USD)
              </label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#8b5cf6", fontWeight: 700, fontSize: "1rem", pointerEvents: "none" }}>$</span>
                <input
                  type="number" min="1" step="1" placeholder="e.g. 5"
                  value={customDollars}
                  onChange={e => setCustomDollars(e.target.value.replace(/[^0-9]/g, ""))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px 10px 28px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 9, color: "#fff", fontSize: "1rem", fontWeight: 700, fontFamily: "inherit", outline: "none" }}
                />
              </div>
              {!isUSD && customAmount >= 1 && !cur.loading && (
                <div style={{ fontSize: ".7rem", color: "#475569", marginTop: 5 }}>
                  ≈ {cur.symbol}{Math.round(customAmount * cur.rate).toLocaleString()} {cur.code}
                </div>
              )}
            </div>

            {/* Credits preview */}
            <div style={{ flex: "1 1 160px", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <label style={{ display: "block", fontSize: ".72rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                You will get
              </label>
              <div style={{ padding: "10px 14px", background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 9, minHeight: 42, display: "flex", alignItems: "center" }}>
                <span style={{ fontSize: customCredits > 0 ? "1.1rem" : ".9rem", fontWeight: 800, color: customCredits > 0 ? "#a78bfa" : "#334155" }}>
                  {customCredits > 0 ? `⚡ ${customCredits.toLocaleString()} credits` : "Enter amount above"}
                </span>
              </div>
            </div>

            {/* Buy button */}
            <div style={{ flex: "1 1 140px", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <label style={{ display: "block", fontSize: ".72rem", fontWeight: 600, color: "transparent", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, userSelect: "none" }}>&nbsp;</label>
              <button
                onClick={() => buy("custom")}
                disabled={customAmount < 1 || loading === "custom"}
                style={{ padding: "11px 20px", borderRadius: 9, fontSize: ".88rem", fontWeight: 700, cursor: customAmount < 1 || loading === "custom" ? "not-allowed" : "pointer", border: "none", background: customAmount >= 1 ? "linear-gradient(135deg,#8b5cf6,#7c3aed)" : "rgba(255,255,255,0.06)", color: customAmount >= 1 ? "#fff" : "#475569", fontFamily: "inherit", opacity: loading === "custom" ? 0.5 : 1, whiteSpace: "nowrap", width: "100%" }}
              >
                {loading === "custom" ? "Redirecting…" : customAmount >= 1 ? `Pay $${customAmount}` : session ? "Enter Amount" : "Sign in to Buy"}
              </button>
            </div>
          </div>
        </div>

        <p style={{ textAlign: "center", color: "#475569", fontSize: ".75rem", marginTop: 28 }}>
          Secure payments via Stripe · Credits never expire{!isUSD && !cur.loading ? ` · Prices shown in ${cur.code} for reference` : ""}
        </p>

        {/* FAQ */}
        <div style={{ marginTop: 60 }}>
          <h2 style={{ textAlign: "center", color: "#fff", fontSize: "1.2rem", fontWeight: 800, marginBottom: 8 }}>Frequently Asked Questions</h2>
          <p style={{ textAlign: "center", color: "#475569", fontSize: ".82rem", marginBottom: 32 }}>Everything you need to know before buying.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { q: "Do credits expire?", a: "No. Credits never expire — they stay in your account until you use them. Buy once and generate videos whenever you're ready." },
              { q: "What payment methods are accepted?", a: "We accept all major credit and debit cards (Visa, Mastercard, American Express, Discover) as well as Apple Pay and Google Pay, processed securely through Stripe." },
              { q: "What is your refund policy?", a: "We offer refunds on unused credit purchases within 7 days of the transaction, provided no credits from that purchase have been spent. If you've already used credits or it's been more than 7 days, we're unable to issue a refund. To request one, reach out to us and we'll sort it out." },
              { q: "How many credits does a video cost?", a: "The cost depends on duration, resolution, and quality. A standard 5-second 720p video costs 120 credits. Higher resolution (1080p) and quality (High) settings use more credits. You can see the exact cost before you generate." },
              { q: "Can I top up anytime?", a: "Yes — there are no subscriptions or lock-ins. You can buy more credits at any time, in any amount, and they stack with your existing balance." },
              { q: "Why is the checkout in USD?", a: "All payments are processed in USD via Stripe. The prices shown on this page in your local currency are for reference only, so you can easily compare. Your card or bank will handle the currency conversion at the current market rate." },
            ].map(({ q, a }) => <FaqItem key={q} q={q} a={a} />)}
          </div>
        </div>

      </div>
      <style jsx global>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
    </div>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden", transition: "border-color 0.2s", ...(open ? { borderColor: "rgba(139,92,246,0.35)" } : {}) }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left", gap: 12, fontFamily: "inherit" }}
      >
        <span style={{ fontSize: ".9rem", fontWeight: 700, color: "#e2e8f0" }}>{q}</span>
        <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", background: open ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", color: open ? "#a78bfa" : "#64748b", fontSize: "1rem", fontWeight: 700, lineHeight: 1, transition: "all 0.2s" }}>
          {open ? "−" : "+"}
        </span>
      </button>
      {open && <p style={{ margin: 0, padding: "0 20px 18px", fontSize: ".85rem", color: "#94a3b8", lineHeight: 1.7 }}>{a}</p>}
    </div>
  );
}
