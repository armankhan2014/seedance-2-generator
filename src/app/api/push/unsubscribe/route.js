// POST /api/push/unsubscribe   { endpoint }
//
// Called from the client when the user revokes permission (or when
// the SW's pushsubscriptionchange event fires for an expired sub).
// Deletes the row so we stop trying to push to a dead endpoint.

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
  if (!body || typeof body.endpoint !== "string") {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  try {
    // deleteMany with both userId + endpoint so a leaked endpoint
    // can't be deleted by a different user.
    const result = await prisma.pushSubscription.deleteMany({
      where: { endpoint: body.endpoint, userId: session.user.id },
    });
    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (err) {
    if (/Unknown.*PushSubscription|relation.*does not exist/i.test(err?.message || "")) {
      return NextResponse.json({ ok: true, deleted: 0 });
    }
    console.error("[PUSH_UNSUBSCRIBE]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
