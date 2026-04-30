import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// One-time migration: add 'verified' column that was lost in restore
// Secret prevents accidental calls
const SECRET = "mig-x9k2p7";

export async function GET(request) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Add verified column - IF NOT EXISTS is safe to run multiple times
    await prisma.$executeRaw`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "verified" BOOLEAN NOT NULL DEFAULT false`;

    // Verify it worked
    const result = await prisma.$queryRaw`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'User' AND column_name = 'verified'
    `;

    const userCount = await prisma.user.count();
    const creationCount = await prisma.creation.count();

    return NextResponse.json({
      success: true,
      message: "verified column added successfully",
      column: result,
      stats: { users: userCount, creations: creationCount },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
