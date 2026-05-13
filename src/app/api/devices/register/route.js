// POST /api/devices/register
//
// Called from the mobile app on launch (once the user is signed in
// and has granted notification permission). Stores their FCM (Android)
// or APNS (iOS) token so we can push "your video is ready" + future
// engagement pings.
//
// Idempotent: tokens are unique, so re-registering the same device
// updates lastSeenAt instead of duplicating. Clears any previous
// invalidAt flag — if the user's device was marked dead and they're
// back, the token is good again.
//
// Defensive: this whole endpoint silent-succeeds on DB failures so a
// push-system outage never breaks the app launch.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_PLATFORMS = new Set(["ios", "android", "web"]);

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      // Not signed in — silently accept so the app doesn't error on
      // first launch before the user has logged in. We just don't
      // store anything.
      return NextResponse.json({ ok: true, stored: false });
    }

    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const platform = ALLOWED_PLATFORMS.has(body.platform) ? body.platform : "unknown";
    const appVersion = typeof body.appVersion === "string" ? body.appVersion.slice(0, 32) : null;

    if (!token || token.length < 20 || token.length > 512) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    try {
      await prisma.device.upsert({
        where: { token },
        create: {
          userId: session.user.id,
          token,
          platform,
          appVersion,
        },
        update: {
          userId: session.user.id,
          platform,
          appVersion,
          lastSeenAt: new Date(),
          invalidAt: null,
        },
      });
    } catch (e) {
      // If the Device table doesn't exist yet (schema not pushed
      // to this environment) we don't want to 500 the app. Log and
      // accept silently — pushes won't fire, but the app keeps
      // working.
      console.error("[DEVICES_REGISTER] DB error:", e?.message);
      return NextResponse.json({ ok: true, stored: false, reason: "db_unavailable" });
    }

    return NextResponse.json({ ok: true, stored: true });
  } catch (err) {
    console.error("[DEVICES_REGISTER]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
