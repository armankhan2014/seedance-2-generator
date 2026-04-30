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
          NOT: [{ imageUrl: null }, { imageUrl: "" }],
        },
        orderBy: { createdAt: "desc" },
        take: 24,
        select: { id: true, imageUrl: true, prompt: true, aspectRatio: true, resolution: true, duration: true, createdAt: true },
      });
    },
    ["public-gallery"],
    { tags: ["public-gallery"], revalidate: 60 }
  )();


/** User creations — cached 30s per user, tag: creations-{id} */
export const getCachedUserCreations = (userId) =>
  unstable_cache(
    () => prisma.creation.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    [`user-creations-${userId}`],
    { tags: [`user-${userId}`, `creations-${userId}`], revalidate: 30 }
  )();
