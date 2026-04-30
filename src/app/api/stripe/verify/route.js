import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

// GET /api/stripe/verify?session_id=cs_xxx
// Called from the success page. Verifies payment and awards credits if not already done.
// Idempotent — safe to call multiple times (Payment table prevents double-crediting).
export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const stripeSessionId = searchParams.get("session_id");
  if (!stripeSessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  try {
    // 1. Already processed? Return current credits — no double-credit.
    const existing = await prisma.payment.findUnique({
      where: { stripeSessionId },
    });
    if (existing) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { credits: true },
      });
      return NextResponse.json({
        credited: false,
        alreadyProcessed: true,
        credits: user?.credits ?? 0,
      });
    }

    // 2. Retrieve the Stripe session to confirm payment.
    const stripeSession = await stripe.checkout.sessions.retrieve(stripeSessionId);
    if (stripeSession.payment_status !== "paid") {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { credits: true },
      });
      return NextResponse.json({
        credited: false,
        reason: "not_paid",
        credits: user?.credits ?? 0,
      });
    }

    const email = stripeSession.customer_email || stripeSession.metadata?.userEmail;
    const credits = parseInt(stripeSession.metadata?.credits || "0");

    if (!email || credits <= 0) {
      return NextResponse.json({ error: "Invalid payment metadata" }, { status: 400 });
    }

    // 3. Award credits + record payment atomically — prevents webhook race condition.
    const [, updatedUser] = await prisma.$transaction([
      prisma.payment.create({
        data: {
          stripeSessionId,
          userId: session.user.id,
          credits,
        },
      }),
      prisma.user.update({
        where: { email },
        data: { credits: { increment: credits }, verified: true },
        select: { credits: true },
      }),
    ]);

    console.log("[VERIFY] Credits awarded:", credits, "to", email, "| new total:", updatedUser.credits);
    return NextResponse.json({
      credited: true,
      credits: updatedUser.credits,
    });
  } catch (err) {
    console.error("[VERIFY] Error:", err.message);
    // Return current DB credits even on error so UI can display something.
    try {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { credits: true },
      });
      return NextResponse.json({ credited: false, error: err.message, credits: user?.credits ?? 0 });
    } catch {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }
}
