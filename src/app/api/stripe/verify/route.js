import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";
import { sendPaymentNotification } from "@/lib/email";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

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
    const existing = await prisma.payment.findUnique({ where: { stripeSessionId } });
    if (existing) {
      const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { credits: true } });
      return NextResponse.json({ credited: false, alreadyProcessed: true, credits: user?.credits ?? 0 });
    }

    const stripeSession = await stripe.checkout.sessions.retrieve(stripeSessionId);
    if (stripeSession.payment_status !== "paid") {
      const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { credits: true } });
      return NextResponse.json({ credited: false, reason: "not_paid", credits: user?.credits ?? 0 });
    }

    const email       = stripeSession.customer_email || stripeSession.metadata?.userEmail;
    const credits     = parseInt(stripeSession.metadata?.credits || "0");
    const plan        = stripeSession.metadata?.plan || "custom";
    const name        = stripeSession.customer_details?.name || session.user.name || null;
    const amountCents = stripeSession.amount_total || 0;

    if (!email || credits <= 0) {
      return NextResponse.json({ error: "Invalid payment metadata" }, { status: 400 });
    }

    // Credit the LOGGED-IN user (session.user.id), not whichever email
    // came back on the Stripe session. Stripe's customer_email and our
    // session can drift (email changes, account linking), and trusting
    // the email could credit the wrong account in edge cases.
    const [, updatedUser] = await prisma.$transaction([
      prisma.payment.create({ data: { stripeSessionId, userId: session.user.id, credits } }),
      prisma.user.update({
        where: { id: session.user.id },
        data: { credits: { increment: credits }, verified: true },
        select: { credits: true },
      }),
      prisma.creditTransaction.create({
        data: { userId: session.user.id, delta: credits, reason: "stripe_purchase", refType: "Payment", refId: stripeSessionId, note: `${plan} · ${amountCents}c` },
      }),
    ]);

    console.log("[VERIFY] Credits awarded:", credits, "to user", session.user.id, "(", email, ") | new total:", updatedUser.credits);

    sendPaymentNotification({ customerEmail: email, customerName: name, plan, credits, amountCents })
      .catch(err => console.error("[VERIFY] Payment email failed:", err.message));

    return NextResponse.json({ credited: true, credits: updatedUser.credits });
  } catch (err) {
    console.error("[VERIFY] Error:", err.message);
    try {
      const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { credits: true } });
      return NextResponse.json({ credited: false, error: err.message, credits: user?.credits ?? 0 });
    } catch {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }
}
