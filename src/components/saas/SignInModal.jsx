"use client";
/**
 * SignInModal — professional multi-provider sign-in modal
 * Trigger: window.dispatchEvent(new CustomEvent("openSignIn"))
 */
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";

const PROVIDERS = [
  {
    id: "google",
    label: "Google",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    ),
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="#1877F2"/>
      </svg>
    ),
  },
  {
    id: "apple",
    label: "Apple",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
      </svg>
    ),
  },
  {
    id: "github",
    label: "GitHub",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
      </svg>
    ),
  },
];

export default function SignInModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(null);

  useEffect(() => {
    const handle = () => setOpen(true);
    window.addEventListener("openSignIn", handle);
    return () => window.removeEventListener("openSignIn", handle);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const handleSignIn = (id) => {
    setLoading(id);
    signIn(id, { callbackUrl: "/" });
  };

  return (
    <>
      <style>{`
        @keyframes sdOverlay { from { opacity:0 } to { opacity:1 } }
        @keyframes sdCard { from { opacity:0; transform:scale(0.97) translateY(10px) } to { opacity:1; transform:scale(1) translateY(0) } }
        @keyframes sdSpin { to { transform:rotate(360deg) } }
        .sd-provider-btn {
          display:flex; align-items:center; gap:12px;
          width:100%; padding:12px 16px;
          background:rgba(255,255,255,0.04);
          border:1px solid rgba(255,255,255,0.09);
          border-radius:10px;
          color:#e2e8f0; font-size:0.875rem; font-weight:500;
          font-family:inherit; cursor:pointer; text-align:left;
          transition:background 0.15s, border-color 0.15s, transform 0.1s;
          position:relative; overflow:hidden;
        }
        .sd-provider-btn:hover:not(:disabled) {
          background:rgba(255,255,255,0.08);
          border-color:rgba(255,255,255,0.18);
          transform:translateY(-1px);
        }
        .sd-provider-btn:active:not(:disabled) { transform:translateY(0); }
        .sd-provider-btn:disabled { opacity:0.5; cursor:wait; }
        .sd-icon-wrap {
          width:32px; height:32px; border-radius:8px;
          background:rgba(255,255,255,0.06);
          display:flex; align-items:center; justify-content:center;
          flex-shrink:0;
        }
        .sd-spinner {
          width:16px; height:16px;
          border:2px solid rgba(255,255,255,0.2);
          border-top-color:#a78bfa;
          border-radius:50%;
          animation:sdSpin 0.7s linear infinite;
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        style={{
          position:"fixed", inset:0, zIndex:9998,
          background:"rgba(0,0,0,0.65)",
          backdropFilter:"blur(12px)",
          animation:"sdOverlay 0.2s ease",
        }}
      />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-title"
        style={{
          position:"fixed", inset:0, zIndex:9999,
          display:"flex", alignItems:"center", justifyContent:"center",
          padding:"16px", pointerEvents:"none",
        }}
      >
        <div style={{
          width:"100%", maxWidth:"380px",
          background:"linear-gradient(145deg,#161622,#0f0f1a)",
          border:"1px solid rgba(255,255,255,0.08)",
          borderRadius:"20px",
          boxShadow:"0 0 0 1px rgba(124,58,237,0.1), 0 32px 80px rgba(0,0,0,0.7), 0 0 80px rgba(124,58,237,0.06)",
          overflow:"hidden",
          animation:"sdCard 0.22s cubic-bezier(0.34,1.56,0.64,1)",
          pointerEvents:"all",
        }}>

          {/* Top accent line */}
          <div style={{ height:2, background:"linear-gradient(90deg,transparent,#7c3aed,#a78bfa,#7c3aed,transparent)" }} />

          {/* Header */}
          <div style={{ padding:"32px 32px 24px", textAlign:"center" }}>
            {/* Close */}
            <button
              onClick={() => setOpen(false)}
              style={{
                position:"absolute", top:20, right:20,
                width:28, height:28, borderRadius:"50%",
                background:"rgba(255,255,255,0.06)",
                border:"1px solid rgba(255,255,255,0.1)",
                color:"#64748b", cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:13, fontFamily:"inherit", lineHeight:1,
                transition:"all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background="rgba(255,255,255,0.1)"; e.currentTarget.style.color="#e2e8f0"; }}
              onMouseLeave={e => { e.currentTarget.style.background="rgba(255,255,255,0.06)"; e.currentTarget.style.color="#64748b"; }}
            >✕</button>

            {/* App icon */}
            <div style={{
              width:52, height:52, margin:"0 auto 16px",
              background:"linear-gradient(135deg,#7c3aed,#5b21b6)",
              borderRadius:"16px",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:26,
              boxShadow:"0 8px 32px rgba(124,58,237,0.35)",
            }}>🎬</div>

            <h2 id="signin-title" style={{
              margin:"0 0 6px", fontSize:"1.125rem", fontWeight:700,
              color:"#f8fafc", letterSpacing:"-0.02em",
            }}>
              Sign in to Seedance
            </h2>
            <p style={{ margin:0, fontSize:"0.8rem", color:"#64748b", lineHeight:1.5 }}>
              Generate AI videos in seconds
            </p>
          </div>

          {/* Providers */}
          <div style={{ padding:"0 24px 8px", display:"flex", flexDirection:"column", gap:8 }}>
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                className="sd-provider-btn"
                onClick={() => handleSignIn(p.id)}
                disabled={!!loading}
              >
                <span className="sd-icon-wrap">
                  {loading === p.id
                    ? <span className="sd-spinner" />
                    : p.icon
                  }
                </span>
                <span style={{ flex:1 }}>Continue with {p.label}</span>
                {loading !== p.id && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ opacity:0.3 }}>
                    <path d="M5 3l4 4-4 4" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div style={{ padding:"20px 24px 0", display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ flex:1, height:1, background:"rgba(255,255,255,0.06)" }} />
            <span style={{ fontSize:"0.72rem", color:"#334155", fontWeight:500, whiteSpace:"nowrap" }}>
              10 free credits on sign up
            </span>
            <div style={{ flex:1, height:1, background:"rgba(255,255,255,0.06)" }} />
          </div>

          {/* Footer */}
          <div style={{ padding:"16px 24px 24px", textAlign:"center" }}>
            <p style={{ margin:0, fontSize:"0.72rem", color:"#334155", lineHeight:1.7 }}>
              By continuing you agree to our{" "}
              <a href="/terms" style={{ color:"#7c3aed", textDecoration:"none", fontWeight:500 }}>Terms</a>
              {" & "}
              <a href="/privacy" style={{ color:"#7c3aed", textDecoration:"none", fontWeight:500 }}>Privacy Policy</a>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
