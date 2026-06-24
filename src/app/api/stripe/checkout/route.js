import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { uaIsIOSApp } from "@/lib/iosApp";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

// GBP is the price base. Custom-amount checkouts use this rate.
// Matches the Starter tier's credits/£ ratio (450/£3.50 ≈ 128.6) so a
// custom buy never undercuts the worst fixed plan.
const CREDITS_PER_POUND = 128;

// Fixed plans — GBP base prices (in pence). One credit-cost reference:
// a 15s 1080p high-quality video = 450 credits, so each plan's video
// count is `credits / 450`.
const PLANS = {
  starter: { name: "Starter", credits: 450,    gbpPence: 350    },
  creator: { name: "Creator", credits: 1350,   gbpPence: 1000   },
  pro:     { name: "Pro",     credits: 3150,   gbpPence: 2300   },
  studio:  { name: "Studio",  credits: 6750,   gbpPence: 4900   },
  agency:  { name: "Agency",  credits: 15750,  gbpPence: 11500  },
};

// Stripe zero-decimal currencies (amount = whole units, not cents)
const ZERO_DECIMAL = new Set([
  "BIF","CLP","DJF","GNF","JPY","KMF","KRW","MGA","PYG",
  "RWF","UGX","VND","VUV","XAF","XOF","XPF","HUF","TWD"
]);

// Stripe-supported currencies (lowercase)
const STRIPE_CURRENCIES = new Set([
  "usd","aed","afn","all","amd","ang","aoa","ars","aud","awg","azn",
  "bam","bbd","bdt","bgn","bif","bmd","bnd","bob","brl","bsd","bwp","bzd",
  "cad","cdf","chf","clp","cny","cop","crc","cve","czk",
  "djf","dkk","dop","dzd","egp","etb","eur",
  "fjd","fkp","gbp","gel","gip","gmd","gnf","gtq","gyd",
  "hkd","hnl","hrk","htg","huf",
  "idr","ils","inr","isk",
  "jmd","jpy",
  "kes","kgs","khr","kmf","krw","kyd","kzt",
  "lak","lbp","lkr","lrd","lsl",
  "mad","mdl","mga","mkd","mmk","mnt","mop","mur","mvr","mwk","mxn","myr","mzn",
  "nad","ngn","nio","nok","npr","nzd",
  "pab","pen","pgk","php","pkr","pln","pyg",
  "qar","ron","rsd","rub","rwf",
  "sar","sbd","scr","sek","sgd","shp","sll","sos","srd","szl",
  "thb","tjs","top","try","ttd","twd","tzs",
  "uah","ugx","uyu","uzs",
  "vnd","vuv","wst",
  "xaf","xcd","xof","xpf",
  "yer","zar","zmw"
]);

/**
 * Convert a GBP-pence amount to the target currency's Stripe unit.
 * Rate is GBP → target currency (e.g. 1.27 USD per GBP).
 *   £35.00 in pence (3500) × rate 1.27 = 44.45 USD → 4445 cents
 * For zero-decimal currencies (JPY etc) we return whole units.
 */
function convertAmount(gbpPence, currency, rate) {
  const cur = currency.toUpperCase();
  const gbpAmount = gbpPence / 100;             // e.g. 35.00
  const localAmount = gbpAmount * rate;          // e.g. 35.00 * 1.27 = 44.45

  if (ZERO_DECIMAL.has(cur)) {
    return Math.round(localAmount);              // whole units
  }
  return Math.round(localAmount * 100);          // cents/paise/fils etc.
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Apple Guideline 3.1.1 — the iOS App Store build must never reach
    // Stripe checkout. The UI hides all buy buttons, but block at the API
    // too so a stray request from inside the app can't open a web payment.
    // See src/lib/iosApp.js.
    if (uaIsIOSApp(req.headers.get("user-agent"))) {
      return NextResponse.json(
        { error: "Purchases are not available in the app. Please buy credits on the website." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      plan,
      amount: customLocal,
      currency: reqCurrency,
      rate: reqRate,
    } = body;

    // Resolve charge currency — fall back to GBP if unsupported.
    // Rate is GBP → chargeCurrency (1.0 if GBP, ~1.27 for USD, etc.).
    const rawCurrency = (reqCurrency || "GBP").toLowerCase();
    const chargeCurrency = STRIPE_CURRENCIES.has(rawCurrency) ? rawCurrency : "gbp";
    const exchangeRate   = (chargeCurrency !== "gbp" && reqRate > 0) ? Number(reqRate) : 1;

    let planData;

    if (plan === "custom") {
      const localAmount = parseFloat(customLocal);
      if (!localAmount || localAmount <= 0) {
        return NextResponse.json({ error: "Please enter a valid amount" }, { status: 400 });
      }
      // Convert local-currency amount → GBP equivalent → credits.
      const gbpEquivalent = chargeCurrency === "gbp" ? localAmount : localAmount / exchangeRate;
      if (gbpEquivalent < 0.5) {
        return NextResponse.json({ error: "Minimum amount is too small" }, { status: 400 });
      }
      const credits = Math.floor(gbpEquivalent * CREDITS_PER_POUND);
      planData = {
        name: `Custom — ${credits.toLocaleString()} Credits`,
        credits,
        gbpPence: Math.round(gbpEquivalent * 100),
      };
    } else {
      planData = PLANS[plan];
      if (!planData) {
        return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
      }
    }

    // Convert GBP-pence to the charge currency.
    const stripeAmount = convertAmount(planData.gbpPence, chargeCurrency, exchangeRate);

    const baseUrl = process.env.NEXTAUTH_URL || "https://seedance.visualseffect.com";

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: chargeCurrency,
          product_data: {
            name: planData.name,
            description: `Seedance Studio — ${planData.credits.toLocaleString()} AI Video Credits`,
          },
          unit_amount: stripeAmount,
        },
        quantity: 1,
      }],
      customer_email: session.user.email,
      metadata: {
        userEmail: session.user.email,
        credits: String(planData.credits),
        plan: plan,
        gbpPence: String(planData.gbpPence),
        chargeCurrency,
      },
      success_url: baseUrl + "/pricing?success=true&credits=" + planData.credits + "&session_id={CHECKOUT_SESSION_ID}",
      cancel_url:  baseUrl + "/pricing?cancelled=true",
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
