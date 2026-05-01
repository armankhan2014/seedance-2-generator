/**
 * GET /api/admin/test-email
 * Sends a test email via the same Gmail SMTP used for sign-up emails.
 * Admin-only. Remove or protect this route after debugging.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendWelcomeEmail, sendSignupNotification } from "@/lib/email";

const ADMIN_EMAIL = "armankhan0826@gmail.com";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check env vars first
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

  const errors = [];

  // Test 1: admin notification to armankhan0826@gmail.com
  try {
    await sendSignupNotification({
      name: "Test User",
      email: "test@example.com",
      image: null,
    });
  } catch (err) {
    errors.push({ email: "admin_notification", error: err.message });
  }

  // Test 2: welcome email to admin (so you can see what users receive)
  try {
    await sendWelcomeEmail({
      name: "Arman Khan",
      email: ADMIN_EMAIL,
    });
  } catch (err) {
    errors.push({ email: "welcome_email", error: err.message });
  }

  return NextResponse.json({
    ok: errors.length === 0,
    GMAIL_USER: gmailUser,
    GMAIL_APP_PASS: "SET (hidden)",
    errors: errors.length ? errors : null,
    message: errors.length === 0
      ? "Both emails sent! Check armankhan0826@gmail.com inbox."
      : "Some emails failed — see errors above.",
  });
}
