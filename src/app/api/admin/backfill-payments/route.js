import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

const SECRET = "seedance-backfill-2026";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") !== SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const inserted = [];
  const skipped = [];
  const errors = [];

  // Fetch all completed checkout sessions from Stripe (up to 100)
  let sessions = [];
  try {
    const list = await stripe.checkout.sessions.list({
      limit: 100,
      expand: ["data.customer"],
    });
    sessions = list.data.filter(s => s.payment_status === "paid");
  } catch (err) {
    return NextResponse.json({ error: "Stripe fetch failed: " + err.message }, { status: 500 });
  }

  for (const s of sessions) {
    try {
      // Skip if already recorded
      const existing = await prisma.payment.findUnique({ where: { stripeSessionId: s.id } });
      if (existing) { skipped.push(s.id); continue; }

      const email = s.customer_email || s.customer_details?.email || s.metadata?.userEmail;
      const credits = parseInt(s.metadata?.credits || "0");

      if (!email || credits <= 0) {
        errors.push({ id: s.id, reason: "missing email or credits" });
        continue;
      }

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        errors.push({ id: s.id, reason: "user not found for " + email });
        continue;
      }

      await prisma.payment.create({
        data: {
          stripeSessionId: s.id,
          userId: user.id,
          credits,
          createdAt: new Date(s.created * 1000),
        },
      });
      inserted.push({ id: s.id, email, credits });
    } catch (err) {
      errors.push({ id: s.id, reason: err.message });
    }
  }

  return NextResponse.json({ inserted, skipped, errors, total: sessions.length });
}
