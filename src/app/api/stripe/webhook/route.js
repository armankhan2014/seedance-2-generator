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
    const stripeSessionId = session.id;

    if (email && credits > 0) {
      try {
        // Check if already processed (e.g. by the verify endpoint on success page)
        const existing = await prisma.payment.findUnique({ where: { stripeSessionId } });
        if (existing) {
          console.log("[WEBHOOK] Already processed session:", stripeSessionId);
        } else {
          // Award credits + record payment atomically
          const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
          if (!user) throw new Error("User not found for email: " + email);
          await prisma.$transaction([
            prisma.payment.create({ data: { stripeSessionId, userId: user.id, credits } }),
            prisma.user.update({ where: { email }, data: { credits: { increment: credits }, verified: true } }),
          ]);
          console.log("[WEBHOOK] Credits awarded:", credits, "to", email);
        }
      } catch (err) {
        console.error("[WEBHOOK] Failed to award credits:", err.message);
        // Re-throw so Stripe sees a 500 and retries — don't silently swallow failures
        throw err;
      }
    }
  }

  return NextResponse.json({ received: true });
}
