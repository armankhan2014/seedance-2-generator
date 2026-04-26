import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

export async function POST(req) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json({ error: "Webhook signature failed: " + err.message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_email || session.metadata?.userEmail;
    const credits = parseInt(session.metadata?.credits || "0");

    if (email && credits > 0) {
      try {
        await prisma.user.update({
          where: { email },
          data: { credits: { increment: credits } }
        });
        console.log("Credits awarded:", credits, "to", email);
      } catch (err) {
        console.error("Failed to award credits:", err);
      }
    }
  }

  return NextResponse.json({ received: true });
}
