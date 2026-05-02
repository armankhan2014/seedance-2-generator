import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// One-time migration — protected by secret token, delete after use
const SECRET = "seedance-migrate-2026";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") !== SECRET) {
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

    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "Payment_userId_idx" ON "Payment"("userId")`
    );

    const check = await prisma.$queryRawUnsafe(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'Payment'
    `);

    return NextResponse.json({ success: true, message: "Payment table ready", tables: check });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
