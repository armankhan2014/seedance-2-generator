import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import AdminDashboard from "./AdminDashboard";

// Studio admin — gated to OWNER_EMAIL. Loads the dashboard data
// server-side in one parallel Promise.all, then hands off to the
// AdminDashboard client component for the interactive 8-tab UI.
//
// The /admin tree is locked here, not in a layout — the existing
// codebase pattern was a per-page redirect, kept that intact for
// continuity. Anyone whose session.user.email doesn't match
// OWNER_EMAIL is bounced to the homepage.

const OWNER_EMAIL = "armankhan0826@gmail.com";

export const dynamic = "force-dynamic";

function planLabel(credits) {
  if (credits >= 24000) return "Quantum Flow";
  if (credits >= 7000)  return "Power Engine";
  if (credits >= 3000)  return "Starter Manifest";
  return "Custom";
}

function centsFromCredits(credits) {
  // 80 credits = $1, so credits × 100 ÷ 80 = cents.
  return Math.round((credits / 80) * 100);
}

function logErr(label) {
  return (err) => {
    console.error(`[STUDIO_ADMIN] ${label} failed:`, err?.message || err);
    return null;
  };
}

async function getAdminData() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    users,
    creations,
    payments,
    visits,
    totalVisits,
    uniqueVisitorRows,
    recentCreations,
    creationCount,
    creationsToday,
    creationsFailed30d,
  ] = await Promise.all([
    prisma.user.findMany({
      include: { _count: { select: { creations: true } } },
      orderBy: { id: "desc" },
    }).catch(logErr("users")),

    prisma.creation.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    }).catch(logErr("creations")),

    prisma.payment.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true, image: true } } },
    }).catch(logErr("payments")),

    prisma.visit.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    }).catch(logErr("visits")),

    prisma.visit.count().catch(logErr("totalVisits")),

    prisma.visit.groupBy({
      by: ["ip"],
      _count: { _all: true },
    }).catch(logErr("uniqueVisits")),

    prisma.creation.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    }).catch(logErr("recentCreations")),

    prisma.creation.count().catch(logErr("creationCount")),

    prisma.creation.count({ where: { createdAt: { gte: oneDayAgo } } }).catch(logErr("creationsToday")),

    prisma.creation.count({
      where: { createdAt: { gte: thirtyDaysAgo }, status: "failed" },
    }).catch(logErr("creationsFailed30d")),
  ]);

  // Derive aggregates client-safe (no Decimal types).
  const usersList = users || [];
  const paymentsList = payments || [];
  const visitsList = visits || [];

  const totalCreditsLeft = usersList.reduce((s, u) => s + (u.credits ?? 0), 0);
  const totalRevenueCents = paymentsList.reduce((s, p) => s + centsFromCredits(p.credits), 0);
  const uniquePayerIds = new Set(paymentsList.map((p) => p.userId));
  const uniqueVisitors = (uniqueVisitorRows || []).length;
  const today = new Date(Date.now() - 86400000);
  const visitorsToday = visitsList.filter((v) => new Date(v.createdAt) > today).length;

  // Plan distribution
  const planCounts = { "Quantum Flow": 0, "Power Engine": 0, "Starter Manifest": 0, "Custom": 0 };
  for (const u of usersList) {
    planCounts[planLabel(u.credits ?? 0)]++;
  }

  // Shape filmmakers for the dashboard — include plan label + spend
  // calculated from their payment history.
  const spendByUser = {};
  for (const p of paymentsList) {
    spendByUser[p.userId] = (spendByUser[p.userId] || 0) + centsFromCredits(p.credits);
  }
  const filmmakers = usersList.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image,
    credits: u.credits ?? 0,
    plan: planLabel(u.credits ?? 0),
    totalSpentCents: spendByUser[u.id] || 0,
    creationCount: u._count?.creations ?? 0,
    createdAt: u.id, // CUIDs are roughly time-ordered; use id as a proxy
    verified: !!u.verified,
    isAdmin: u.email === OWNER_EMAIL,
  }));

  // Shape generations — pull out the prompt + status + duration + req id.
  const generations = (recentCreations || []).map((c) => ({
    id: c.id,
    userEmail: c.user?.email || "—",
    userName: c.user?.name || "—",
    prompt: c.prompt || "",
    status: c.status,
    duration: c.duration,
    resolution: c.resolution,
    quality: c.quality,
    requestId: c.requestId,
    error: c.error,
    createdAt: c.createdAt.toISOString(),
  }));

  // Shape payments
  const paymentsShaped = paymentsList.map((p) => ({
    id: p.id,
    user: p.user?.email || "—",
    userName: p.user?.name || "—",
    credits: p.credits,
    amountUsd: centsFromCredits(p.credits) / 100,
    stripeSessionId: p.stripeSessionId,
    createdAt: p.createdAt.toISOString(),
  }));

  // Shape visits
  const visitsShaped = visitsList.map((v) => ({
    id: v.id,
    ip: v.ip,
    country: v.country,
    city: v.city,
    region: v.region,
    isp: v.isp,
    page: v.page,
    userAgent: v.userAgent,
    createdAt: v.createdAt.toISOString(),
  }));

  // Security flags — derive from Visit data + Creation failures.
  const securityFlags = [];
  // Detect VPN by looking for common keywords in ISP names.
  const VPN_KEYWORDS = /vpn|nord|express|proton|surfshark|mullvad|tor|hosting|datacenter|digitalocean|aws ec2|google cloud/i;
  const vpnVisits = visitsList.filter((v) => v.isp && VPN_KEYWORDS.test(v.isp));
  if (vpnVisits.length > 0) {
    const sample = vpnVisits.slice(0, 3);
    securityFlags.push({
      id: "vpn-visits",
      severity: "medium",
      title: `${vpnVisits.length} visit${vpnVisits.length === 1 ? "" : "s"} from VPN / datacenter IPs`,
      detail: `Recent ISP match on VPN keywords: ${sample.map((v) => `${v.ip} (${v.isp})`).join(" · ")}. Could be legitimate users behind privacy tools — flagged for awareness, not action.`,
    });
  }
  if (creationsFailed30d > 0) {
    securityFlags.push({
      id: "failed-gens",
      severity: creationsFailed30d > 10 ? "high" : "medium",
      title: `${creationsFailed30d} failed generation${creationsFailed30d === 1 ? "" : "s"} in 30 days`,
      detail: `Most likely content-policy (face-detect) or transient MuAPI issues. Auto-refunds fired where applicable. Check the Generations tab → Failed filter for details.`,
    });
  }

  return {
    counts: {
      filmmakers: usersList.length,
      paidUsers: uniquePayerIds.size,
      totalCredits: totalCreditsLeft,
      totalOrders: paymentsList.length,
      revenueCents: totalRevenueCents,
      generations: creationCount ?? 0,
      generationsToday: creationsToday ?? 0,
      generationsFailed30d: creationsFailed30d ?? 0,
      visits: totalVisits ?? 0,
      uniqueVisitors,
      visitorsToday,
      securityFlags: securityFlags.length,
      plans: planCounts,
    },
    filmmakers,
    generations,
    payments: paymentsShaped,
    visits: visitsShaped,
    securityFlags,
    ownerEmail: OWNER_EMAIL,
  };
}

export default async function AdminPage() {
  let session = null;
  try {
    session = await getServerSession(authOptions);
  } catch (err) {
    // Auth blip — bounce to homepage rather than expose the admin shell.
    redirect("/");
  }

  if (!session || session.user?.email !== OWNER_EMAIL) {
    redirect("/");
  }

  const data = await getAdminData();
  return <AdminDashboard initialData={data} />;
}
