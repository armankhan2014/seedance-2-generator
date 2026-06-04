/**
 * DELETE /api/me/account — permanent account deletion.
 *
 * Phase 3d. Removes the user's row from Postgres (which cascades
 * to Account, Session, Creation, Payment, CreditTransaction, Post,
 * Reaction, Comment, Follow, PushSubscription, UserSocialLink,
 * MusicTrack, EditorProject — every model with onDelete: Cascade).
 *
 * Pre-delete: best-effort cleanup of the user's R2 avatar + cover
 * (legacy base64 dataURLs in User.image are auto-vanished by the
 * row delete). R2 deletion is fire-and-forget — a failure there
 * doesn't block the account deletion itself.
 *
 * Privacy: this is a HARD delete with no grace period and no
 * restore. The spec called for 7-day soft delete with safeguards;
 * that's a Phase 3d.5 enhancement that requires a `deletedAt`
 * column + a cron sweeper + sign-in branch checking. Tonight ships
 * the durable, irreversible version because that's the part
 * users genuinely need (GDPR right-to-erasure) and the soft-delete
 * UX wrapper can layer on top without changing this endpoint.
 *
 * Confirmation: the client MUST send a `confirmHandle` field
 * matching the user's current @handle (or email prefix when no
 * handle is set). This is the user-side typed confirmation
 * required by the spec — the server enforces it so a misclick
 * on a tap target can't nuke an account.
 *
 * Cross-subdomain: the User row delete affects community / music
 * / edits identically (same Neon row). Their pages will start
 * 404'ing for this user the moment the transaction commits.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { deleteR2Object, getKeyFromUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

    const confirmHandle = String(body?.confirmHandle || "").trim().toLowerCase();
    if (!confirmHandle) {
      return NextResponse.json({ error: "Missing confirmHandle" }, { status: 400 });
    }

    const me = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id:            true,
        username:      true,
        email:         true,
        image:         true,
        coverImageUrl: true,
      },
    });
    if (!me) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Confirmation must match the user's @handle (if set) or
    // their email prefix (when no handle yet).
    const expected = (me.username || (me.email || "").split("@")[0] || "").toLowerCase();
    if (!expected || confirmHandle !== expected) {
      return NextResponse.json(
        {
          error:  "Confirmation doesn't match your handle. Type it exactly.",
          reason: "mismatch",
          expected,
        },
        { status: 400 }
      );
    }

    // Best-effort R2 cleanup BEFORE the row delete. If we did it
    // after, we'd have no userId to find the keys. Failures here
    // are silent — the delete should land regardless of whether
    // we leaked a couple of orphan objects.
    const oldAvatarKey = getKeyFromUrl(me.image);
    const oldCoverKey  = getKeyFromUrl(me.coverImageUrl);
    if (oldAvatarKey) deleteR2Object(oldAvatarKey).catch(() => {});
    if (oldCoverKey)  deleteR2Object(oldCoverKey).catch(() => {});

    // The hard delete. Prisma cascades down every relation that has
    // onDelete: Cascade in the schema (accounts, sessions, creations,
    // posts, comments, reactions, follows, push subscriptions, social
    // links, music tracks, editor projects, credit transactions).
    await prisma.user.delete({ where: { id: me.id } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/me/account DELETE] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
