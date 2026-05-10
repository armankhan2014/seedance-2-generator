"use client";
import { useSession, signIn } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Script from "next/script";
import toast from "@/lib/toast";

// GBP is the price base. Custom amounts use this rate (matches the
// Starter tier's 450 credits / £3.50 ≈ 128.6 — rounded down so a
// custom buy never beats the worst fixed plan).
const CREDITS_PER_POUND = 128;

// Five-tier menu, GBP. `c` = credits, `p` = price in GBP. We deliberately
// don't surface "you can make N videos" copy anywhere — credits are the
// unit. The blurb on each card is positioning, not a count.
const PLANS = [
  {
    id: "starter",
    n: "Starter",
    c: 450,
    p: 3.50,
    blurb: "Get a feel for the tool",
    accent: "#94a3b8",
  },
  {
    id: "creator",
    n: "Creator",
    c: 1350,
    p: 10,
    blurb: "Casual creator workflow",
    accent: "#a3e635",
  },
  {
    id: "pro",
    n: "Pro",
    c: 3150,
    p: 23,
    blurb: "The sweet spot for most creators",
    accent: "#D9FF00",
    hot: true,
  },
  {
    id: "studio",
    n: "Studio",
    c: 6750,
    p: 49,
    blurb: "Production-grade volume",
    accent: "#60a5fa",
  },
  {
    id: "agency",
    n: "Agency",
    c: 15750,
    p: 115,
    blurb: "Heavy bulk for serious users",
    accent: "#a78bfa",
  },
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
  // Base is GBP — rate is "how many <code> per 1 GBP". A US viewer
  // gets rate ≈ 1.27 (so £3.50 → $4.45). A GBP viewer's rate is 1.0.
  const [currency, setCurrency] = useState({ code: "GBP", symbol: "£", rate: 1, loading: true });

  useEffect(() => {
    // v2 cache key — invalidates the previous USD-base cache so
    // returning visitors don't read a stale USD rate as GBP.
    const CACHE_KEY = "sdance_currency_v2";
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
        const geoRes = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(4000) });
        const geo = await geoRes.json();
        const code = geo?.currency || "GBP";
        const symbol = CURRENCY_SYMBOLS[code] || code + " ";

        if (code === "GBP") {
          const data = { code, symbol, rate: 1 };
          try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch {}
          setCurrency({ ...data, loading: false });
          return;
        }

        const fxRes = await fetch(
          `https://open.er-api.com/v6/latest/GBP`,
          { signal: AbortSignal.timeout(5000) }
        );
        const fx = await fxRes.json();
        const rate = fx?.rates?.[code];

        if (!rate) throw new Error("No rate for " + code);

        const data = { code, symbol, rate };
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch {}
        setCurrency({ ...data, loading: false });
      } catch {
        setCurrency({ code: "GBP", symbol: "£", rate: 1, loading: false });
      }
    })();
  }, []);

  return currency;
}

function formatPrice(gbpAmount, { code, symbol, rate }) {
  const converted = gbpAmount * rate;
  const isZeroDecimal = ZERO_DECIMAL.has(code);

  if (code === "GBP") {
    const rounded = Math.round(converted * 100) / 100;
    const whole = Math.floor(rounded);
    const decimal = Math.round((rounded - whole) * 100);
    return {
      whole,
      cents: decimal === 0 ? "" : "." + String(decimal).padStart(2, "0"),
    };
  }

  if (isZeroDecimal) {
    return { whole: Math.round(converted), cents: "" };
  }

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
  const isBase = cur.code === "GBP";

  const fetchLiveCredits = async () => {
    try {
      const r = await fetch("/api/user/credits", { cache: "no-store" });
      if (r.ok) { const d = await r.json(); setLiveCredits(d.credits); return d.credits; }
    } catch {}
    return null;
  };

  useEffect(() => { if (session) fetchLiveCredits(); }, [session]);

  // Cursor spotlight — follows the pointer with a soft lime glow.
  // Disabled on touch devices via `(hover: hover)`. The element itself
  // is rendered in the JSX below (id="cursorSpotlight").
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(hover: hover)").matches) return;
    const spotlight = document.getElementById("cursorSpotlight");
    if (!spotlight) return;
    const onMove = (e) => {
      // 300 = half of the 600px spotlight box, so the radial centre
      // sits exactly under the cursor.
      spotlight.style.transform = `translate(${e.clientX - 300}px, ${e.clientY - 300}px)`;
    };
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, []);

  // 3D tilt — fires once vanilla-tilt has loaded from the CDN. Skipped
  // on touch devices. Re-runs on every render to catch any newly-
  // mounted cards (e.g. when the success message appears after
  // checkout).
  const tiltInitialised = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(hover: hover)").matches) return;
    const init = () => {
      if (!window.VanillaTilt) return;
      const cards = document.querySelectorAll(".pricing-card");
      // Guard so we don't double-init the same elements; vanilla-tilt
      // stores its instance on `__vanilla-tilt`.
      const fresh = Array.from(cards).filter((el) => !el["vanillaTilt"]);
      if (fresh.length === 0) return;
      window.VanillaTilt.init(fresh, {
        max: 10,
        speed: 400,
        glare: true,
        "max-glare": 0.3,
        perspective: 1000,
        scale: 1.02,
      });
      tiltInitialised.current = true;
    };
    // Try immediately in case the script already loaded; otherwise the
    // Script's onLoad below will call this.
    init();
    window.__initPricingTilt = init;
    return () => { delete window.__initPricingTilt; };
  });

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
  const customGbpEquivalent = isBase ? customAmount : customAmount / (cur.rate || 1);
  const customCredits = Math.floor(customGbpEquivalent * CREDITS_PER_POUND);

  async function buy(id) {
    if (!session) { window.dispatchEvent(new CustomEvent("openSignIn")); return; }
    setLoading(id);
    setMessage("");
    try {
      const body = id === "custom"
        ? { plan: "custom", amount: customAmount, currency: cur.code, rate: cur.rate }
        : { plan: id, currency: cur.code, rate: cur.rate };
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
    <div
      style={{
        background: "#0a0a0a",
        minHeight: "100vh",
        fontFamily: "Inter,sans-serif",
        padding: "72px 20px 40px",
        backgroundImage:
          "radial-gradient(1100px 600px at 50% -10%, rgba(217,255,0,0.08), transparent 60%), radial-gradient(800px 400px at 80% 20%, rgba(167,139,250,0.05), transparent 60%)",
        position: "relative",
      }}
    >
      {/* Cursor-following spotlight glow. pointer-events: none so it
          never blocks clicks on cards or buttons; @media (hover:none)
          hides it on touch devices via the global style block below. */}
      <div className="cursor-spotlight" id="cursorSpotlight" />

      {/* vanilla-tilt CDN. Tilts the .pricing-card elements only on
          devices that support hover (desktop). The onLoad calls our
          init helper stashed on window from the useEffect above. */}
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/vanilla-tilt/1.8.1/vanilla-tilt.min.js"
        strategy="afterInteractive"
        onLoad={() => {
          if (typeof window !== "undefined" && window.__initPricingTilt) {
            window.__initPricingTilt();
          }
        }}
      />
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        {/* ── Hero ────────────────────────────────────────────────── */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.42em",
              textTransform: "uppercase",
              color: "#A6CC00",
              margin: 0,
            }}
          >
            Pricing
          </p>
          <h1
            style={{
              margin: "10px 0 8px",
              color: "#fff",
              fontSize: "clamp(2rem, 4vw, 2.8rem)",
              fontWeight: 900,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            Pricing that gets out of your way.
          </h1>
          <p style={{ margin: 0, color: "#94a3b8", fontSize: ".95rem", lineHeight: 1.6 }}>
            Buy credits once. No subscriptions. No expiry.
          </p>

          {/* Local-currency badge */}
          {!cur.loading && !isBase && (
            <div style={{ marginTop: 14 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(217, 255, 0,0.1)",
                  border: "1px solid rgba(217, 255, 0,0.25)",
                  borderRadius: 50,
                  padding: "5px 14px",
                  fontSize: ".75rem",
                  color: "#D9FF00",
                  fontWeight: 600,
                }}
              >
                <span style={{ fontSize: "1em" }}>🌍</span>
                Prices &amp; checkout in{" "}
                <strong style={{ color: "#D9FF00" }}>{cur.code}</strong>
              </span>
            </div>
          )}

          {/* Trust strip */}
          <div
            style={{
              marginTop: 20,
              display: "inline-flex",
              flexWrap: "wrap",
              gap: 18,
              justifyContent: "center",
              fontSize: ".72rem",
              color: "#64748b",
              fontWeight: 500,
            }}
          >
            <span><span style={{ color: "#D9FF00" }}>♾️</span> Credits never expire</span>
            <span><span style={{ color: "#D9FF00" }}>🔒</span> Secure Stripe checkout</span>
            <span><span style={{ color: "#D9FF00" }}>↩️</span> 7-day refund window</span>
            <span><span style={{ color: "#D9FF00" }}>🌍</span> Charged in your currency</span>
          </div>
        </div>

        {/* ── Status messages ─────────────────────────────────────── */}
        {message && (
          <div
            style={{
              textAlign: "center",
              padding: "10px",
              borderRadius: 8,
              marginBottom: 18,
              background: "rgba(217, 255, 0,.1)",
              color: "#D9FF00",
              border: "1px solid rgba(217, 255, 0,.3)",
            }}
          >
            {message}
          </div>
        )}
        {session && liveCredits !== null && (
          <p
            style={{
              textAlign: "center",
              color: "#D9FF00",
              fontSize: ".82rem",
              marginBottom: 22,
              fontWeight: 600,
              opacity: verifying ? 0.7 : 1,
              transition: "opacity 0.3s",
            }}
          >
            {verifying ? "⏳" : "⚡"} Your balance:{" "}
            {liveCredits.toLocaleString()} credits
          </p>
        )}

        {/* ── Plan cards ──────────────────────────────────────────── */}
        <div
          className="pricing-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 14,
            marginBottom: 24,
          }}
        >
          {PLANS.map((plan) => {
            const { whole, cents } = formatPrice(plan.p, cur);
            const isPro = plan.hot;
            return (
              // Outer wrapper owns the static lift (only Pro). The
              // inner .pricing-card is what vanilla-tilt mutates, so
              // its transform doesn't fight the translateY.
              <div
                key={plan.id}
                style={{
                  transform: isPro ? "translateY(-6px)" : "none",
                  position: "relative",
                  zIndex: 2,
                }}
              >
              <div
                className="pricing-card"
                style={{
                  position: "relative",
                  // Cards sit above the cursor spotlight (z-index 1).
                  zIndex: 1,
                  // Required for vanilla-tilt's perspective + glare.
                  transformStyle: "preserve-3d",
                  transition: "transform 0.3s ease",
                  background: isPro
                    ? "linear-gradient(180deg, rgba(217,255,0,0.10) 0%, rgba(217,255,0,0.02) 60%, #0d0d0f 100%)"
                    : "#0d0d0f",
                  border: isPro
                    ? "1px solid rgba(217,255,0,0.55)"
                    : "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 18,
                  padding: isPro ? "36px 22px 22px" : "28px 22px 22px",
                  boxShadow: isPro
                    ? "0 0 0 1px rgba(217,255,0,0.18), 0 22px 48px -14px rgba(217,255,0,0.20), 0 18px 60px -20px rgba(0,0,0,0.6)"
                    : "0 4px 14px -8px rgba(0,0,0,0.4)",
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 280,
                }}
              >
                {/* Tier accent dot */}
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: plan.accent,
                    boxShadow: `0 0 10px ${plan.accent}80`,
                    marginBottom: 12,
                  }}
                />

                {isPro && (
                  <div
                    style={{
                      position: "absolute",
                      top: -12,
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "linear-gradient(135deg,#D9FF00,#A6CC00)",
                      color: "#000",
                      fontSize: ".66rem",
                      fontWeight: 800,
                      padding: "4px 14px",
                      borderRadius: 50,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}
                  >
                    ⭐ Most Popular
                  </div>
                )}

                <div
                  style={{
                    fontSize: ".68rem",
                    fontWeight: 800,
                    color: isPro ? "#D9FF00" : "#94a3b8",
                    textTransform: "uppercase",
                    letterSpacing: "0.16em",
                    marginBottom: 10,
                  }}
                >
                  {plan.n}
                </div>

                {/* Price */}
                <div style={{ marginBottom: 6 }}>
                  {cur.loading ? (
                    <div
                      style={{
                        height: 44,
                        background: "rgba(255,255,255,0.05)",
                        borderRadius: 8,
                        animation: "pulse 1.5s infinite",
                      }}
                    />
                  ) : (
                    <div style={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                      <sup
                        style={{
                          fontSize: ".95rem",
                          verticalAlign: "top",
                          marginTop: 6,
                          color: "#fff",
                          fontWeight: 800,
                        }}
                      >
                        {cur.symbol}
                      </sup>
                      <span
                        style={{
                          fontSize: "2.1rem",
                          fontWeight: 900,
                          color: "#fff",
                          lineHeight: 1,
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {whole.toLocaleString()}
                      </span>
                      {cents && (
                        <span
                          style={{
                            fontSize: ".95rem",
                            fontWeight: 700,
                            color: "#94a3b8",
                            alignSelf: "flex-end",
                            marginBottom: 4,
                          }}
                        >
                          {cents}
                        </span>
                      )}
                    </div>
                  )}
                  {!isBase && !cur.loading && (
                    <div style={{ fontSize: ".66rem", color: "#475569", marginTop: 2 }}>
                      ≈ £{plan.p} GBP
                    </div>
                  )}
                </div>

                {/* Credits chip */}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    alignSelf: "flex-start",
                    background: isPro
                      ? "rgba(217,255,0,0.12)"
                      : "rgba(255,255,255,0.04)",
                    border: isPro
                      ? "1px solid rgba(217,255,0,0.30)"
                      : "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 999,
                    padding: "4px 10px",
                    fontSize: ".74rem",
                    fontWeight: 700,
                    color: isPro ? "#D9FF00" : "#cbd5e1",
                    marginBottom: 14,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  ⚡ {plan.c.toLocaleString()} credits
                </div>

                {/* Blurb */}
                <p
                  style={{
                    margin: 0,
                    fontSize: ".82rem",
                    color: "#94a3b8",
                    lineHeight: 1.5,
                    flex: 1,
                  }}
                >
                  {plan.blurb}
                </p>

                {/* Buy button */}
                <button
                  onClick={() => buy(plan.id)}
                  disabled={loading === plan.id}
                  style={{
                    marginTop: 16,
                    width: "100%",
                    padding: "11px",
                    borderRadius: 10,
                    fontSize: ".84rem",
                    fontWeight: 800,
                    cursor: loading === plan.id ? "wait" : "pointer",
                    border: isPro ? "none" : "1px solid rgba(255,255,255,0.14)",
                    background: isPro
                      ? "linear-gradient(135deg,#D9FF00,#A6CC00)"
                      : "rgba(255,255,255,0.04)",
                    color: isPro ? "#0a0a0a" : "#f1f5f9",
                    fontFamily: "inherit",
                    opacity: loading === plan.id ? 0.55 : 1,
                    letterSpacing: "0.02em",
                    transition: "transform 0.12s",
                  }}
                >
                  {loading === plan.id
                    ? "Redirecting…"
                    : session
                    ? isPro
                      ? "Buy Pro"
                      : "Buy"
                    : "Sign in to buy"}
                </button>
              </div>
              </div>
            );
          })}
        </div>

        {/* ── Custom amount card ──────────────────────────────────── */}
        <div
          style={{
            background: "#0d0d0f",
            border: "1px solid rgba(217, 255, 0,0.30)",
            borderRadius: 18,
            padding: "26px 26px 24px",
            marginBottom: 28,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 6,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                fontSize: ".68rem",
                fontWeight: 800,
                color: "#94a3b8",
                textTransform: "uppercase",
                letterSpacing: "0.16em",
              }}
            >
              Custom Amount
            </div>
            <div
              style={{
                fontSize: ".66rem",
                fontWeight: 700,
                color: "#D9FF00",
                background: "rgba(217, 255, 0,0.10)",
                border: "1px solid rgba(217, 255, 0,0.28)",
                borderRadius: 999,
                padding: "3px 10px",
              }}
            >
              {isBase
                ? `£1 = ${CREDITS_PER_POUND} credits`
                : (() => {
                    const perUnit = CREDITS_PER_POUND / (cur.rate || 1);
                    if (perUnit >= 1) {
                      return `${cur.symbol}1 ≈ ${Math.floor(perUnit)} credits`;
                    }
                    return `100 credits ≈ ${cur.symbol}${Math.round(0.78 * (cur.rate || 1))}`;
                  })()}
            </div>
          </div>
          <p style={{ fontSize: ".82rem", color: "#64748b", margin: "0 0 16px" }}>
            {isBase
              ? `Top up any amount you like — instant credits at ${CREDITS_PER_POUND} per £.`
              : `Enter any amount in ${cur.code} and get the equivalent credits at today's rate.`}
          </p>

          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: "1 1 180px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: ".68rem",
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 6,
                }}
              >
                Amount ({isBase ? "GBP" : cur.code})
              </label>
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#D9FF00",
                    fontWeight: 700,
                    fontSize: "1rem",
                    pointerEvents: "none",
                  }}
                >
                  {cur.symbol}
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="e.g. 5"
                  value={customDollars}
                  onChange={(e) =>
                    setCustomDollars(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "11px 12px 11px 28px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: 10,
                    color: "#fff",
                    fontSize: "1rem",
                    fontWeight: 700,
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
              </div>
              {!isBase && customCredits > 0 && !cur.loading && (
                <div style={{ fontSize: ".68rem", color: "#475569", marginTop: 5 }}>
                  ≈ £{customGbpEquivalent.toFixed(2)} GBP equivalent
                </div>
              )}
            </div>

            <div
              style={{
                flex: "1 1 160px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
              }}
            >
              <label
                style={{
                  display: "block",
                  fontSize: ".68rem",
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 6,
                }}
              >
                You will get
              </label>
              <div
                style={{
                  padding: "11px 14px",
                  background: "rgba(217, 255, 0,0.08)",
                  border: "1px solid rgba(217, 255, 0,0.20)",
                  borderRadius: 10,
                  minHeight: 44,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: customCredits > 0 ? "1.1rem" : ".88rem",
                    fontWeight: 800,
                    color: customCredits > 0 ? "#D9FF00" : "#334155",
                  }}
                >
                  {customCredits > 0
                    ? `⚡ ${customCredits.toLocaleString()} credits`
                    : "Enter amount above"}
                </span>
              </div>
            </div>

            <div
              style={{
                flex: "1 1 140px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
              }}
            >
              <label
                style={{
                  display: "block",
                  fontSize: ".68rem",
                  fontWeight: 700,
                  color: "transparent",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 6,
                  userSelect: "none",
                }}
              >
                &nbsp;
              </label>
              <button
                onClick={() => buy("custom")}
                disabled={customAmount < 1 || loading === "custom"}
                style={{
                  padding: "11px 20px",
                  borderRadius: 10,
                  fontSize: ".84rem",
                  fontWeight: 800,
                  cursor:
                    customAmount < 1 || loading === "custom"
                      ? "not-allowed"
                      : "pointer",
                  border: "none",
                  background:
                    customAmount >= 1
                      ? "linear-gradient(135deg,#D9FF00,#A6CC00)"
                      : "rgba(255,255,255,0.06)",
                  color: customAmount >= 1 ? "#0a0a0a" : "#475569",
                  fontFamily: "inherit",
                  opacity: loading === "custom" ? 0.55 : 1,
                  whiteSpace: "nowrap",
                  width: "100%",
                  letterSpacing: "0.02em",
                }}
              >
                {loading === "custom"
                  ? "Redirecting…"
                  : customAmount >= 1
                  ? `Pay ${cur.symbol}${customAmount}`
                  : session
                  ? "Enter amount"
                  : "Sign in to buy"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Zoom-call value prop (kept, restyled subtler) ──────── */}
        <div
          style={{
            background: "rgba(217, 255, 0, 0.04)",
            border: "1px solid rgba(217, 255, 0, 0.18)",
            borderRadius: 14,
            padding: "16px 20px",
            color: "#cbd5e1",
            fontSize: ".88rem",
            lineHeight: 1.55,
            textAlign: "center",
            maxWidth: 720,
            margin: "0 auto 56px",
          }}
        >
          🎥 After your purchase, we&apos;ll personally walk you through the
          platform on a{" "}
          <span style={{ color: "#D9FF00", fontWeight: 700 }}>free Zoom call</span>{" "}
          — so you get the most from your credits from day one.
        </div>

        {/* ── FAQ ─────────────────────────────────────────────────── */}
        <div>
          <h2
            style={{
              textAlign: "center",
              color: "#fff",
              fontSize: "1.3rem",
              fontWeight: 800,
              margin: "0 0 6px",
              letterSpacing: "-0.01em",
            }}
          >
            Frequently asked questions
          </h2>
          <p
            style={{
              textAlign: "center",
              color: "#475569",
              fontSize: ".82rem",
              margin: "0 0 28px",
            }}
          >
            Everything you need to know before buying.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 760, margin: "0 auto" }}>
            {[
              {
                q: "Do credits expire?",
                a: "No. Credits never expire — they stay in your account until you use them. Buy once and generate whenever you're ready.",
              },
              {
                q: "What payment methods are accepted?",
                a: "All major credit and debit cards (Visa, Mastercard, American Express, Discover) plus Apple Pay and Google Pay, processed securely through Stripe.",
              },
              {
                q: "What is your refund policy?",
                a: "We refund unused credit purchases within 7 days, provided no credits from that purchase have been spent. If you've already used credits or it's been more than 7 days, we can't issue a refund. To request one, reach out to us and we'll sort it out.",
              },
              {
                q: "How many credits does a video cost?",
                a: "It depends on duration, resolution, and quality — you'll see the exact cost in the generator before you click Generate. Choosing 720p or Basic quality stretches your credits further.",
              },
              {
                q: "Can I top up anytime?",
                a: "Yes — there are no subscriptions or lock-ins. Buy more credits at any time, in any amount, and they stack with your existing balance.",
              },
              {
                q: "What currency will I be charged in?",
                a: "Your local currency — we automatically detect your location and present prices and checkout in your currency. GBP is the base for credit pricing, but you pay in your local currency with no conversion surprises.",
              },
            ].map(({ q, a }) => (
              <FaqItem key={q} q={q} a={a} />
            ))}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @media (max-width: 980px) {
          .pricing-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }
        }
        @media (max-width: 640px) {
          .pricing-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
        @media (max-width: 420px) {
          .pricing-grid {
            grid-template-columns: 1fr !important;
          }
        }
        /* Cursor-following spotlight glow. */
        .cursor-spotlight {
          position: fixed;
          top: 0;
          left: 0;
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(220, 255, 0, 0.08) 0%, transparent 60%);
          border-radius: 50%;
          pointer-events: none;
          z-index: 1;
          transform: translate(-9999px, -9999px); /* off-screen until first mousemove */
          transition: transform 0.1s ease-out;
          will-change: transform;
        }
        @media (hover: none) {
          .cursor-spotlight { display: none; }
        }
        /* vanilla-tilt's glare overlay needs to respect the card's
           rounded corners so the highlight doesn't leak past the
           border. */
        .pricing-card .js-tilt-glare {
          border-radius: 18px !important;
          overflow: hidden !important;
        }
      `}</style>
    </div>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        background: open ? "#101012" : "#0d0d0f",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 14,
        overflow: "hidden",
        transition: "all 0.2s",
        ...(open ? { borderColor: "rgba(217, 255, 0,0.30)" } : {}),
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          gap: 12,
          fontFamily: "inherit",
        }}
      >
        <span style={{ fontSize: ".9rem", fontWeight: 700, color: "#f1f5f9" }}>
          {q}
        </span>
        <span
          style={{
            flexShrink: 0,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: open ? "rgba(217, 255, 0,0.18)" : "rgba(255,255,255,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: open ? "#D9FF00" : "#64748b",
            fontSize: "1rem",
            fontWeight: 700,
            lineHeight: 1,
            transition: "all 0.2s",
          }}
        >
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <p
          style={{
            margin: 0,
            padding: "0 20px 18px",
            fontSize: ".85rem",
            color: "#94a3b8",
            lineHeight: 1.7,
          }}
        >
          {a}
        </p>
      )}
    </div>
  );
}
