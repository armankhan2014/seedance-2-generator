"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import ContactModal from "./ContactModal";

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [liveCredits, setLiveCredits] = useState(null);
  const [liveImage, setLiveImage] = useState(null);
  const [contactOpen, setContactOpen] = useState(false);

  // Fetch fresh credits AND profile image from DB in one call
  const refreshUserData = async () => {
    if (!session?.user) return;
    try {
      const res = await fetch("/api/user/profile", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.credits !== undefined) setLiveCredits(data.credits);
        // Only use the DB image if it's a custom base64 upload
        // Fall back to Google OAuth URL for users who haven't uploaded yet
        if (data.image) setLiveImage(data.image);
      }
    } catch (e) {}
  };

  // Refresh on mount when logged in
  useEffect(() => {
    if (session?.user) refreshUserData();
  }, [session?.user?.id]);

  // Refresh when returning from Stripe (success=true in URL)
  useEffect(() => {
    if (searchParams?.get("success") === "true" && session?.user) {
      let attempts = 0;
      const poll = setInterval(async () => {
        await refreshUserData();
        attempts++;
        if (attempts >= 5) clearInterval(poll);
      }, 2000);
      return () => clearInterval(poll);
    }
  }, [searchParams, session?.user?.id]);

  const displayCredits = liveCredits ?? session?.user?.credits ?? 0;
  // Prefer DB image (custom upload) over session image (Google OAuth URL)
  const displayImage = liveImage || session?.user?.image || null;

  const links = [
    { href: "/", label: "Generate" },
    { href: "/creations", label: "Gallery" },
    { href: "/pricing", label: "Pricing" },
  ];

  const handleSignIn = () => signIn("google", { callbackUrl: "/" });

  // Avatar: shows image if available, otherwise initials circle
  const firstName = session?.user?.name?.split(" ")[0] || "";
  const initials = session?.user?.name
    ? session.user.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  const Avatar = ({ size = 24 }) => (
    displayImage ? (
      <img
        src={displayImage}
        alt={firstName}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    ) : (
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: "linear-gradient(135deg,#8b5cf6,#7c3aed)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.42 + "px", fontWeight: 700, color: "#fff", flexShrink: 0,
      }}>
        {initials}
      </div>
    )
  );

  return (
    <>
      {contactOpen && <ContactModal onClose={() => setContactOpen(false)} />}

      <header style={{
        background: "#0a0a0a",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        position: "sticky",
        top: 0,
        zIndex: 50,
        fontFamily: "Inter,sans-serif",
      }}>
        <div style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0 16px",
          height: "56px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
        }}>
          {/* Logo */}
          <Link href="/" style={{ textDecoration: "none", fontSize: "1rem", fontWeight: 800, color: "#fff", flexShrink: 0 }}>
            Seedance<span style={{ background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Studio</span>
          </Link>

          {/* Desktop nav */}
          <nav style={{ display: "flex", gap: "2px", flex: 1, justifyContent: "center" }} className="desktop-nav">
            {links.map(l => (
              <Link key={l.href} href={l.href} style={{
                padding: "6px 12px",
                borderRadius: "8px",
                fontSize: "0.82rem",
                fontWeight: 600,
                textDecoration: "none",
                color: pathname === l.href ? "#fff" : "#64748b",
                background: pathname === l.href ? "rgba(139,92,246,0.15)" : "transparent",
                whiteSpace: "nowrap",
              }}>{l.label}</Link>
            ))}
          </nav>

          {/* Desktop auth */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }} className="desktop-auth">
            <button
              onClick={() => setContactOpen(true)}
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#94a3b8", padding: "6px 12px", fontSize: "0.78rem", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
              Contact Us
            </button>

            {session ? (
              <>
                <Link href="/profile" style={{ fontSize: "0.78rem", color: "#94a3b8", textDecoration: "none", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Avatar size={24} />
                  {firstName}
                </Link>
                <span style={{
                  background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(124,58,237,0.2))",
                  border: "1px solid rgba(139,92,246,0.4)",
                  borderRadius: "20px",
                  color: "#a78bfa",
                  padding: "4px 10px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                }}>
                  ⚡ {displayCredits.toLocaleString()} credits
                </span>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#94a3b8", padding: "6px 12px", fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit" }}>
                  Sign out
                </button>
              </>
            ) : (
              <button
                onClick={handleSignIn}
                style={{ background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", border: "none", borderRadius: "8px", color: "#fff", padding: "8px 16px", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                Sign in
              </button>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="mobile-menu-btn"
            onClick={() => setMenuOpen(o => !o)}
            style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", color: "#94a3b8", padding: "6px 10px", cursor: "pointer", fontSize: "1rem", lineHeight: 1 }}>
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div style={{
            background: "#111",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            padding: "12px 16px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }} className="mobile-menu">
            {links.map(l => (
              <Link key={l.href} href={l.href}
                onClick={() => setMenuOpen(false)}
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  textDecoration: "none",
                  color: pathname === l.href ? "#fff" : "#94a3b8",
                  background: pathname === l.href ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.03)",
                }}>{l.label}</Link>
            ))}
            <button
              onClick={() => { setMenuOpen(false); setContactOpen(true); }}
              style={{ padding: "10px 14px", borderRadius: "8px", fontSize: "0.9rem", fontWeight: 600, textAlign: "left", cursor: "pointer", color: "#94a3b8", background: "rgba(255,255,255,0.03)", border: "none", fontFamily: "inherit" }}>
              Contact Us
            </button>
            <div style={{ marginTop: "4px" }}>
              {session ? (
                <div style={{ padding: "8px 14px", borderRadius: "8px", background: "rgba(255,255,255,0.03)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <Link href="/profile" onClick={() => setMenuOpen(false)} style={{ fontSize: "0.85rem", color: "#94a3b8", textDecoration: "none", display: "flex", alignItems: "center", gap: "8px" }}>
                      <Avatar size={28} />
                      {session.user?.name}
                    </Link>
                    <button
                      onClick={() => { signOut({ callbackUrl: "/" }); setMenuOpen(false); }}
                      style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "6px", color: "#94a3b8", padding: "6px 12px", fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit" }}>
                      Sign out
                    </button>
                  </div>
                  <div style={{
                    display: "inline-flex",
                    alignItems: "center",
                    background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(124,58,237,0.2))",
                    border: "1px solid rgba(139,92,246,0.4)",
                    borderRadius: "20px",
                    color: "#a78bfa",
                    padding: "4px 12px",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                  }}>
                    ⚡ {displayCredits.toLocaleString()} credits remaining
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { handleSignIn(); setMenuOpen(false); }}
                  style={{ width: "100%", background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", border: "none", borderRadius: "8px", color: "#fff", padding: "12px", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  Sign in with Google
                </button>
              )}
            </div>
          </div>
        )}

        <style>{`
          .desktop-nav { display: flex !important; }
          .desktop-auth { display: flex !important; }
          .mobile-menu-btn { display: none !important; }
          .mobile-menu { display: flex !important; }
          @media (max-width: 600px) {
            .desktop-nav { display: none !important; }
            .desktop-auth { display: none !important; }
            .mobile-menu-btn { display: block !important; }
          }
        `}</style>
      </header>
    </>
  );
}
