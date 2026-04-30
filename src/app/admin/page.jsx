import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import AddCreditsWidget from "./AddCreditsWidget";

const OWNER_EMAIL = "armankhan0826@gmail.com";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.email !== OWNER_EMAIL) {
    redirect("/");
  }

  const users = await prisma.user.findMany({
    include: { _count: { select: { creations: true } } },
    orderBy: { id: "desc" },
  });

  const totalCreations = users.reduce((s, u) => s + u._count.creations, 0);
  const totalCreditsLeft = users.reduce((s, u) => s + (u.credits ?? 0), 0);
  const totalCreditsUsed = users.reduce((s, u) => s + u._count.creations, 0);

  const recentCreations = await prisma.creation.findMany({
    take: 8,
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, email: true } } },
  });

  // Slim user list for the widget dropdown
  const userList = users.map(u => ({ email: u.email, name: u.name, credits: u.credits ?? 0 }));

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", color: "#f0f0f0", fontFamily: "system-ui, sans-serif", padding: "32px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "#fff" }}>
              <span style={{ color: "#ec4899" }}>⚡</span> Admin Dashboard
            </h1>
            <p style={{ color: "#888", margin: "4px 0 0", fontSize: 13 }}>Seedance Studio · {new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
          </div>
          <a href="/" style={{ color: "#ec4899", fontSize: 13, textDecoration: "none" }}>← Back to site</a>
        </div>

        {/* Stat Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 36 }}>
          {[
            { label: "Total Users", value: users.length, icon: "👥", color: "#818cf8" },
            { label: "Total Videos", value: totalCreations, icon: "🎬", color: "#ec4899" },
            { label: "Credits Remaining", value: totalCreditsLeft, icon: "💎", color: "#34d399" },
            { label: "Verified Users", value: users.filter(u => u.verified).length, icon: "✅", color: "#fbbf24" },
          ].map(card => (
            <div key={card.label} style={{ background: "#1a1a2e", borderRadius: 12, padding: "20px 22px", border: "1px solid #2a2a40" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{card.icon}</div>
              <div style={{ fontSize: 30, fontWeight: 700, color: card.color }}>{card.value}</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{card.label}</div>
            </div>
          ))}
        </div>

        {/* ── Add Credits Widget ── */}
        <AddCreditsWidget users={userList} />

        {/* Users Table */}
        <div style={{ background: "#1a1a2e", borderRadius: 14, border: "1px solid #2a2a40", marginBottom: 32, overflow: "hidden" }}>
          <div style={{ padding: "18px 22px", borderBottom: "1px solid #2a2a40", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>All Users</h2>
            <span style={{ fontSize: 12, color: "#888" }}>{users.length} total</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#12122a" }}>
                  {["User", "Email", "Credits Left", "Videos Made", "Verified"].map(h => (
                    <th key={h} style={{ padding: "10px 18px", textAlign: "left", color: "#888", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user, i) => (
                  <tr key={user.id} style={{ borderTop: "1px solid #2a2a40", background: i % 2 === 0 ? "transparent" : "#12122080" }}>
                    <td style={{ padding: "12px 18px", display: "flex", alignItems: "center", gap: 10 }}>
                      {user.image
                        ? <img src={user.image} alt="" width={30} height={30} style={{ borderRadius: "50%", objectFit: "cover" }} />
                        : <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#ec4899", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff" }}>{(user.name || user.email || "?")[0].toUpperCase()}</div>
                      }
                      <span style={{ fontWeight: 500, color: "#e0e0e0" }}>{user.name || "—"}</span>
                    </td>
                    <td style={{ padding: "12px 18px", color: "#aaa" }}>{user.email}</td>
                    <td style={{ padding: "12px 18px" }}>
                      <span style={{ background: (user.credits ?? 0) > 0 ? "#1e3a2a" : "#3a1a1a", color: (user.credits ?? 0) > 0 ? "#34d399" : "#f87171", padding: "3px 10px", borderRadius: 20, fontWeight: 600, fontSize: 12 }}>
                        {user.credits ?? 0}
                      </span>
                    </td>
                    <td style={{ padding: "12px 18px" }}>
                      <span style={{ background: user._count.creations > 0 ? "#1e2a3a" : "#2a2a40", color: user._count.creations > 0 ? "#818cf8" : "#666", padding: "3px 10px", borderRadius: 20, fontWeight: 600, fontSize: 12 }}>
                        {user._count.creations} video{user._count.creations !== 1 ? "s" : ""}
                      </span>
                    </td>
                    <td style={{ padding: "12px 18px" }}>
                      {user.verified
                        ? <span style={{ color: "#fbbf24", fontSize: 16 }}>✅</span>
                        : <span style={{ color: "#444", fontSize: 13 }}>—</span>
                      }
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
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Recent Videos</h2>
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
