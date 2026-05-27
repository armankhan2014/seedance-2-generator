/**
 * Seedance Studio — Cached DB Query Wrappers
 *
 * Uses Next.js unstable_cache to keep frequent DB reads in memory.
 * This means after the first request, subsequent calls return instantly
 * from cache instead of hitting Neon every time.
 *
 * Cache is automatically invalidated by tag when data changes.
 */
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

/** User credits — cached 30s per user, tag: user-{id} */
export const getCachedUserCredits = (userId) =>
  unstable_cache(
    () => prisma.user.findUnique({ where: { id: userId }, select: { credits: true } }),
    [`user-credits-${userId}`],
    { tags: [`user-${userId}`, "credits"], revalidate: 30 }
  )();

/** User profile — cached 60s per user, tag: user-{id} */
export const getCachedUserProfile = (userId) =>
  unstable_cache(
    () =>
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, image: true, credits: true, verified: true },
      }),
    [`user-profile-${userId}`],
    { tags: [`user-${userId}`], revalidate: 60 }
  )();

/** Public gallery — cached 60s, tag: public-gallery */
export const getCachedPublicGallery = () =>
  unstable_cache(
    async () => {
      const OWNER = "armankhan0826@gmail.com";
      const owner = await prisma.user.findUnique({ where: { email: OWNER } });
      if (!owner) return [];
      return prisma.creation.findMany({
        where: {
          userId: owner.id,
          status: "completed",
          featured: true,
          NOT: [{ imageUrl: null }, { imageUrl: "" }],
        },
        orderBy: { createdAt: "desc" },
        take: 24,
        select: { id: true, imageUrl: true, prompt: true, aspectRatio: true, resolution: true, duration: true, quality: true, createdAt: true, inputImages: true },
      });
    },
    ["public-gallery"],
    { tags: ["public-gallery"], revalidate: 60 }
  )();


/** User creations — cached 30s per user, tag: creations-{id}.
 *
 * Filters OUT status="failed" rows so the /creations gallery only
 * surfaces successful generations + in-flight "processing" jobs
 * (those still render the spinner tile until the webhook resolves
 * them). Failed rows stay in the DB for credit-ledger reconciliation
 * + admin debugging — they just don't pollute the user's gallery.
 *
 * Arman 2026-05-26: previously every userFault rejection (content
 * policy, prompt block) produced a red "Failed" card the user had
 * to manually delete. That card existed by design (visibility into
 * why credits moved) but Arman preferred a cleaner gallery — the
 * /credits page + CreditTransaction ledger is the canonical place
 * to see those charges now.
 */
export const getCachedUserCreations = (userId) =>
  unstable_cache(
    () => prisma.creation.findMany({
      where: {
        userId,
        // Hide failed rows from the gallery surface. Keep "processing"
        // visible so the user sees in-flight work (spinner card +
        // manual "Check status" button render correctly when status
        // is "processing").
        status: { not: "failed" },
      },
      orderBy: { createdAt: "desc" },
      // Phase 3 — eagerly include the paired music track so the
      // creations viewer can render synced audio under the video
      // without a second round-trip. Selecting only what the player
      // needs (URLs + duration + a couple display fields).
      include: {
        musicTrack: {
          select: {
            id: true,
            title: true,
            r2Url: true,
            audioUrl: true,
            streamUrl: true,
            actualDuration: true,
            durationReq: true,
            genre: true,
            mood: true,
          },
        },
      },
    }),
    [`user-creations-${userId}`],
    { tags: [`user-${userId}`, `creations-${userId}`], revalidate: 30 }
  )();
