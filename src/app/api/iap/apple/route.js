import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { UserService } from "@/lib/services/user";
import { prisma } from "@/lib/prisma";
import { verifyAppleTransaction, IAP_PRODUCTS } from "@/lib/appleIap";

// Grants credits for an Apple In-App Purchase (Guideline 3.1.1).
//
// The iOS app posts the signed StoreKit 2 JWS it got from Apple; we verify
// it offline against Apple's root CA (src/lib/appleIap.js — no API key
// needed) and top the user up. Only after this returns ok does the app
// finish() the transaction, so a crash mid-flow simply replays here on
// next launch.
//
// Idempotency: every grant writes a CreditTransaction with
// refType "apple_iap" + refId = Apple's transactionId. We check for that
// row first, so replays (deliberate or from getPending) never double-grant.
// No schema migration needed — refType/refId already exist.
export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { jws } = await req.json();

    let transaction;
    try {
      transaction = verifyAppleTransaction(jws);
    } catch (err) {
      console.error("[iap] verification failed:", err.message);
      return NextResponse.json({ error: "Purchase could not be verified" }, { status: 400 });
    }

    const credits = IAP_PRODUCTS[transaction.productId];
    if (!credits) {
      console.error("[iap] unknown product:", transaction.productId);
      return NextResponse.json({ error: "Unknown product" }, { status: 400 });
    }

    // Apple reuses `transactionId` across a purchase's lifetime; it's the
    // stable per-purchase key. originalTransactionId would collapse repeat
    // buys of the same consumable into one, so don't use it here.
    const refId = String(transaction.transactionId);

    const already = await prisma.creditTransaction.findFirst({
      where: { refType: "apple_iap", refId },
      select: { id: true },
    });
    if (already) {
      const balance = await UserService.getCredits(session.user.id);
      return NextResponse.json({ ok: true, credits, balance, duplicate: true });
    }

    const updated = await UserService.addCredits(session.user.id, credits, {
      reason: "apple_iap_purchase",
      refType: "apple_iap",
      refId,
      note: `${transaction.productId} · ${transaction.environment || "Production"}`,
    });

    return NextResponse.json({ ok: true, credits, balance: updated.credits });
  } catch (err) {
    console.error("[iap] grant failed:", err);
    return NextResponse.json({ error: "Could not complete purchase" }, { status: 500 });
  }
}
