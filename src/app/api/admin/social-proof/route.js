/**
 * /api/admin/social-proof
 *
 * Owner-gated (matches the existing /admin pattern). Three verbs:
 *
 *   GET    → { config, stats, recent }
 *            stats: { served24h, served7d, clicks24h, clicks7d,
 *                     ctrPct24h, ctrPct7d, uniqueIps24h, totalEver }
 *            recent: last 10 (visitorIp, userId, shownAt, clicked)
 *   PATCH  → update config { enabled?, sourceMode? }
 *   POST   → body { resetIp } deletes all SocialProofShown rows
 *            for that IP (so the visitor sees fresh users again)
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import {
  invalidateConfigCache,
  invalidateIpCache,
} from "@/lib/social-proof";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OWNER_EMAIL = "armankhan0826@gmail.com";

async function gateOwner() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false, code: 401 };
  if (session.user.email.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
    return { ok: false, code: 403 };
  }
  return { ok: true, session };
}

export async function GET() {
  const gate = await gateOwner();
  if (!gate.ok) return NextResponse.json({ error: "Forbidden" }, { status: gate.code });

  const oneDay  = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sevenDay = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    config,
    served24h,
    served7d,
    clicks24h,
    clicks7d,
    uniqueIps24h,
    totalEver,
    recent,
  ] = await Promise.all([
    prisma.socialProofConfig.findUnique({ where: { id: 1 } }).catch(() => null),
    prisma.socialProofShown.count({ where: { shownAt: { gte: oneDay } } }),
    prisma.socialProofShown.count({ where: { shownAt: { gte: sevenDay } } }),
    prisma.socialProofShown.count({ where: { shownAt: { gte: oneDay }, clicked: true } }),
    prisma.socialProofShown.count({ where: { shownAt: { gte: sevenDay }, clicked: true } }),
    prisma.socialProofShown
      .findMany({ where: { shownAt: { gte: oneDay } }, select: { visitorIp: true }, distinct: ["visitorIp"] })
      .then((r) => r.length),
    prisma.socialProofShown.count(),
    prisma.socialProofShown.findMany({
      orderBy: { shownAt: "desc" },
      take: 10,
      select: {
        visitorIp: true,
        shownAt:   true,
        clicked:   true,
        user:      { select: { name: true, isDummy: true, username: true } },
      },
    }),
  ]);

  return NextResponse.json({
    config: config || { id: 1, enabled: true, sourceMode: "both" },
    stats: {
      served24h,
      served7d,
      clicks24h,
      clicks7d,
      ctrPct24h: served24h > 0 ? Math.round((clicks24h / served24h) * 1000) / 10 : 0,
      ctrPct7d:  served7d  > 0 ? Math.round((clicks7d  / served7d)  * 1000) / 10 : 0,
      uniqueIps24h,
      totalEver,
    },
    recent,
  });
}

const VALID_SOURCES = ["real", "dummy", "both"];

export async function PATCH(req) {
  const gate = await gateOwner();
  if (!gate.ok) return NextResponse.json({ error: "Forbidden" }, { status: gate.code });

  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Bad body" }, { status: 400 }); }

  const data = {};
  if ("enabled" in body) {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be boolean" }, { status: 400 });
    }
    data.enabled = body.enabled;
  }
  if ("sourceMode" in body) {
    if (!VALID_SOURCES.includes(body.sourceMode)) {
      return NextResponse.json({ error: `sourceMode must be one of ${VALID_SOURCES.join(", ")}` }, { status: 400 });
    }
    data.sourceMode = body.sourceMode;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Upsert so a freshly-installed env that somehow missed the
  // INSERT seed still works.
  const updated = await prisma.socialProofConfig.upsert({
    where:  { id: 1 },
    update: data,
    create: { id: 1, enabled: data.enabled ?? true, sourceMode: data.sourceMode ?? "both" },
  });
  invalidateConfigCache();
  return NextResponse.json({ config: updated });
}

export async function POST(req) {
  const gate = await gateOwner();
  if (!gate.ok) return NextResponse.json({ error: "Forbidden" }, { status: gate.code });

  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Bad body" }, { status: 400 }); }

  const ip = String(body?.resetIp || "").trim();
  if (!ip) return NextResponse.json({ error: "resetIp required" }, { status: 400 });

  const result = await prisma.socialProofShown.deleteMany({ where: { visitorIp: ip } });
  invalidateIpCache(ip);
  return NextResponse.json({ deleted: result.count });
}
