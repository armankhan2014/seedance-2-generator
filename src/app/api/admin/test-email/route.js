/**
 * GET /api/admin/test-email
 * Sends test emails to verify Gmail SMTP + all email types.
 * Admin-only.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendWelcomeEmail, sendSignupNotification, sendPaymentNotification } from "@/lib/email";

const ADMIN_EMAIL = "armankhan0826@gmail.com";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASS;

  if (!gmailUser || !gmailPass) {
    return NextResponse.json({
      ok: false,
      error: "Missing env vars",
      GMAIL_USER: gmailUser ? "SET" : "MISSING",
      GMAIL_APP_PASS: gmailPass ? "SET" : "MISSING",
    }, { status: 500 });
  }

  const results = [];

  // Test 1: admin signup notification
  try {
    await sendSignupNotification({ name: "Test User", email: "testuser@example.com", image: null });
    results.push({ type: "signup_notification", ok: true });
  } catch (err) {
    results.push({ type: "signup_notification", ok: false, error: err.message });
  }

  // Test 2: welcome email (sent to admin so you can see what users receive)
  try {
    await sendWelcomeEmail({ name: "Arman Khan", email: ADMIN_EMAIL });
    results.push({ type: "welcome_email", ok: true });
  } catch (err) {
    results.push({ type: "welcome_email", ok: false, error: err.message });
  }

  // Test 3: payment notification
  try {
    await sendPaymentNotification({
      customerEmail: "testbuyer@example.com",
      customerName: "Test Buyer",
      plan: "power",
      credits: 7000,
      amountCents: 8750,
    });
    results.push({ type: "payment_notification", ok: true });
  } catch (err) {
    results.push({ type: "payment_notification", ok: false, error: err.message });
  }

  const allOk = results.every(r => r.ok);
  return NextResponse.json({
    ok: allOk,
    GMAIL_USER: gmailUser,
    results,
    message: allOk
      ? "All 3 emails sent! Check armankhan0826@gmail.com inbox."
      : "Some emails failed — check results above.",
  });
}
