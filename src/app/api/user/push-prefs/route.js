// GET   /api/user/push-prefs   — read viewer's push prefs + sub state
// PATCH /api/user/push-prefs   — partial update of the four push flags
//
// Auth: signed-in only. Used by /settings/notifications.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED = ["pushMaster", "pushVideoReady", "pushVideoFailed", "pushFeatured"];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        pushMaster: true,
        pushVideoReady: true,
        pushVideoFailed: true,
        pushFeatured: true,
      },
    });
    const subCount = await prisma.pushSubscription
      .count({ where: { userId: session.user.id, origin: "studio" } })
      .catch(() => 0);

    return NextResponse.json({
      ok: true,
      prefs: user || defaults(),
      activeSubscriptions: subCount,
    });
  } catch (err) {
    // Schema not pushed → return defaults so the settings page still
    // renders (toggles will be disabled until the table exists).
    if (/Unknown.*field|Unknown.*column|does not exist/i.test(err?.message || "")) {
      return NextResponse.json({
        ok: true,
        prefs: defaults(),
        activeSubscriptions: 0,
        warning: "push prefs not migrated yet",
      });
    }
    console.error("[PUSH_PREFS_GET]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // Whitelist + coerce to boolean. Anything outside ALLOWED is ignored.
  const update = {};
  for (const key of ALLOWED) {
    if (key in body) update[key] = !!body[key];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: update,
      select: {
        pushMaster: true,
        pushVideoReady: true,
        pushVideoFailed: true,
        pushFeatured: true,
      },
    });
    return NextResponse.json({ ok: true, prefs: user });
  } catch (err) {
    if (/Unknown.*field|Unknown.*column|does not exist/i.test(err?.message || "")) {
      return NextResponse.json(
        { error: "Push prefs not migrated yet — run prisma db push", code: "COLUMN_MISSING" },
        { status: 503 }
      );
    }
    console.error("[PUSH_PREFS_PATCH]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function defaults() {
  return { pushMaster: true, pushVideoReady: true, pushVideoFailed: true, pushFeatured: true };
}
