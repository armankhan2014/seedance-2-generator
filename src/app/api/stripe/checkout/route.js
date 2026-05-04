import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

const CREDITS_PER_DOLLAR = 80;

// Fixed plans — USD base prices (in cents)
const PLANS = {
  starter: { name: "Starter Manifest", credits: 3000,  usdCents: 3750  },
  power:   { name: "Power Engine",     credits: 7000,  usdCents: 8750  },
  quantum: { name: "Quantum Flow",     credits: 24000, usdCents: 30000 },
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
 * Convert a USD-cent amount to the target currency's Stripe unit.
 * e.g. 3750 USD cents + rate 280 (PKR/USD) = 10500 PKR (whole units, zero-decimal)
 */
function convertAmount(usdCents, currency, rate) {
  const cur = currency.toUpperCase();
  const usdAmount = usdCents / 100;           // e.g. 37.50
  const localAmount = usdAmount * rate;        // e.g. 37.50 * 280 = 10500

  if (ZERO_DECIMAL.has(cur)) {
    return Math.round(localAmount);            // whole units
  }
  return Math.round(localAmount * 100);        // cents/paise/fils etc.
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const {
      plan,
      amount: customDollars,
      currency: reqCurrency,
      rate: reqRate,
    } = body;

    // Resolve charge currency — fall back to USD if unsupported
    const rawCurrency = (reqCurrency || "USD").toLowerCase();
    const chargeCurrency = STRIPE_CURRENCIES.has(rawCurrency) ? rawCurrency : "usd";
    const exchangeRate   = (chargeCurrency !== "usd" && reqRate > 0) ? Number(reqRate) : 1;

    let planData;

    if (plan === "custom") {
      const localAmount = parseFloat(customDollars);
      if (!localAmount || localAmount <= 0) {
        return NextResponse.json({ error: "Please enter a valid amount" }, { status: 400 });
      }
      // Convert local amount to USD to calculate credits (1 USD = 80 credits)
      const usdEquivalent = chargeCurrency === "usd" ? localAmount : localAmount / exchangeRate;
      if (usdEquivalent < 0.5) {
        return NextResponse.json({ error: "Minimum amount is too small" }, { status: 400 });
      }
      const credits = Math.floor(usdEquivalent * CREDITS_PER_DOLLAR);
      planData = {
        name: `Custom — ${credits.toLocaleString()} Credits`,
        credits,
        usdCents: Math.round(usdEquivalent * 100),
      };
    } else {
      planData = PLANS[plan];
      if (!planData) {
        return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
      }
    }

    // Convert to charge currency
    const stripeAmount = convertAmount(planData.usdCents, chargeCurrency, exchangeRate);

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
        usdCents: String(planData.usdCents),
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
