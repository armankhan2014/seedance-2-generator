import { prisma } from "@/lib/prisma";

// Returns an image suitable for og:image / twitter:image. Resolves to:
//   1. The first input image of the most recent featured + completed creation
//   2. Fallback to /og-image.png in /public
//
// Why inputImages and not imageUrl: imageUrl on Creation actually holds the
// generated VIDEO URL (mp4), which crawlers like Facebook can't render in a
// link preview. inputImages[0] is a real JPG/PNG that was used as a reference
// for the generation, which makes a great preview.
//
// Vercel and OG crawlers cache aggressively. After deploying, the link
// preview won't refresh until the cache expires or the user re-fetches via
// https://developers.facebook.com/tools/debug/ (Facebook), https://www.linkedin.com/post-inspector/
// (LinkedIn), https://cards-dev.twitter.com/validator (Twitter / X).

export async function GET(req) {
  const origin = new URL(req.url).origin;
  const fallback = `${origin}/og-image.png`;

  try {
    const latest = await prisma.creation.findFirst({
      where: {
        featured: true,
        status: "completed",
        inputImages: { isEmpty: false },
      },
      orderBy: { createdAt: "desc" },
      select: { inputImages: true },
    });

    const url = latest?.inputImages?.[0];
    if (url && /^https?:\/\//.test(url)) {
      return Response.redirect(url, 302);
    }
  } catch (err) {
    console.error("[OG_IMAGE]", err.message);
  }

  return Response.redirect(fallback, 302);
}
