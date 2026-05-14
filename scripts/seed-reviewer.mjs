// One-time seed for the Play Store / App Store reviewer demo account.
//
// Run once:  node scripts/seed-reviewer.mjs
//
// Idempotent: re-running just tops up credits and updates the name. Safe
// to run on prod against the live DB — touches a single User row.
//
// The reviewer signs in via /api/auth/reviewer?token=YOUR_TOKEN. Make
// sure REVIEWER_TOKEN is set in Vercel env vars before pasting that URL
// into Play Console's "App access" instructions field.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const REVIEWER_EMAIL = process.env.REVIEWER_EMAIL || "play-store-reviewer@visualseffect.com";
const REVIEWER_NAME = "Play Store Reviewer";
const REVIEWER_CREDITS = 200; // enough for 4-5 generations at default cost

async function main() {
  const user = await prisma.user.upsert({
    where: { email: REVIEWER_EMAIL },
    update: { name: REVIEWER_NAME, credits: REVIEWER_CREDITS, verified: true },
    create: {
      email: REVIEWER_EMAIL,
      name: REVIEWER_NAME,
      credits: REVIEWER_CREDITS,
      verified: true,
      emailVerified: new Date(),
    },
  });

  console.log("\nReviewer user ready:");
  console.log("  id:      ", user.id);
  console.log("  email:   ", user.email);
  console.log("  credits: ", user.credits);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Set REVIEWER_TOKEN in Vercel env vars (long random string).");
  console.log("     Generate one with:  openssl rand -hex 32");
  console.log("  2. Paste this URL into Play Console → App access → Instructions:");
  console.log("     https://seedance.visualseffect.com/api/auth/reviewer?token=<your-token>");
  console.log("");
}

main()
  .catch((err) => {
    console.error("seed-reviewer failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
