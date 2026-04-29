import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

const CREDITS_PER_DOLLAR = 80;

// Fixed plans — rate: 100 credits = $1.25 (125 cents)
const PLANS = {
  starter: { name: "Starter Manifest", credits: 3000,  amount: 3750,  currency: "usd" },
  power:   { name: "Power Engine",     credits: 7000,  amount: 8750,  currency: "usd" },
  quantum: { name: "Quantum Flow",     credits: 24000, amount: 30000, currency: "usd" }
};

export async function POST(req) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { plan, amount: customDollars } = body;

    let planData;
    if (plan === "custom") {
      // Custom amount: minimum $1, 80 credits per dollar (100 credits = $1.25)
      const dollars = parseInt(customDollars);
      if (!dollars || dollars < 1) {
        return NextResponse.json({ error: "Minimum custom amount is $1" }, { status: 400 });
      }
      const credits = dollars * CREDITS_PER_DOLLAR;
      planData = {
        name: `Custom — ${credits.toLocaleString()} Credits`,
        credits,
        amount: dollars * 100,
        currency: "usd",
      };
    } else {
      planData = PLANS[plan];
      if (!planData) {
        return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
      }
    }

    const baseUrl = process.env.NEXTAUTH_URL || "https://seedance.visualseffect.com";
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: planData.currency,
          product_data: {
            name: planData.name,
            description: "Seedance Studio AI Video Generation Credits"
          },
          unit_amount: planData.amount
        },
        quantity: 1
      }],
      customer_email: session.user.email,
      metadata: {
        userEmail: session.user.email,
        credits: String(planData.credits),
        plan: plan
      },
      success_url: baseUrl + "/pricing?success=true&credits=" + planData.credits,
      cancel_url:  baseUrl + "/pricing?cancelled=true"
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
