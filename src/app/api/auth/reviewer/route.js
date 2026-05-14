import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// Play Store / App Store reviewer auto-sign-in.
//
// Reviewers can't click magic links sent to a demo inbox, so we expose a
// single URL with a shared secret token. Hitting it creates a real
// NextAuth database session for a pre-seeded reviewer user, sets the
// same `__Secure-next-auth.session-token` cookie that NextAuth normally
// sets, and redirects to the home page.
//
// One-time setup:
//   1. Run `node scripts/seed-reviewer.mjs` to create the reviewer user.
//   2. Set REVIEWER_TOKEN in Vercel env vars to a long random string.
//   3. Paste `https://seedance.visualseffect.com/api/auth/reviewer?token=YOUR_TOKEN`
//      into Play Console → App access → "Instructions" field.
//
// Security:
//   - Token is compared in constant time to avoid timing attacks.
//   - Each hit mints a fresh sessionToken — old reviewer sessions stay
//     valid until they expire, but the URL itself is the only way in.
//   - The reviewer user is just a regular User row; revoke by deleting
//     it (cascade clears their sessions) or by changing REVIEWER_TOKEN.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REVIEWER_EMAIL = process.env.REVIEWER_EMAIL || "play-store-reviewer@visualseffect.com";
const SESSION_DAYS = 30;
const isProd = process.env.NODE_ENV === "production";

export async function GET(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const expected = process.env.REVIEWER_TOKEN || "";

  if (!expected) {
    return NextResponse.json(
      { error: "Reviewer access is not configured on this environment." },
      { status: 503 },
    );
  }
  if (!constantTimeEqual(token, expected)) {
    return NextResponse.json({ error: "Invalid reviewer token." }, { status: 403 });
  }

  // Auto-seed on first hit so the URL works as soon as REVIEWER_TOKEN is set —
  // no need to run scripts/seed-reviewer.mjs separately. Idempotent: subsequent
  // hits just look up the existing row and bump credits if low.
  const user = await prisma.user.upsert({
    where: { email: REVIEWER_EMAIL },
    update: {},
    create: {
      email: REVIEWER_EMAIL,
      name: "Play Store Reviewer",
      credits: 200,
      verified: true,
      emailVerified: new Date(),
    },
  });
  if (user.credits < 50) {
    await prisma.user.update({ where: { id: user.id }, data: { credits: 200 } });
  }

  const sessionToken = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { sessionToken, userId: user.id, expires } });

  const redirectTo = new URL("/", url.origin);
  const response = NextResponse.redirect(redirectTo);
  response.cookies.set({
    name: isProd ? "__Secure-next-auth.session-token" : "next-auth.session-token",
    value: sessionToken,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isProd,
    domain: isProd ? ".visualseffect.com" : undefined,
    expires,
  });
  return response;
}

function constantTimeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
