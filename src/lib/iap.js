// Client-side bridge to the native StoreKit 2 plugin.
//
// The native side lives in seedance-app/ios/App/App/IAPPlugin.swift and is
// registered as `IAP`. Capacitor injects window.Capacitor into the WebView
// even though we load this site remotely, so no npm plugin package is
// needed here — we just talk to the bridge object when it exists.
//
// Purchase flow (Apple Guideline 3.1.1):
//   purchase() → Apple's sheet → signed JWS → POST /api/iap/apple → credits
//   → only then native finish(). See src/lib/appleIap.js for verification.

// Order matters — this is the order packs render in the buy sheet.
export const IAP_PACKS = [
  { productId: "credits450",   credits: 450,   label: "Starter"    },
  { productId: "credits1350",  credits: 1350,  label: "Creator"    },
  { productId: "credits3150",  credits: 3150,  label: "Pro",   best: true },
  { productId: "credits6750",  credits: 6750,  label: "Studio"     },
  { productId: "credits15750", credits: 15750, label: "Studio Max" },
];

function bridge() {
  if (typeof window === "undefined") return null;
  return window.Capacitor?.Plugins?.IAP || null;
}

export function iapAvailable() {
  return !!bridge();
}

/** App Store prices, keyed by productId. {} if the bridge is missing. */
export async function fetchIapPrices() {
  const iap = bridge();
  if (!iap) return {};
  try {
    const { products = [] } = await iap.getProducts({
      productIds: IAP_PACKS.map((p) => p.productId),
    });
    return Object.fromEntries(products.map((p) => [p.productId, p.price]));
  } catch (err) {
    console.error("[iap] getProducts failed", err);
    return {};
  }
}

/** Hand a signed transaction to the server, then finish it natively. */
async function redeem({ jws, transactionId }) {
  const res = await fetch("/api/iap/apple", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jws }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    // Leave the transaction UNFINISHED so Apple replays it next launch —
    // the user paid, they must not lose the credits to a transient error.
    throw new Error(data.error || "Could not confirm your purchase");
  }
  try {
    await bridge()?.finish({ transactionId });
  } catch (err) {
    console.error("[iap] finish failed", err);
  }
  return data;
}

/**
 * Buy a pack. Resolves { status: "success", balance } | { status: "cancelled" }
 * | { status: "pending" }. Throws with a user-safe message on failure.
 */
export async function buyIapPack(productId) {
  const iap = bridge();
  if (!iap) throw new Error("In-app purchases are unavailable");
  const result = await iap.purchase({ productId });
  if (result.status !== "success") return result;
  const data = await redeem(result);
  return { status: "success", credits: data.credits, balance: data.balance };
}

/**
 * Replay anything Apple delivered while we were away (Ask To Buy approvals,
 * a crash between payment and grant). Safe to call on every app launch —
 * /api/iap/apple is idempotent on transactionId. Returns credits granted.
 */
export async function redeemPendingIap() {
  const iap = bridge();
  if (!iap) return 0;
  let granted = 0;
  try {
    const { transactions = [] } = await iap.getPending();
    for (const txn of transactions) {
      try {
        const data = await redeem(txn);
        if (!data.duplicate) granted += data.credits;
      } catch (err) {
        console.error("[iap] pending redeem failed", err);
      }
    }
  } catch (err) {
    console.error("[iap] getPending failed", err);
  }
  return granted;
}
