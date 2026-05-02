import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const OWNER_EMAIL = "armankhan0826@gmail.com";

export async function GET(req) {
  // Only owner can run this
  const session = await getServerSession(authOptions);
  if (!session || session.user.email !== OWNER_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Payment" (
        id TEXT NOT NULL,
        "stripeSessionId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        credits INTEGER NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Payment_pkey" PRIMARY KEY (id),
        CONSTRAINT "Payment_stripeSessionId_key" UNIQUE ("stripeSessionId"),
        CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId")
          REFERENCES "User"(id) ON DELETE CASCADE
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Payment_userId_idx" ON "Payment"("userId")
    `);

    // Verify the table exists
    const check = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'Payment'
    `);

    return NextResponse.json({ success: true, message: "Payment table created successfully", check });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
