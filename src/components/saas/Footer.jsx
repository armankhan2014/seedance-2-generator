"use client";
import Link from "next/link";
import { useIsIOSApp } from "@/components/IOSAppContext";

const SOCIAL = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/visualseffect.ai/",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

const NAV = [
  { label: "Generate", href: "/generate" },
  { label: "Gallery",  href: "/creations" },
  { label: "Pricing",  href: "/pricing" },
];

const LEGAL = [
  { label: "Privacy Policy",   href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
];

export default function Footer() {
  const year = new Date().getFullYear();
  // Drop the Pricing link inside the iOS app (Apple Guideline 3.1.1).
  const isIOSApp = useIsIOSApp();
  const nav = isIOSApp ? NAV.filter((n) => n.href !== "/pricing") : NAV;

  return (
    <footer style={{
      borderTop: "1px solid rgba(255,255,255,0.06)",
      background: "#0a0a0a",
      fontFamily: "Inter, sans-serif",
    }}>
      <div style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "48px 24px 32px",
      }}>

        {/* Top row — brand + nav + socials */}
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "32px",
          marginBottom: "40px",
        }}>

          {/* Brand */}
          <div style={{ flex: "1 1 200px" }}>
            <Link href="/" style={{ textDecoration: "none" }}>
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "10px",
              }}>
                <div style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "7px",
                  background: "linear-gradient(135deg, #D9FF00, #A6CC00)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "14px",
                }}>
                  ⚡
                </div>
                <span style={{
                  fontSize: "1rem",
                  fontWeight: 800,
                  color: "#FFFFFF",
                  letterSpacing: "-0.02em",
                }}>
                  {isIOSApp ? "VisualsEffect Studio" : "Seedance Studio"}
                </span>
              </div>
            </Link>
            <p style={{
              margin: 0,
              fontSize: "0.8rem",
              color: "#475569",
              lineHeight: 1.6,
              maxWidth: "220px",
            }}>
              AI video generation powered by {isIOSApp ? "VisualsEffect" : "Seedance 2.0"}. Create stunning videos in seconds.
            </p>
          </div>

          {/* Nav links */}
          <div style={{ flex: "0 0 auto" }}>
            <p style={{
              margin: "0 0 14px",
              fontSize: "0.7rem",
              fontWeight: 700,
              color: "#334155",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}>
              Product
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {nav.map(({ label, href }) => (
                <Link key={href} href={href} style={{
                  fontSize: "0.85rem",
                  color: "#64748b",
                  textDecoration: "none",
                  transition: "color 0.15s",
                }}
                  onMouseEnter={e => { e.currentTarget.style.color = "#D9FF00"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "#64748b"; }}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* Legal links */}
          <div style={{ flex: "0 0 auto" }}>
            <p style={{
              margin: "0 0 14px",
              fontSize: "0.7rem",
              fontWeight: 700,
              color: "#334155",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}>
              Legal
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {LEGAL.map(({ label, href }) => (
                <Link key={href} href={href} style={{
                  fontSize: "0.85rem",
                  color: "#64748b",
                  textDecoration: "none",
                  transition: "color 0.15s",
                }}
                  onMouseEnter={e => { e.currentTarget.style.color = "#D9FF00"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "#64748b"; }}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* Contact + socials */}
          <div style={{ flex: "0 0 auto" }}>
            <p style={{
              margin: "0 0 14px",
              fontSize: "0.7rem",
              fontWeight: 700,
              color: "#334155",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}>
              Connect
            </p>
            <a href="mailto:hello@visualseffect.com" style={{
              display: "block",
              fontSize: "0.85rem",
              color: "#64748b",
              textDecoration: "none",
              marginBottom: "16px",
              transition: "color 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.color = "#D9FF00"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "#64748b"; }}
            >
              hello@visualseffect.com
            </a>
            <div style={{ display: "flex", gap: "10px" }}>
              {SOCIAL.map(({ label, href, icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  style={{
                    width: "34px",
                    height: "34px",
                    borderRadius: "8px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#64748b",
                    textDecoration: "none",
                    transition: "color 0.15s, border-color 0.15s, background 0.15s",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = "#D9FF00";
                    e.currentTarget.style.borderColor = "rgba(217, 255, 0,0.4)";
                    e.currentTarget.style.background = "rgba(217, 255, 0,0.08)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = "#64748b";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                    e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  }}
                >
                  {icon}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom row — copyright */}
        <div style={{
          borderTop: "1px solid rgba(255,255,255,0.05)",
          paddingTop: "20px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
        }}>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#1e293b" }}>
            © {year} {isIOSApp ? "VisualsEffect Studio" : "Seedance Studio"}. All rights reserved.
          </p>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#1e293b" }}>
            Powered by{" "}
            <span style={{ color: "#334155", fontWeight: 600 }}>{isIOSApp ? "VisualsEffect" : "Seedance 2.0"}</span>
          </p>
        </div>

      </div>
    </footer>
  );
}
