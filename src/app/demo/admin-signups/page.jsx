import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import SignupsDashboard from "./SignupsDashboard";

/**
 * /demo/admin-signups — daily signups tracker (Arman-only).
 *
 * Server component. Loads all dashboard data in parallel via
 * Promise.all then hands off to the client component for filtering
 * + sorting interactivity. Demo-first per the project's workflow:
 * once Arman approves the look, port to /admin/signups and delete
 * this folder.
 *
 * Auth guard mirrors the existing /admin route exactly — OWNER_EMAIL
 * hardcoded constant, redirect to homepage on mismatch. Same gate
 * pattern, same redirect target so the access control story is
 * unified.
 */

const OWNER_EMAIL = "armankhan0826@gmail.com";

export const dynamic = "force-dynamic";

// Country-name lookup for the table (uses ISO-3166-1 alpha-2 codes
// stored in User.country). Flag emoji is derived from the code via
// Unicode regional indicator math — no lookup table needed.
function countryToFlag(code) {
  if (!code || code.length !== 2) return "🌐";
  const A = 0x1f1e6; // regional indicator A
  return String.fromCodePoint(
    A + (code.toUpperCase().charCodeAt(0) - 65),
    A + (code.toUpperCase().charCodeAt(1) - 65),
  );
}

async function getSignupsData() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  const startOfWeek = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    todayCount,
    yesterdayCount,
    weekCount,
    monthCount,
    todayRows,
    topCountries,
    topSources,
  ] = await Promise.all([
    // Big numbers up top
    prisma.user.count({
      where: { createdAt: { gte: startOfToday }, isDummy: false },
    }),
    prisma.user.count({
      where: {
        createdAt: { gte: startOfYesterday, lt: startOfToday },
        isDummy: false,
      },
    }),
    prisma.user.count({
      where: { createdAt: { gte: startOfWeek }, isDummy: false },
    }),
    prisma.user.count({
      where: { createdAt: { gte: startOfMonth }, isDummy: false },
    }),
    // Full table for today, newest first
    prisma.user.findMany({
      where: { createdAt: { gte: startOfToday }, isDummy: false },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        emailVerified: true,
        country: true,
        region: true,
        city: true,
        ipAddress: true,
        signupSource: true,
        createdAt: true,
        referredBy: { select: { id: true, name: true, email: true } },
      },
      take: 200,
    }),
    // "Top countries today" insight
    prisma.user.groupBy({
      by: ["country"],
      where: { createdAt: { gte: startOfWeek }, isDummy: false, country: { not: null } },
      _count: { country: true },
      orderBy: { _count: { country: "desc" } },
      take: 5,
    }),
    // "Top source today" insight
    prisma.user.groupBy({
      by: ["signupSource"],
      where: { createdAt: { gte: startOfWeek }, isDummy: false, signupSource: { not: null } },
      _count: { signupSource: true },
      orderBy: { _count: { signupSource: "desc" } },
      take: 5,
    }),
  ]);

  // Decorate rows with flag emoji + relative time for client convenience
  const rows = todayRows.map((u) => ({
    id: u.id,
    name: u.name || "(no name)",
    email: u.email,
    image: u.image,
    verified: !!u.emailVerified,
    flag: countryToFlag(u.country),
    country: u.country,
    region: u.region,
    city: u.city,
    ipAddress: u.ipAddress,
    signupSource: u.signupSource || "direct",
    createdAtIso: u.createdAt?.toISOString() ?? null,
    referredBy: u.referredBy
      ? {
          id: u.referredBy.id,
          name: u.referredBy.name || u.referredBy.email,
        }
      : null,
  }));

  const topCountriesFlat = topCountries.map((g) => ({
    country: g.country,
    flag: countryToFlag(g.country),
    count: g._count.country,
  }));
  const topSourcesFlat = topSources.map((g) => ({
    source: g.signupSource,
    count: g._count.signupSource,
  }));

  return {
    todayCount,
    yesterdayCount,
    weekCount,
    monthCount,
    rows,
    topCountries: topCountriesFlat,
    topSources: topSourcesFlat,
  };
}

export default async function AdminSignupsDemoPage() {
  // ── Debug-friendly auth gate ────────────────────────────────────────
  // Bare bones version that surfaces the actual failure cause instead
  // of silently redirecting. Once we confirm the route is hitting cleanly
  // for Arman, this can be tightened back to a plain redirect("/").
  let session = null;
  let authError = null;
  try {
    session = await getServerSession(authOptions);
  } catch (err) {
    authError = err?.message || String(err);
  }
  const currentEmail = session?.user?.email ?? null;

  if (!session || currentEmail !== OWNER_EMAIL) {
    return (
      <main style={{ minHeight: "100vh", background: "#0a0a0a", color: "#f5f5f5", padding: "60px 24px", fontFamily: "ui-sans-serif, system-ui" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <h1 style={{ fontSize: 22, marginBottom: 12 }}>/demo/admin-signups · access debug</h1>
          <pre style={{ background: "#111", padding: 16, borderRadius: 8, fontSize: 12, whiteSpace: "pre-wrap", color: "#ccc" }}>
{JSON.stringify({
  authError,
  hasSession: !!session,
  currentEmail,
  expectedEmail: OWNER_EMAIL,
  match: currentEmail === OWNER_EMAIL,
}, null, 2)}
          </pre>
          <p style={{ marginTop: 20, color: "#888", fontSize: 13 }}>
            If <code>hasSession</code> is false → not signed in.
            If <code>currentEmail</code> is a different address → signed in with the wrong account.
            If both look right but you still see this → tell Claude.
          </p>
        </div>
      </main>
    );
  }

  // Auth passed. Run the data fetch with try/catch so any Prisma /
  // schema-drift error surfaces visibly instead of falling through to
  // the app's not-found page.
  let data = null;
  let fetchError = null;
  try {
    data = await getSignupsData();
  } catch (err) {
    fetchError = err?.message || String(err);
    console.error("[admin-signups] data fetch failed:", err);
  }

  if (fetchError) {
    return (
      <main style={{ minHeight: "100vh", background: "#0a0a0a", color: "#f5f5f5", padding: "60px 24px", fontFamily: "ui-sans-serif, system-ui" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h1 style={{ fontSize: 22, marginBottom: 12, color: "#ff6b6b" }}>Data fetch failed</h1>
          <pre style={{ background: "#111", padding: 16, borderRadius: 8, fontSize: 12, whiteSpace: "pre-wrap", color: "#ff9b9b" }}>
{fetchError}
          </pre>
          <p style={{ marginTop: 20, color: "#888", fontSize: 13 }}>
            This is usually a schema/Prisma drift error. Share the exact text above with Claude.
          </p>
        </div>
      </main>
    );
  }

  return <SignupsDashboard {...data} />;
}
