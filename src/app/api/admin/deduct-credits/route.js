import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";

// Admin-only credit deduction. Mirror of /api/admin/add-credits but
// removes credits instead of adding. Used when an admin needs to:
//   • Claw back a refund that was issued in error
//   • Correct a manual over-grant
//   • Adjust a balance after support-side disputes
//
// Refuses to let a user's balance go negative — if the requested
// deduct amount exceeds their current credits, returns 400 with the
// current balance so the admin can decide (deduct exactly what's
// available, or skip). This keeps the credit ledger invariant:
// SUM(CreditTransaction.delta) per user always equals User.credits.
//
// Atomic: balance update + CreditTransaction insert happen in one
// Prisma transaction so a crash mid-call never leaves the ledger
// out of sync with the live balance.

const ADMIN_EMAIL = "armankhan0826@gmail.com";

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email, credits, note } = await req.json();
  if (!email || !credits || parseInt(credits) <= 0) {
    return NextResponse.json({ error: "email and credits required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, credits: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const amount = parseInt(credits);

  // Refuse to overdraw — keeps the ledger invariant.
  if (user.credits < amount) {
    return NextResponse.json(
      {
        error: "Deduction would push balance negative",
        currentBalance: user.credits,
        requestedDeduct: amount,
      },
      { status: 400 }
    );
  }

  const adminNote = note ? `${note} (by ${session.user.email})` : `deducted by ${session.user.email}`;

  const [, updated] = await prisma.$transaction([
    prisma.creditTransaction.create({
      data: {
        userId: user.id,
        delta: -amount, // negative delta — same column the auto refunds use
        reason: "admin_deduct",
        note: adminNote,
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { credits: { decrement: amount } },
      select: { credits: true },
    }),
  ]);

  revalidateTag(`user-${user.id}`);
  return NextResponse.json({
    success: true,
    email,
    creditsDeducted: amount,
    newTotal: updated.credits,
  });
}
