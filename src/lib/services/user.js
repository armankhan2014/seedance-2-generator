import { prisma } from "@/lib/prisma";

export const UserService = {
  async getCredits(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    return user?.credits || 0;
  },

  async addCredits(userId, amount) {
    return await prisma.user.update({
      where: { id: userId },
      data: { credits: { increment: amount } },
    });
  },

  async deductCredits(userId, amount = 1) {
    // Upsert user in case NextAuth hasn't synced them yet
    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });

    if (!user) {
      // Create user with default 10 credits
      user = await prisma.user.create({
        data: { id: userId, credits: 10 },
        select: { credits: true },
      });
    }

    if (user.credits < amount) {
      throw new Error("Insufficient credits");
    }

    return await prisma.user.update({
      where: { id: userId },
      data: { credits: { decrement: amount } },
    });
  },

  async findByEmail(email) {
    return await prisma.user.findUnique({ where: { email } });
  }
};
