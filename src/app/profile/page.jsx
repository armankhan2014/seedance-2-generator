"use client";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/user/profile")
        .then(r => r.json())
        .then(data => { setProfile(data); setLoading(false); })
        .catch(() => setLoading(false));
    } else if (status === "unauthenticated") {
      setLoading(false);
    }
  }, [status]);

  if (status === "loading" || loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#64748b", fontFamily: "Inter,sans-serif", fontSize: "0.9rem" }}>Loading…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter,sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "#64748b", marginBottom: "16px" }}>You need to be signed in to view your profile.</p>
          <Link href="/" style={{ color: "#a78bfa", textDecoration: "none", fontWeight: 600 }}>← Back to home</Link>
        </div>
      </div>
    );
  }

  const joinDate = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  const credits = profile?.credits ?? session.user?.credits ?? 0;
  const name = profile?.name || session.user?.name || "User";
  const email = profile?.email || session.user?.email || "";
  const image = profile?.image || session.user?.image;
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", fontFamily: "Inter,sans-serif", padding: "40px 16px" }}>
      <div style={{ maxWidth: "560px", margin: "0 auto" }}>

        {/* Back link */}
        <Link href="/" style={{ color: "#64748b", textDecoration: "none", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "32px" }}>
          ← Back to Generate
        </Link>

        {/* Profile card */}
        <div style={{
          background: "#111118",
          border: "1px solid rgba(139,92,246,0.2)",
          borderRadius: "20px",
          padding: "36px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        }}>
          {/* Avatar + name */}
          <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "32px" }}>
            {image ? (
              <img
                src={image}
                alt={name}
                style={{ width: "72px", height: "72px", borderRadius: "50%", border: "2px solid rgba(139,92,246,0.4)", objectFit: "cover" }}
              />
            ) : (
              <div style={{
                width: "72px", height: "72px", borderRadius: "50%",
                background: "linear-gradient(135deg,#8b5cf6,#7c3aed)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1.4rem", fontWeight: 700, color: "#fff",
                flexShrink: 0,
              }}>
                {initials}
              </div>
            )}
            <div>
              <h1 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700, color: "#fff" }}>{name}</h1>
              <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#64748b" }}>{email}</p>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "28px" }}>
            <div style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: "12px", padding: "16px" }}>
              <p style={{ margin: 0, fontSize: "0.7rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>Credits</p>
              <p style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "#a78bfa" }}>⚡ {credits.toLocaleString()}</p>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "16px" }}>
              <p style={{ margin: 0, fontSize: "0.7rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>Member since</p>
              <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600, color: "#e2e8f0" }}>{joinDate}</p>
            </div>
          </div>

          {/* Info rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "28px" }}>
            {[
              { label: "Full Name", value: name },
              { label: "Email", value: email },
              { label: "Account Type", value: "Google" },
            ].map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>{row.label}</span>
                <span style={{ fontSize: "0.85rem", color: "#e2e8f0" }}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "10px" }}>
            <Link href="/pricing" style={{
              flex: 1,
              background: "linear-gradient(135deg,#8b5cf6,#7c3aed)",
              border: "none",
              borderRadius: "10px",
              color: "#fff",
              padding: "12px",
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: "pointer",
              textDecoration: "none",
              textAlign: "center",
              display: "block",
            }}>
              ⚡ Buy Credits
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "10px",
                color: "#94a3b8",
                padding: "12px",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}>
              Sign Out
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
