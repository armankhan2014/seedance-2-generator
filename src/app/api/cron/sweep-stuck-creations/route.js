import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AIService } from "@/lib/services/ai";
import { UserService } from "@/lib/services/user";

// Nightly cron — auto-closes Creation rows stuck in status="processing"
// past a sane timeout. Mirrors exactly what the runtime does on a real
// detected timeout:
//
//   1. Conditional updateMany: status processing → failed (so a webhook
//      that lands MID-sweep can't be overwritten — only ONE caller flips
//      a given row, the other becomes a no-op).
//   2. Refund the original cost via UserService.addCredits, which writes
//      a CreditTransaction row with reason="refund_video" + refId so the
//      ledger stays in sync with User.credits.
//
// Why this matters: MuAPI occasionally drops the webhook (network blip,
// content-policy reject without callback, infra timeout). Without this
// cron, those rows pile up as eternal "GENERATING..." cards in the
// gallery — Arman cleaned up 14 of them by hand on 2026-05-26 (~3 weeks
// of accumulation).
//
// Auth: gated by CRON_SECRET env var. Vercel cron POSTs with header
// `Authorization: Bearer <CRON_SECRET>`. If the secret isn't set,
// the route refuses to run (fail-closed) so a misconfigured deploy
// never silently auto-refunds.
//
// Threshold: 30 minutes. MuAPI normally finishes in seconds; 30 min
// is a generous buffer that won't accidentally close a slow-but-live
// job. Stored in TIMEOUT_MS so it's easy to tune.
//
// Schedule: configured in vercel.json — runs hourly so max stuck time
// before cleanup is ~90 min (30 min threshold + 60 min between runs).
//
// Idempotent: safe to invoke manually any number of times. The
// conditional `status="processing"` filter on the update prevents
// double-refunding a row that was already swept.
//
// Cost: a single Prisma findMany + N small transactions per stuck row.
// Even on a backlog of thousands of rows, this is well under a Vercel
// function invocation budget.

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

async function handle(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Fail-closed: refuse to run if secret isn't configured. Prevents
    // an unauthed sweep on a half-deployed instance.
    console.error("[CRON] CRON_SECRET not set — refusing to run sweep");
    return NextResponse.json(
      { error: "Cron secret not configured" },
      { status: 500 }
    );
  }
  const auth = req.headers.get("authorization") || "";
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - TIMEOUT_MS);
  const stuck = await prisma.creation.findMany({
    where: { status: "processing", createdAt: { lt: cutoff } },
    select: {
      id: true,
      userId: true,
      duration: true,
      quality: true,
      resolution: true,
      videoFiles: true,
      audioFiles: true,
      inputImages: true,
      createdAt: true,
    },
  });

  if (stuck.length === 0) {
    return NextResponse.json({ ok: true, swept: 0, refunded: 0 });
  }

  let swept = 0;
  let refunded = 0;
  const errors = [];

  for (const c of stuck) {
    try {
      // Conditional flip — only this caller wins if a webhook is racing
      // us. updateMany.count of 1 means we own the close; 0 means
      // someone else already resolved it (webhook arrived just now).
      const flipped = await prisma.creation.updateMany({
        where: { id: c.id, status: "processing" },
        data: {
          status: "failed",
          error: `Auto-closed by cron — stuck > ${Math.floor(TIMEOUT_MS / 60000)} min, refunded`,
        },
      });
      if (flipped.count !== 1) continue;

      const cost = AIService.estimateCostFromCreation(c);
      if (cost > 0) {
        await UserService.addCredits(c.userId, cost, {
          reason: "refund_video",
          refType: "Creation",
          refId: c.id,
          note: `Cron sweep — stuck ${Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 60000)} min`,
        });
        refunded += cost;
      }
      swept += 1;
    } catch (err) {
      console.error(`[CRON] Sweep failed for creation ${c.id}:`, err?.message);
      errors.push({ id: c.id, message: err?.message });
    }
  }

  console.log(`[CRON] Swept ${swept} stuck creations, refunded ${refunded} credits`);
  return NextResponse.json({
    ok: true,
    swept,
    refunded,
    errors: errors.length ? errors : undefined,
  });
}

// Vercel cron sends a GET by default; expose both verbs so manual
// curl tests with -X POST also work.
export const GET = handle;
export const POST = handle;
