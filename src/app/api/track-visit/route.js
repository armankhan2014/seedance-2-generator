import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVisitNotification } from "@/lib/email";

// Cap visit emails to 20/hour per serverless instance. This route is
// anonymous, so without a cap an attacker rotating IPs could flood the
// owner's inbox. Past the cap we still record the visit in the DB but
// skip the email.
const EMAIL_CAP_PER_HOUR = 20;
let emailsSentThisHour = 0;
let emailWindowStart = Date.now();

export async function POST(req) {
  try {
    // Get real IP from Vercel headers
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";

    // Skip localhost / private IPs
    if (!ip || ip === "unknown" || ip === "::1" || ip.startsWith("127.") || ip.startsWith("192.168.") || ip.startsWith("10.")) {
      return NextResponse.json({ ok: true, skipped: "local" });
    }

    const body = await req.json().catch(() => ({}));
    const { page, userAgent } = body;

    // Dedup: skip if same IP visited in last 24 hours
    const recent = await prisma.visit.findFirst({
      where: {
        ip,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (recent) return NextResponse.json({ ok: true, skipped: "duplicate" });

    // Geolocation via ip-api.com (free, no key needed)
    let geo = {};
    try {
      const geoRes = await fetch(
        `http://ip-api.com/json/${ip}?fields=country,regionName,city,isp,status`,
        { signal: AbortSignal.timeout(3000) }
      );
      const geoData = await geoRes.json();
      if (geoData.status === "success") {
        geo = {
          country: geoData.country,
          region: geoData.regionName,
          city: geoData.city,
          isp: geoData.isp,
        };
      }
    } catch (_) {}

    // Save to DB
    const visit = await prisma.visit.create({
      data: {
        ip,
        page: page || "/",
        userAgent: userAgent || null,
        ...geo,
      },
    });

    // Send email notification (fire and forget — never block the response).
    // Rate-limited per serverless instance to prevent inbox flooding.
    const now = Date.now();
    if (now - emailWindowStart > 60 * 60 * 1000) {
      emailsSentThisHour = 0;
      emailWindowStart = now;
    }
    if (emailsSentThisHour < EMAIL_CAP_PER_HOUR) {
      emailsSentThisHour += 1;
      sendVisitNotification({ ip, page: page || "/", ...geo }).catch(() => {});
    }

    return NextResponse.json({ ok: true, id: visit.id });
  } catch (err) {
    console.error("[TRACK_VISIT]", err);
    return NextResponse.json({ ok: false });
  }
}
