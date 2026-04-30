"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import ContactModal from "./ContactModal";
import ToastContainer from "./ToastContainer";

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  const [liveCredits, setLiveCredits] = useState(null);
  const [optimisticCredits, setOptimisticCredits] = useState(null);
  const [liveImage, setLiveImage] = useState(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [creditsRefreshing, setCreditsRefreshing] = useState(false);
  const dropdownRef = useRef(null);

  // Fetch fresh credits AND profile image from DB in one call
  const refreshUserData = async () => {
    if (!session?.user) return null;
    try {
      const res = await fetch("/api/user/profile", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.credits !== undefined) setLiveCredits(data.credits);
        if (data.image) setLiveImage(data.image);
        return data.credits;
      }
    } catch (e) {}
    return null;
  };

  // Refresh on mount when logged in
  useEffect(() => {
    if (session?.user) refreshUserData();
  }, [session?.user?.id]);

  // Instant optimistic display + background confirmation polling
  // When Stripe redirects back with ?success=true&credits=N:
  //   1. Immediately show current + purchased (optimistic) — feels instant
  //   2. Poll DB in background until webhook confirms the real value
  //   3. Once DB matches or exceeds optimistic, swap to real value & stop polling
  useEffect(() => {
    if (searchParams?.get("success") === "true" && session?.user) {
      const purchased = parseInt(searchParams.get("credits") || "0");
      const baseCredits = session?.user?.credits ?? 0;

      // Step 1: show optimistic balance right away
      if (purchased > 0) {
        setOptimisticCredits(baseCredits + purchased);
      }

      // Step 2: poll in background to confirm webhook has fired
      const target = baseCredits + purchased;
      let attempts = 0;
      setCreditsRefreshing(true);
      const poll = setInterval(async () => {
        const fresh = await refreshUserData();
        attempts++;
        // Stop once DB value reaches expected total (webhook confirmed)
        if (fresh !== null && fresh >= target) {
          clearInterval(poll);
          setCreditsRefreshing(false);
          setOptimisticCredits(null); // hand off to liveCredits
          return;
        }
        if (attempts >= 15) {
          clearInterval(poll);
          setCreditsRefreshing(false);
        }
      }, 2000);
      return () => { clearInterval(poll); setCreditsRefreshing(false); };
    }
  }, [searchParams, session?.user?.id]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  // Priority: confirmed DB value → optimistic (post-purchase instant) → stale session
  const displayCredits = liveCredits ?? optimisticCredits ?? session?.user?.credits ?? 0;
  const displayImage = liveImage || session?.user?.image || null;

  const links = [
    { href: "/generate", label: "Generate" },
    { href: "/creations", label: "Gallery" },
    { href: "/pricing", label: "Pricing" },
  ];

  const handleSignIn = () => signIn("google", { callbackUrl: "/" });

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
                {/* Credits badge */}
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
                  opacity: creditsRefreshing ? 0.6 : 1,
                  transition: "opacity 0.4s",
                }}>
                  {creditsRefreshing ? "⏳" : "⚡"} {displayCredits.toLocaleString()} credits
                </span>

                {/* Avatar dropdown trigger */}
                <div ref={dropdownRef} style={{ position: "relative" }}>
                  <button
                    onClick={() => setDropdownOpen(o => !o)}
                    style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      background: dropdownOpen ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      padding: "5px 10px 5px 6px",
                      cursor: "pointer",
                      color: "#94a3b8",
                      fontSize: "0.78rem",
                      fontFamily: "inherit",
                      transition: "background 0.15s",
                    }}>
                    <Avatar size={24} />
                    <span>{firstName}</span>
                    {/* Chevron */}
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginLeft: 2, opacity: 0.5, transform: dropdownOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                      <path d="M2 3.5L5 6.5L8 3.5" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>

                  {/* Dropdown menu */}
                  {dropdownOpen && (
                    <div style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      right: 0,
                      minWidth: "160px",
                      background: "#1a1a1a",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "10px",
                      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                      overflow: "hidden",
                      zIndex: 100,
                    }}>
                      <Link
                        href="/profile"
                        onClick={() => setDropdownOpen(false)}
                        style={{
                          display: "flex", alignItems: "center", gap: "8px",
                          padding: "10px 14px",
                          fontSize: "0.82rem",
                          fontWeight: 500,
                          color: "#cbd5e1",
                          textDecoration: "none",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        {/* Person icon */}
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, opacity: 0.6 }}>
                          <circle cx="7" cy="4.5" r="2.5" stroke="#94a3b8" strokeWidth="1.3"/>
                          <path d="M2 12c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="#94a3b8" strokeWidth="1.3" strokeLinecap="round"/>
                        </svg>
                        View Profile
                      </Link>

                      <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "0 10px" }} />

                      <button
                        onClick={() => { signOut({ callbackUrl: "/" }); setDropdownOpen(false); }}
                        style={{
                          display: "flex", alignItems: "center", gap: "8px",
                          width: "100%",
                          padding: "10px 14px",
                          fontSize: "0.82rem",
                          fontWeight: 500,
                          color: "#f87171",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          textAlign: "left",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(248,113,113,0.08)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        {/* Sign out icon */}
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                          <path d="M5 2H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2" stroke="#f87171" strokeWidth="1.3" strokeLinecap="round"/>
                          <path d="M9 10l3-3-3-3" stroke="#f87171" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M12 7H5.5" stroke="#f87171" strokeWidth="1.3" strokeLinecap="round"/>
                        </svg>
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
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
          @media (max-width: 768px) {
            .desktop-nav { display: none !important; }
            .desktop-auth { display: none !important; }
            .mobile-menu-btn { display: flex !important; align-items: center; justify-content: center; }
          }
        `}</style>
      </header>
      <ToastContainer />
    </>
  );
}
