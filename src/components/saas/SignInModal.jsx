"use client";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";

const SOCIAL = [
  {
    id: "apple",
    label: "Apple",
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
      </svg>
    ),
    color: "#fff",
    bg: "rgba(255,255,255,0.07)",
    border: "rgba(255,255,255,0.12)",
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="#1877F2"/>
      </svg>
    ),
    color: "#1877F2",
    bg: "rgba(24,119,242,0.1)",
    border: "rgba(24,119,242,0.25)",
  },
  {
    id: "github",
    label: "GitHub",
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
      </svg>
    ),
    color: "#fff",
    bg: "rgba(255,255,255,0.07)",
    border: "rgba(255,255,255,0.12)",
  },
  {
    id: "google",
    label: "Google",
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    ),
    color: "#fff",
    bg: "rgba(255,255,255,0.07)",
    border: "rgba(255,255,255,0.12)",
  },
];

export default function SignInModal() {
  const [open, setOpen]     = useState(false);
  const [loading, setLoading] = useState(null);
  const [email, setEmail]   = useState("");
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    const handle = () => setOpen(true);
    window.addEventListener("openSignIn", handle);
    return () => window.removeEventListener("openSignIn", handle);
  }, []);

  useEffect(() => {
    if (!open) return;
    const esc = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [open]);

  const close = () => { setOpen(false); setEmail(""); setEmailSent(false); setLoading(null); };

  const handleSocial = (id) => { setLoading(id); signIn(id, { callbackUrl: "/" }); };

  const handleEmail = (e) => {
    e.preventDefault();
    if (!email) return;
    setLoading("email");
    signIn("email", { email, callbackUrl: "/", redirect: false })
      .then(() => { setEmailSent(true); setLoading(null); })
      .catch(() => { setLoading(null); });
  };

  if (!open) return null;

  return (
    <>
      <style>{`
        @keyframes _sdFade  { from{opacity:0} to{opacity:1} }
        @keyframes _sdCard  { from{opacity:0;transform:translateY(16px) scale(.98)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes _sdSpin  { to{transform:rotate(360deg)} }
        ._sd-social:hover { background:rgba(255,255,255,0.11)!important; border-color:rgba(255,255,255,0.22)!important; transform:translateY(-2px); }
        ._sd-social:active { transform:translateY(0)!important; }
        ._sd-input:focus   { border-color:rgba(124,58,237,0.7)!important; box-shadow:0 0 0 3px rgba(124,58,237,0.15)!important; outline:none; }
        ._sd-continue:hover:not(:disabled) { opacity:.92; transform:translateY(-1px); }
        ._sd-continue:active:not(:disabled){ transform:translateY(0); }
      `}</style>

      {/* Backdrop */}
      <div onClick={close} style={{
        position:"fixed",inset:0,zIndex:9990,
        background:"rgba(5,5,10,0.75)",
        backdropFilter:"blur(14px)",
        WebkitBackdropFilter:"blur(14px)",
        animation:"_sdFade .18s ease",
      }}/>

      {/* Centering wrapper */}
      <div style={{
        position:"fixed",inset:0,zIndex:9991,
        display:"flex",alignItems:"center",justifyContent:"center",
        padding:16,pointerEvents:"none",
      }}>
        <div onClick={e=>e.stopPropagation()} style={{
          width:"100%",maxWidth:420,
          background:"#111118",
          border:"1px solid rgba(255,255,255,0.09)",
          borderRadius:20,
          boxShadow:"0 0 0 1px rgba(124,58,237,0.08), 0 40px 100px rgba(0,0,0,0.8)",
          overflow:"hidden",
          pointerEvents:"all",
          animation:"_sdCard .22s cubic-bezier(.22,1,.36,1)",
        }}>

          {/* Purple top rule */}
          <div style={{height:1.5,background:"linear-gradient(90deg,transparent 0%,#7c3aed 40%,#a78bfa 60%,transparent 100%)"}}/>

          {/* Body */}
          <div style={{padding:"32px 28px 28px",position:"relative"}}>

            {/* Close */}
            <button onClick={close} style={{
              position:"absolute",top:16,right:16,
              width:30,height:30,borderRadius:"50%",
              background:"rgba(255,255,255,0.05)",
              border:"1px solid rgba(255,255,255,0.08)",
              color:"#64748b",cursor:"pointer",fontSize:14,
              display:"flex",alignItems:"center",justifyContent:"center",
              transition:"all .15s",fontFamily:"inherit",lineHeight:1,
            }}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.1)";e.currentTarget.style.color="#e2e8f0";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.05)";e.currentTarget.style.color="#64748b";}}
            >✕</button>

            {/* Logo */}
            <div style={{textAlign:"center",marginBottom:22}}>
              <div style={{
                width:48,height:48,margin:"0 auto 14px",
                background:"linear-gradient(135deg,#7c3aed,#5b21b6)",
                borderRadius:14,fontSize:24,
                display:"flex",alignItems:"center",justifyContent:"center",
                boxShadow:"0 8px 28px rgba(124,58,237,.4)",
              }}>🎬</div>
              <div style={{fontSize:"1rem",fontWeight:700,color:"#f1f5f9",letterSpacing:"-.02em",marginBottom:4}}>
                Seedance Studio
              </div>
              <div style={{fontSize:".8rem",color:"#475569"}}>
                {emailSent ? "Check your inbox" : "Sign in to your account"}
              </div>
            </div>

            {emailSent ? (
              /* ── Email sent state ── */
              <div style={{textAlign:"center",padding:"16px 0 8px"}}>
                <div style={{fontSize:36,marginBottom:12}}>📬</div>
                <p style={{margin:"0 0 8px",fontSize:".9rem",fontWeight:600,color:"#e2e8f0"}}>Magic link sent!</p>
                <p style={{margin:"0 0 20px",fontSize:".8rem",color:"#64748b",lineHeight:1.6}}>
                  We sent a sign-in link to <strong style={{color:"#a78bfa"}}>{email}</strong>.<br/>Check your inbox and click the link.
                </p>
                <button onClick={()=>{setEmailSent(false);setEmail("");}} style={{
                  fontSize:".8rem",color:"#7c3aed",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",textDecoration:"underline",
                }}>Use a different email</button>
              </div>
            ) : (
              <>
                {/* ── Social icons row ── */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:20}}>
                  {SOCIAL.map(p=>(
                    <button
                      key={p.id}
                      className="_sd-social"
                      onClick={()=>handleSocial(p.id)}
                      disabled={!!loading}
                      title={`Continue with ${p.label}`}
                      style={{
                        height:46,borderRadius:10,
                        background:p.bg,
                        border:`1px solid ${p.border}`,
                        color:p.color,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        cursor:loading?"wait":"pointer",
                        transition:"all .15s",
                        opacity:loading && loading!==p.id ? .45 : 1,
                        fontFamily:"inherit",
                      }}
                    >
                      {loading===p.id
                        ? <div style={{width:16,height:16,border:"2px solid rgba(255,255,255,.2)",borderTopColor:"#a78bfa",borderRadius:"50%",animation:"_sdSpin .65s linear infinite"}}/>
                        : p.icon
                      }
                    </button>
                  ))}
                </div>

                {/* ── Or divider ── */}
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                  <div style={{flex:1,height:1,background:"rgba(255,255,255,0.07)"}}/>
                  <span style={{fontSize:".72rem",color:"#334155",fontWeight:500,letterSpacing:".04em"}}>or</span>
                  <div style={{flex:1,height:1,background:"rgba(255,255,255,0.07)"}}/>
                </div>

                {/* ── Email form ── */}
                <form onSubmit={handleEmail}>
                  <label style={{display:"block",fontSize:".75rem",fontWeight:500,color:"#64748b",marginBottom:6}}>
                    Email address
                  </label>
                  <input
                    className="_sd-input"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e=>setEmail(e.target.value)}
                    disabled={!!loading}
                    style={{
                      width:"100%",boxSizing:"border-box",
                      padding:"11px 14px",
                      background:"rgba(255,255,255,0.04)",
                      border:"1px solid rgba(255,255,255,0.1)",
                      borderRadius:10,
                      color:"#f1f5f9",fontSize:".875rem",
                      fontFamily:"inherit",marginBottom:12,
                      transition:"border-color .15s,box-shadow .15s",
                    }}
                  />
                  <button
                    type="submit"
                    className="_sd-continue"
                    disabled={!email||!!loading}
                    style={{
                      width:"100%",padding:"12px",
                      background:email ? "linear-gradient(135deg,#7c3aed,#6d28d9)" : "rgba(255,255,255,0.06)",
                      border:"none",borderRadius:10,
                      color:email?"#fff":"#334155",
                      fontSize:".875rem",fontWeight:600,
                      fontFamily:"inherit",cursor:email&&!loading?"pointer":"default",
                      transition:"all .15s",display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                      boxShadow:email?"0 4px 20px rgba(124,58,237,.35)":"none",
                    }}
                  >
                    {loading==="email"
                      ? <><div style={{width:15,height:15,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"_sdSpin .65s linear infinite"}}/> Sending…</>
                      : <> Continue <span style={{fontSize:12,opacity:.7}}>→</span></>
                    }
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding:"14px 28px 18px",
            borderTop:"1px solid rgba(255,255,255,0.05)",
            textAlign:"center",
          }}>
            <p style={{margin:0,fontSize:".7rem",color:"#334155",lineHeight:1.7}}>
              By continuing you agree to our{" "}
              <a href="/terms" style={{color:"#7c3aed",textDecoration:"none",fontWeight:500}}>Terms</a>
              {" & "}
              <a href="/privacy" style={{color:"#7c3aed",textDecoration:"none",fontWeight:500}}>Privacy Policy</a>
              <br/>
              <span style={{color:"#1e293b"}}>🔒 Secured · End-to-end encrypted</span>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
