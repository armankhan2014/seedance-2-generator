import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify the creation belongs to this user before deleting
    const creation = await prisma.creation.findFirst({
      where: { id, userId: user.id },
    });

    if (!creation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.creation.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete creation error:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
