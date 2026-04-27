import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { sessionId } = await req.json();
    if (!sessionId) {
      return NextResponse.json({ error: "Session ID required" }, { status: 400 });
    }

    // Retrieve the checkout session from Stripe to verify it's legit
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    // Validate the session belongs to this user
    const sessionEmail = (checkoutSession.customer_email || checkoutSession.metadata?.userEmail || "").toLowerCase();
    const userEmail = session.user.email.toLowerCase();
    if (sessionEmail && sessionEmail !== userEmail) {
      return NextResponse.json({ error: "Session does not belong to this user" }, { status: 403 });
    }

    // Validate payment was successful
    if (checkoutSession.payment_status !== "paid") {
      return NextResponse.json({ error: "Payment not completed", status: checkoutSession.payment_status }, { status: 400 });
    }

    const credits = parseInt(checkoutSession.metadata?.credits || "0");
    if (credits <= 0) {
      return NextResponse.json({ error: "Invalid credits in session" }, { status: 400 });
    }

    // Idempotency: check if this session was already redeemed
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, credits: true, lastStripeSession: true }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.lastStripeSession === sessionId) {
      // Already redeemed — just return current balance
      return NextResponse.json({ 
        success: true, 
        credits: user.credits,
        creditsAdded: 0,
        alreadyRedeemed: true 
      });
    }

    // Add credits and record session ID to prevent double-redeem
    const updated = await prisma.user.update({
      where: { email: session.user.email },
      data: {
        credits: { increment: credits },
        lastStripeSession: sessionId
      }
    });

    console.log(`[verify-session] +${credits} credits for ${session.user.email}. New total: ${updated.credits}`);

    return NextResponse.json({
      success: true,
      creditsAdded: credits,
      credits: updated.credits
    });

  } catch (error) {
    console.error("[verify-session] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
