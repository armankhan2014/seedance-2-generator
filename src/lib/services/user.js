import { prisma } from "@/lib/prisma";

// Every credit movement (deduct, refund, grant, purchase) flows through
// addCredits / deductCredits. Both write a row to CreditTransaction in
// the SAME prisma transaction as the User.credits update, so the ledger
// can never silently drift from the balance. Callers pass:
//
//   reason   — short snake_case tag describing the cause
//              ("video_generate", "prompt_expand", "image_build",
//               "music_generate", "stem_split", "voice_clean",
//               "stripe_purchase", "admin_grant", "signup_grant",
//               "refund_video", "refund_music", "userfault_charge").
//   refType  — optional model name the delta is tied to
//              ("Creation", "MusicTrack", "Payment", null).
//   refId    — optional row id of that model. Lets you trace a single
//              creation's debit + any later refund as a pair.
//   note     — free-text (admin name on grants, MuAPI error message on
//              userfault charges, etc.).
//
// `reason` is required to encourage callers to label every site —
// don't add a default. If you find yourself reaching for a default,
// add a new tag instead.

export const UserService = {
  async getCredits(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    return user?.credits || 0;
  },

  async addCredits(userId, amount, { reason, refType = null, refId = null, note = null } = {}) {
    if (!reason) throw new Error("UserService.addCredits requires a reason tag");
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error(`UserService.addCredits requires a positive integer amount (got ${amount})`);
    }
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { credits: { increment: amount } },
        select: { id: true, credits: true },
      });
      await tx.creditTransaction.create({
        data: { userId, delta: amount, reason, refType, refId, note },
      });
      return updated;
    });
  },

  async deductCredits(userId, amount = 1, { reason, refType = null, refId = null, note = null } = {}) {
    if (!reason) throw new Error("UserService.deductCredits requires a reason tag");
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error(`UserService.deductCredits requires a positive integer amount (got ${amount})`);
    }

    // Upsert + balance-check + decrement + log in a single transaction
    // so a concurrent deduct can't race past the balance check. Without
    // the tx wrapper a user with 100cr could submit 5×80cr jobs in
    // parallel and end up with negative credits.
    return await prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });

      if (!user) {
        user = await tx.user.create({
          data: { id: userId, credits: 10 },
          select: { credits: true },
        });
        await tx.creditTransaction.create({
          data: { userId, delta: 10, reason: "signup_grant", note: "auto-created on first deduct" },
        });
      }

      if (user.credits < amount) {
        throw new Error("Insufficient credits");
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: { credits: { decrement: amount } },
        select: { id: true, credits: true },
      });
      await tx.creditTransaction.create({
        data: { userId, delta: -amount, reason, refType, refId, note },
      });
      return updated;
    });
  },

  async findByEmail(email) {
    return await prisma.user.findUnique({ where: { email } });
  }
};
