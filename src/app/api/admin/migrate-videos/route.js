import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadVideoFromUrl, isR2Configured } from "@/lib/storage";

// Protect with ADMIN_SECRET or NEXTAUTH admin check
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");

  // Simple secret check — pass ?secret=YOUR_ADMIN_EMAIL
  if (!secret || secret !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isR2Configured()) {
    return NextResponse.json({ error: "R2 not configured" }, { status: 500 });
  }

  const r2Base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");

  // Find all completed creations NOT already on R2
  const toMigrate = await prisma.creation.findMany({
    where: {
      status: "completed",
      imageUrl: { not: null },
      NOT: { imageUrl: { startsWith: r2Base } },
    },
    select: { id: true, imageUrl: true },
    orderBy: { createdAt: "asc" },
  });

  if (toMigrate.length === 0) {
    return NextResponse.json({ message: "All videos already on R2 ✅", migrated: 0 });
  }

  const results = { migrated: 0, failed: 0, errors: [] };

  // Stream response using ReadableStream so browser sees live progress
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(obj) + "\n"));
      };

      send({ total: toMigrate.length, message: `Starting migration of ${toMigrate.length} videos...` });

      for (const creation of toMigrate) {
        try {
          const ext = creation.imageUrl.includes(".webm") ? "webm" : "mp4";
          const key = `videos/${creation.id}.${ext}`;
          const newUrl = await uploadVideoFromUrl(creation.imageUrl, key);

          await prisma.creation.update({
            where: { id: creation.id },
            data: { imageUrl: newUrl },
          });

          results.migrated++;
          send({ id: creation.id, status: "ok", url: newUrl, progress: `${results.migrated}/${toMigrate.length}` });
        } catch (err) {
          results.failed++;
          results.errors.push({ id: creation.id, error: err.message });
          send({ id: creation.id, status: "failed", error: err.message });
        }
      }

      send({
        done: true,
        migrated: results.migrated,
        failed: results.failed,
        message: `Done! ${results.migrated} migrated, ${results.failed} failed.`,
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
    },
  });
}
