// POST /api/push/subscribe
//
// Called by the browser after the user grants notification permission
// and the page receives a PushSubscription from the service worker.
// Body shape (from PushSubscription.toJSON()):
//   { endpoint, keys: { p256dh, auth }, expirationTime }
//
// We persist one row per (endpoint) — endpoints are globally unique
// so re-subscribing on the same device upserts and refreshes the keys.
// `origin: "studio"` tags this row as a Studio fanout target so the
// Studio MuAPI webhook only sends to its own subs (not community ones).

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.endpoint !== "string" || !body.keys) {
    return NextResponse.json({ error: "Bad subscription" }, { status: 400 });
  }
  const { endpoint, keys } = body;
  if (typeof keys.p256dh !== "string" || typeof keys.auth !== "string") {
    return NextResponse.json({ error: "Bad keys" }, { status: 400 });
  }
  if (endpoint.length > 2000 || keys.p256dh.length > 200 || keys.auth.length > 200) {
    return NextResponse.json({ error: "Payload too large" }, { status: 400 });
  }

  const userAgent = req.headers.get("user-agent")?.slice(0, 256) || null;

  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId: session.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
        origin: "studio",
      },
      update: {
        userId: session.user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
        origin: "studio",
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // PushSubscription table missing → schema not pushed yet. Return
    // a clear 503 so the client can downgrade gracefully (in-app
    // fallback continues to work).
    if (/Unknown.*PushSubscription|relation.*does not exist/i.test(err?.message || "")) {
      return NextResponse.json(
        { error: "Push subscriptions not enabled yet", code: "TABLE_MISSING" },
        { status: 503 }
      );
    }
    console.error("[PUSH_SUBSCRIBE]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
