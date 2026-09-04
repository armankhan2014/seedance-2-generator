"use client";

import { useEffect, useState } from "react";
import { IAP_PACKS, iapAvailable, fetchIapPrices, buyIapPack, redeemPendingIap } from "@/lib/iap";

// The credit shop shown INSIDE the native app (Apple Guideline 3.1.1).
//
// Web visitors keep buying through Stripe on /pricing; that page and every
// buy button stay hidden in-app (see src/lib/iosApp.js). This component is
// the app's only purchase surface and it goes through Apple exclusively.
// Prices come from StoreKit so they're always the user's real App Store
// currency, never a hard-coded USD string.

const LIME = "#c8f135";
const LIME_TINT = "rgba(200,241,53,.08)";
const LIME_RING = "rgba(200,241,53,.28)";
const CARD = "#141414";
const BORDER = "#262626";
const SUB = "#a1a1a1";

export default function IapCredits({ onBalance }) {
  const [prices, setPrices]   = useState({});
  const [busy, setBusy]       = useState(null);
  const [error, setError]     = useState("");
  const [notice, setNotice]   = useState("");
  const available             = iapAvailable();

  useEffect(() => {
    if (!available) return;
    let live = true;
    fetchIapPrices().then((p) => live && setPrices(p));
    // Anything Apple already charged for but we never granted (Ask To Buy
    // approval, crash mid-flow) lands the moment the shop opens.
    redeemPendingIap().then((granted) => {
      if (live && granted > 0) {
        setNotice(`${granted.toLocaleString()} credits restored from an earlier purchase.`);
        onBalance?.();
      }
    });
    return () => { live = false; };
  }, [available, onBalance]);

  if (!available) return null;

  const handleBuy = async (productId) => {
    setError("");
    setNotice("");
    setBusy(productId);
    try {
      const result = await buyIapPack(productId);
      if (result.status === "success") {
        setNotice(`${result.credits.toLocaleString()} credits added.`);
        onBalance?.(result.balance);
      } else if (result.status === "pending") {
        setNotice("Your purchase needs approval. Credits arrive once it's approved.");
      }
    } catch (err) {
      setError(err.message || "Purchase failed. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".09em", color: SUB }}>
        Buy credits
      </div>
      <p style={{ margin: "8px 0 14px", color: SUB, fontSize: 12.5, lineHeight: 1.5 }}>
        Credits power every video, image and prompt you generate.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {IAP_PACKS.map((pack) => (
          <button
            key={pack.productId}
            onClick={() => handleBuy(pack.productId)}
            disabled={!!busy}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              width: "100%",
              padding: "13px 14px",
              background: pack.best ? LIME_TINT : CARD,
              border: `1px solid ${pack.best ? LIME_RING : BORDER}`,
              borderRadius: 12,
              cursor: busy ? "default" : "pointer",
              opacity: busy && busy !== pack.productId ? 0.5 : 1,
              textAlign: "left",
              font: "inherit",
              color: "inherit",
            }}
          >
            <span>
              <span style={{ display: "block", fontWeight: 800, fontSize: 15, color: LIME }}>
                {pack.credits.toLocaleString()} credits
              </span>
              <span style={{ display: "block", fontSize: 12, color: SUB, marginTop: 2 }}>
                {pack.label}{pack.best ? " · Most popular" : ""}
              </span>
            </span>
            <span style={{ fontWeight: 800, fontSize: 15, whiteSpace: "nowrap" }}>
              {busy === pack.productId ? "…" : (prices[pack.productId] || "")}
            </span>
          </button>
        ))}
      </div>

      {notice && <p style={{ margin: "12px 0 0", color: LIME, fontSize: 12.5 }}>{notice}</p>}
      {error  && <p style={{ margin: "12px 0 0", color: "#ff6b6b", fontSize: 12.5 }}>{error}</p>}
    </div>
  );
}
