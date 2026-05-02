import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import AddCreditsWidget from "./AddCreditsWidget";

const OWNER_EMAIL = "armankhan0826@gmail.com";

export const dynamic = "force-dynamic";

function planLabel(credits) {
  if (credits >= 24000) return { label: "Quantum Flow",     color: "#a78bfa", bg: "#2a1a40" };
  if (credits >= 7000)  return { label: "Power Engine",     color: "#818cf8", bg: "#1a2040" };
  if (credits >= 3000)  return { label: "Starter Manifest", color: "#34d399", bg: "#1a3028" };
  return                        { label: "Custom",           color: "#f59e0b", bg: "#2a2010" };
}

function centsFromCredits(credits) {
  return Math.round((credits / 80) * 100);
}

export default async function AdminDashboard() {
  // ── Auth check ──
  let session;
  try {
    session = await getServerSession(authOptions);
  } catch (err) {
    return <ErrorPage msg={"Auth error: " + err.message} />;
  }

  if (!session || session.user.email !== OWNER_EMAIL) {
    redirect("/");
  }

  // ── DB queries ──
  let users = [], recentCreations = [], payments = [];
  try {
    [users, recentCreations, payments] = await Promise.all([
      prisma.user.findMany({
        include: { _count: { select: { creations: true } } },
        orderBy: { id: "desc" },
      }),
      prisma.creation.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, email: true } } },
      }),
      prisma.payment.findMany({
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, email: true, image: true } } },
      }),
    ]);
  } catch (err) {
    return <ErrorPage msg={"Database error: " + err.message} />;
  }

  const totalCreations   = users.reduce((s, u) => s + u._count.creations, 0);
  const totalCreditsLeft = users.reduce((s, u) => s + (u.credits ?? 0), 0);
  const totalRevenueCents = payments.reduce((s, p) => s + centsFromCredits(p.credits), 0);
  const uniquePayerIds   = new Set(payments.map(p => p.userId));
  const userList = users.map(u => ({ email: u.email, name: u.name, credits: u.credits ?? 0 }));

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", color: "#f0f0f0", fontFamily: "system-ui, sans-serif", padding: "32px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "#fff" }}>
              <span style={{ color: "#ec4899" }}>⚡</span> Admin Dashboard
            </h1>
            <p style={{ color: "#888", margin: "4px 0 0", fontSize: 13 }}>Seedance Studio · {new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
          </div>
          <a href="/" style={{ color: "#ec4899", fontSize: 13, textDecoration: "none" }}>← Back to site</a>
        </div>

        {/* Stat Cards — Row 1 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 16 }}>
          {[
            { label: "Total Users",       value: users.length,                      icon: "👥", color: "#818cf8" },
            { label: "Total Videos",      value: totalCreations,                    icon: "🎬", color: "#ec4899" },
            { label: "Credits Remaining", value: totalCreditsLeft.toLocaleString(), icon: "💎", color: "#34d399" },
          ].map(card => (
            <div key={card.label} style={{ background: "#1a1a2e", borderRadius: 12, padding: "20px 22px", border: "1px solid #2a2a40" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{card.icon}</div>
              <div style={{ fontSize: 30, fontWeight: 700, color: card.color }}>{card.value}</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{card.label}</div>
            </div>
          ))}
        </div>

        {/* Stat Cards — Row 2 (Revenue) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 36 }}>
          {[
            { label: "Paid Users",    value: uniquePayerIds.size,                         icon: "💳", color: "#f59e0b" },
            { label: "Total Orders",  value: payments.length,                             icon: "🧾", color: "#a78bfa" },
            { label: "Total Revenue", value: "$" + (totalRevenueCents / 100).toFixed(2), icon: "💰", color: "#34d399" },
          ].map(card => (
            <div key={card.label} style={{ background: "#1a1a2e", borderRadius: 12, padding: "20px 22px", border: "1px solid #2a2a40" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{card.icon}</div>
              <div style={{ fontSize: 30, fontWeight: 700, color: card.color }}>{card.value}</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{card.label}</div>
            </div>
          ))}
        </div>

        <AddCreditsWidget users={userList} />

        {/* Purchases Table */}
        <div style={{ background: "#1a1a2e", borderRadius: 14, border: "1px solid #2a2a40", marginBottom: 32, overflow: "hidden" }}>
          <div style={{ padding: "18px 22px", borderBottom: "1px solid #2a2a40", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>💳 Purchases</h2>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#888" }}>{payments.length} order{payments.length !== 1 ? "s" : ""}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#34d399" }}>Total: ${(totalRevenueCents / 100).toFixed(2)} USD</span>
            </div>
          </div>
          {payments.length === 0 ? (
            <div style={{ padding: "40px 22px", textAlign: "center", color: "#555", fontSize: 14 }}>No purchases yet</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#12122a" }}>
                    {["Customer", "Email", "Plan", "Credits", "Amount", "Date"].map(h => (
                      <th key={h} style={{ padding: "10px 18px", textAlign: "left", color: "#888", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, i) => {
                    const { label, color, bg } = planLabel(p.credits);
                    return (
                      <tr key={p.id} style={{ borderTop: "1px solid #2a2a40", background: i % 2 === 0 ? "transparent" : "#12122080" }}>
                        <td style={{ padding: "12px 18px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            {p.user?.image
                              ? <img src={p.user.image} alt="" width={28} height={28} style={{ borderRadius: "50%", objectFit: "cover" }} />
                              : <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#000" }}>
                                  {(p.user?.name || p.user?.email || "?")[0].toUpperCase()}
                                </div>
                            }
                            <span style={{ fontWeight: 500, color: "#e0e0e0" }}>{p.user?.name || "—"}</span>
                          </div>
                        </td>
                        <td style={{ padding: "12px 18px", color: "#aaa" }}>{p.user?.email || "—"}</td>
                        <td style={{ padding: "12px 18px" }}>
                          <span style={{ background: bg, color, padding: "3px 10px", borderRadius: 20, fontWeight: 600, fontSize: 11 }}>{label}</span>
                        </td>
                        <td style={{ padding: "12px 18px" }}>
                          <span style={{ background: "#1e3a2a", color: "#34d399", padding: "3px 10px", borderRadius: 20, fontWeight: 600, fontSize: 12 }}>
                            +{p.credits.toLocaleString()}
                          </span>
                        </td>
                        <td style={{ padding: "12px 18px", color: "#fbbf24", fontWeight: 700, fontSize: 14 }}>
                          ${(centsFromCredits(p.credits) / 100).toFixed(2)}
                        </td>
                        <td style={{ padding: "12px 18px", color: "#666", fontSize: 12, whiteSpace: "nowrap" }}>
                          {p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* All Users Table */}
        <div style={{ background: "#1a1a2e", borderRadius: 14, border: "1px solid #2a2a40", marginBottom: 32, overflow: "hidden" }}>
          <div style={{ padding: "18px 22px", borderBottom: "1px solid #2a2a40", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>👥 All Users</h2>
            <span style={{ fontSize: 12, color: "#888" }}>{users.length} total</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#12122a" }}>
                  {["User", "Email", "Credits Left", "Videos Made", "Paid", "Verified"].map(h => (
                    <th key={h} style={{ padding: "10px 18px", textAlign: "left", color: "#888", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user, i) => (
                  <tr key={user.id} style={{ borderTop: "1px solid #2a2a40", background: i % 2 === 0 ? "transparent" : "#12122080" }}>
                    <td style={{ padding: "12px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {user.image
                          ? <img src={user.image} alt="" width={30} height={30} style={{ borderRadius: "50%", objectFit: "cover" }} />
                          : <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#ec4899", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff" }}>
                              {(user.name || user.email || "?")[0].toUpperCase()}
                            </div>
                        }
                        <span style={{ fontWeight: 500, color: "#e0e0e0" }}>{user.name || "—"}</span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 18px", color: "#aaa" }}>{user.email}</td>
                    <td style={{ padding: "12px 18px" }}>
                      <span style={{ background: (user.credits ?? 0) > 0 ? "#1e3a2a" : "#3a1a1a", color: (user.credits ?? 0) > 0 ? "#34d399" : "#f87171", padding: "3px 10px", borderRadius: 20, fontWeight: 600, fontSize: 12 }}>
                        {(user.credits ?? 0).toLocaleString()}
                      </span>
                    </td>
                    <td style={{ padding: "12px 18px" }}>
                      <span style={{ background: user._count.creations > 0 ? "#1e2a3a" : "#2a2a40", color: user._count.creations > 0 ? "#818cf8" : "#666", padding: "3px 10px", borderRadius: 20, fontWeight: 600, fontSize: 12 }}>
                        {user._count.creations} video{user._count.creations !== 1 ? "s" : ""}
                      </span>
                    </td>
                    <td style={{ padding: "12px 18px" }}>
                      {uniquePayerIds.has(user.id)
                        ? <span style={{ color: "#f59e0b", fontSize: 13 }}>💳 Paid</span>
                        : <span style={{ color: "#444", fontSize: 13 }}>—</span>}
                    </td>
                    <td style={{ padding: "12px 18px" }}>
                      {user.verified
                        ? <span style={{ color: "#fbbf24", fontSize: 16 }}>✅</span>
                        : <span style={{ color: "#444", fontSize: 13 }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Videos */}
        <div style={{ background: "#1a1a2e", borderRadius: 14, border: "1px solid #2a2a40", overflow: "hidden" }}>
          <div style={{ padding: "18px 22px", borderBottom: "1px solid #2a2a40" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>🎬 Recent Videos</h2>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#12122a" }}>
                {["User", "Prompt", "Created"].map(h => (
                  <th key={h} style={{ padding: "10px 18px", textAlign: "left", color: "#888", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentCreations.map((c, i) => (
                <tr key={c.id} style={{ borderTop: "1px solid #2a2a40", background: i % 2 === 0 ? "transparent" : "#12122080" }}>
                  <td style={{ padding: "12px 18px", color: "#e0e0e0", whiteSpace: "nowrap" }}>{c.user?.name || c.user?.email || "Unknown"}</td>
                  <td style={{ padding: "12px 18px", color: "#aaa", maxWidth: 480 }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.prompt || "—"}</span>
                  </td>
                  <td style={{ padding: "12px 18px", color: "#666", fontSize: 12, whiteSpace: "nowrap" }}>
                    {c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ textAlign: "center", color: "#444", fontSize: 11, marginTop: 24 }}>
          Seedance Studio Admin · Only visible to {OWNER_EMAIL}
        </p>
      </div>
    </div>
  );
}

function ErrorPage({ msg }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ background: "#1a1a2e", border: "1px solid #3a1a1a", borderRadius: 14, padding: "32px 40px", maxWidth: 600, width: "100%" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <h2 style={{ color: "#f87171", margin: "0 0 12px", fontSize: 18 }}>Admin page error</h2>
        <p style={{ color: "#aaa", fontSize: 13, fontFamily: "monospace", background: "#12122a", padding: "12px 16px", borderRadius: 8, wordBreak: "break-all" }}>{msg}</p>
        <a href="/" style={{ color: "#ec4899", fontSize: 13, textDecoration: "none" }}>← Back to site</a>
      </div>
    </div>
  );
}
