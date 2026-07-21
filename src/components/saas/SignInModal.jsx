"use client";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useIsIOSApp } from "@/components/IOSAppContext";

const SOCIAL = [
  {
    id: "apple", label: "Apple",
    icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>,
    bg: "rgba(255,255,255,0.07)", border: "rgba(255,255,255,0.12)", color: "#fff",
  },
  {
    id: "facebook", label: "Facebook",
    icon: <svg width="19" height="19" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="#1877F2"/></svg>,
    bg: "rgba(24,119,242,0.1)", border: "rgba(24,119,242,0.25)", color: "#1877F2",
  },
  {
    id: "github", label: "GitHub",
    icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>,
    bg: "rgba(255,255,255,0.07)", border: "rgba(255,255,255,0.12)", color: "#fff",
  },
  {
    id: "google", label: "Google",
    icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>,
    bg: "rgba(255,255,255,0.07)", border: "rgba(255,255,255,0.12)", color: "#fff",
  },
];

export default function SignInModal() {
  // Inside the iOS App Store build we ONLY offer the email magic-link.
  // Social OAuth (Google/Facebook/Apple/GitHub) redirects out to the system
  // browser, which (a) breaks the session hand-back into the app's WebView
  // and (b) was rejected under App Store Guideline 4 (external browser sign-in)
  // and 2.1(a) (unresponsive Facebook/Apple buttons). The magic-link returns
  // into the app via Universal Links, so it's the only in-app-safe method.
  const isIOSApp = useIsIOSApp();
  const [open, setOpen]       = useState(false);
  const [mode, setMode]       = useState("signin"); // "signin" | "signup"
  const [loading, setLoading] = useState(null);
  const [email, setEmail]     = useState("");
  const [name, setName]       = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [code, setCode]       = useState("");

  // Ecosystem SSO (2026-07-20): sibling apps (visualseffect.com Studio)
  // send users here to sign in on the shared account. They arrive with
  // ?signin=1&callbackUrl=<their page>; we auto-open the modal and send
  // the user back after auth. Only *.visualseffect.com destinations are
  // honoured (open-redirect guard) — anything else falls back to "/".
  const [cbUrl, setCbUrl] = useState("/");

  useEffect(() => {
    const handle = (e) => { setMode(e?.detail?.mode || "signin"); setOpen(true); };
    window.addEventListener("openSignIn", handle);

    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("callbackUrl");
      if (raw) {
        const u = new URL(raw, window.location.origin);
        const okHost = u.hostname === "visualseffect.com" || u.hostname.endsWith(".visualseffect.com");
        if (u.protocol === "https:" && okHost) setCbUrl(u.toString());
      }
      if (params.get("signin") === "1" || raw) {
        setMode("signin");
        setOpen(true);
      }
    } catch { /* malformed URL — ignore */ }

    return () => window.removeEventListener("openSignIn", handle);
  }, []);

  useEffect(() => {
    if (!open) return;
    const esc = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [open]);

  const close = () => { setOpen(false); setEmail(""); setName(""); setEmailSent(false); setCode(""); setLoading(null); };
  const toggleMode = () => { setMode(m => m === "signin" ? "signup" : "signin"); setEmail(""); setName(""); setEmailSent(false); setCode(""); };

  const handleSocial = (id) => { setLoading(id); signIn(id, { callbackUrl: cbUrl }); };

  const handleEmail = (e) => {
    e.preventDefault();
    if (!email) return;
    setLoading("email");
    signIn("email", { email, callbackUrl: cbUrl, redirect: false })
      .then(() => { setEmailSent(true); setLoading(null); })
      .catch(() => setLoading(null));
  };

  // Verify the typed sign-in code. Navigates to NextAuth's email callback in
  // THIS WebView so the session cookie is set right here in the app — no
  // reliance on the magic link opening the app via Universal Links.
  const handleVerifyCode = (e) => {
    e.preventDefault();
    const clean = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (clean.length < 8) return;
    setLoading("code");
    window.location.href =
      "/api/auth/callback/email?token=" + encodeURIComponent(clean) +
      "&email=" + encodeURIComponent(email) +
      "&callbackUrl=" + encodeURIComponent(cbUrl);
  };

  if (!open) return null;

  const isSignUp = mode === "signup";

  return (
    <>
      <style>{`
        @keyframes _sdFade { from{opacity:0}to{opacity:1} }
        @keyframes _sdCard { from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes _sdSpin { to{transform:rotate(360deg)} }
        ._sd-social:hover:not(:disabled){background:rgba(255,255,255,0.12)!important;border-color:rgba(255,255,255,0.22)!important;transform:translateY(-2px);}
        ._sd-social:active:not(:disabled){transform:translateY(0)!important;}
        ._sd-input:focus{border-color:rgba(166, 204, 0,.7)!important;box-shadow:0 0 0 3px rgba(166, 204, 0,.15)!important;outline:none;}
        ._sd-input::placeholder{color:#334155;}
        ._sd-btn:hover:not(:disabled){opacity:.9;transform:translateY(-1px);}
        ._sd-btn:active:not(:disabled){transform:translateY(0);}
        ._sd-toggle:hover{color:#D9FF00!important;}
      `}</style>

      {/* Backdrop */}
      <div onClick={close} style={{position:"fixed",inset:0,zIndex:9990,background:"rgba(5,5,12,.78)",backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",animation:"_sdFade .18s ease"}}/>

      {/* Card wrapper */}
      <div style={{position:"fixed",inset:0,zIndex:9991,display:"flex",alignItems:"center",justifyContent:"center",padding:16,pointerEvents:"none"}}>
        <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:420,background:"#111118",border:"1px solid rgba(255,255,255,0.08)",borderRadius:20,boxShadow:"0 0 0 1px rgba(166, 204, 0,0.1),0 40px 100px rgba(0,0,0,.8)",overflow:"hidden",pointerEvents:"all",animation:"_sdCard .22s cubic-bezier(.22,1,.36,1)"}}>

          {/* Top accent */}
          <div style={{height:1.5,background:"linear-gradient(90deg,transparent,#A6CC00,#D9FF00,#A6CC00,transparent)"}}/>

          {/* Tab switcher */}
          <div style={{display:"flex",margin:"20px 24px 0",background:"rgba(255,255,255,0.04)",borderRadius:10,padding:3,border:"1px solid rgba(255,255,255,0.07)"}}>
            {["signin","signup"].map(m=>(
              <button key={m} onClick={()=>{setMode(m);setEmail("");setName("");setEmailSent(false);}} style={{
                flex:1,padding:"8px 0",borderRadius:8,fontSize:".8rem",fontWeight:600,
                fontFamily:"inherit",cursor:"pointer",border:"none",transition:"all .2s",
                background: mode===m ? "rgba(166, 204, 0,0.25)" : "transparent",
                color: mode===m ? "#D9FF00" : "#475569",
                boxShadow: mode===m ? "0 1px 6px rgba(166, 204, 0,.2)" : "none",
              }}>
                {m==="signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {/* Body */}
          <div style={{padding:"24px 24px 20px",position:"relative"}}>

            {/* Close */}
            <button onClick={close} style={{position:"absolute",top:8,right:8,width:32,height:32,borderRadius:"50%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",color:"#94a3b8",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s",fontFamily:"inherit",lineHeight:1,zIndex:2}}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,.1)";e.currentTarget.style.color="#FFFFFF";}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.05)";e.currentTarget.style.color="#475569";}}>✕</button>

            {/* Logo + heading */}
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{width:44,height:44,margin:"0 auto 12px",background:"linear-gradient(135deg,#A6CC00,#5b21b6)",borderRadius:13,fontSize:22,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 6px 24px rgba(166, 204, 0,.38)"}}>🎬</div>
              <div style={{fontSize:"1rem",fontWeight:700,color:"#FFFFFF",letterSpacing:"-.02em",marginBottom:4}}>
                {isSignUp ? "Create your account" : "Welcome back"}
              </div>
              <div style={{fontSize:".78rem",color:"#475569"}}>
                {emailSent
                  ? "Check your inbox for a sign-in link"
                  : isSignUp
                  ? "100 free credits included — no card needed"
                  : (isIOSApp ? "Sign in to continue to VisualsEffect" : "Sign in to continue to Seedance")}
              </div>
            </div>

            {emailSent ? (
              <div style={{textAlign:"center",padding:"4px 0 8px"}}>
                <div style={{fontSize:38,marginBottom:10}}>📬</div>
                <p style={{margin:"0 0 6px",fontSize:".9rem",fontWeight:600,color:"#FFFFFF"}}>Check your email</p>
                <p style={{margin:"0 0 16px",fontSize:".78rem",color:"#64748b",lineHeight:1.7}}>
                  We sent a sign-in code to<br/><strong style={{color:"#D9FF00"}}>{email}</strong>.<br/>Enter it below to sign in.
                </p>
                <form onSubmit={handleVerifyCode} style={{display:"flex",flexDirection:"column",gap:10}}>
                  <input className="_sd-input" type="text" inputMode="text" autoComplete="one-time-code"
                    placeholder="Enter code" autoFocus maxLength={12}
                    value={code} onChange={e=>setCode(e.target.value.toUpperCase())} disabled={loading==="code"}
                    style={{width:"100%",boxSizing:"border-box",padding:"12px 13px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:9,color:"#FFFFFF",fontSize:"1.15rem",fontWeight:700,letterSpacing:"6px",textAlign:"center",fontFamily:"inherit",textTransform:"uppercase",transition:"border-color .15s,box-shadow .15s"}}
                  />
                  <button type="submit" className="_sd-btn" disabled={code.replace(/[^A-Za-z0-9]/g,"").length<8||loading==="code"}
                    style={{width:"100%",padding:"11px",background:code.replace(/[^A-Za-z0-9]/g,"").length>=8?"linear-gradient(135deg,#A6CC00,#A6CC00)":"rgba(255,255,255,0.05)",border:"none",borderRadius:9,color:code.replace(/[^A-Za-z0-9]/g,"").length>=8?"#fff":"#334155",fontSize:".875rem",fontWeight:600,fontFamily:"inherit",cursor:code.replace(/[^A-Za-z0-9]/g,"").length>=8&&loading!=="code"?"pointer":"default",transition:"all .15s",display:"flex",alignItems:"center",justifyContent:"center",gap:7,boxShadow:code.replace(/[^A-Za-z0-9]/g,"").length>=8?"0 4px 18px rgba(166, 204, 0,.35)":"none"}}>
                    {loading==="code"
                      ? <><div style={{width:14,height:14,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"_sdSpin .65s linear infinite"}}/> Signing in…</>
                      : <>Verify &amp; sign in <span style={{opacity:.6,fontSize:11}}>→</span></>}
                  </button>
                </form>
                <p style={{margin:"14px 0 0",fontSize:".72rem",color:"#475569",lineHeight:1.6}}>
                  On this device you can also tap the link in the email to sign in.
                </p>
                <button onClick={()=>{setEmailSent(false);setEmail("");setCode("");}} style={{marginTop:12,fontSize:".78rem",color:"#A6CC00",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>
                  Use a different email
                </button>
              </div>
            ) : (
              <>
                {/* Social sign-in — web/Android only. Hidden in the iOS app
                    (Apple Guideline 4 + 2.1(a)); iOS uses magic-link only. */}
                {!isIOSApp && (
                  <>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:18}}>
                      {SOCIAL.map(p=>(
                        <button key={p.id} className="_sd-social" onClick={()=>handleSocial(p.id)} disabled={!!loading} title={`Continue with ${p.label}`}
                          style={{height:44,borderRadius:10,background:p.bg,border:`1px solid ${p.border}`,color:p.color,display:"flex",alignItems:"center",justifyContent:"center",cursor:loading?"wait":"pointer",transition:"all .15s",opacity:loading&&loading!==p.id?.45:1,fontFamily:"inherit"}}>
                          {loading===p.id
                            ? <div style={{width:15,height:15,border:"2px solid rgba(255,255,255,.2)",borderTopColor:"#D9FF00",borderRadius:"50%",animation:"_sdSpin .65s linear infinite"}}/>
                            : p.icon}
                        </button>
                      ))}
                    </div>

                    {/* Or divider */}
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                      <div style={{flex:1,height:1,background:"rgba(255,255,255,0.06)"}}/>
                      <span style={{fontSize:".7rem",color:"#2d3748",fontWeight:500,letterSpacing:".06em"}}>or continue with email</span>
                      <div style={{flex:1,height:1,background:"rgba(255,255,255,0.06)"}}/>
                    </div>
                  </>
                )}

                {/* iOS-only hint so the magic-link flow is self-explanatory. */}
                {isIOSApp && (
                  <p style={{margin:"0 0 14px",fontSize:".76rem",color:"#64748b",lineHeight:1.6,textAlign:"center"}}>
                    {"Enter your email and we'll send you a secure sign-in link — no password needed."}
                  </p>
                )}

                {/* Form */}
                <form onSubmit={handleEmail} style={{display:"flex",flexDirection:"column",gap:10}}>
                  {isSignUp && (
                    <input className="_sd-input" type="text" placeholder="Your name (optional)"
                      value={name} onChange={e=>setName(e.target.value)} disabled={!!loading}
                      style={{width:"100%",boxSizing:"border-box",padding:"10px 13px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:9,color:"#FFFFFF",fontSize:".85rem",fontFamily:"inherit",transition:"border-color .15s,box-shadow .15s"}}
                    />
                  )}
                  <input className="_sd-input" type="email" placeholder="Email address" required
                    value={email} onChange={e=>setEmail(e.target.value)} disabled={!!loading}
                    style={{width:"100%",boxSizing:"border-box",padding:"10px 13px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:9,color:"#FFFFFF",fontSize:".85rem",fontFamily:"inherit",transition:"border-color .15s,box-shadow .15s"}}
                  />
                  <button type="submit" className="_sd-btn" disabled={!email||!!loading}
                    style={{width:"100%",padding:"11px",background:email?"linear-gradient(135deg,#A6CC00,#A6CC00)":"rgba(255,255,255,0.05)",border:"none",borderRadius:9,color:email?"#fff":"#334155",fontSize:".875rem",fontWeight:600,fontFamily:"inherit",cursor:email&&!loading?"pointer":"default",transition:"all .15s",display:"flex",alignItems:"center",justifyContent:"center",gap:7,boxShadow:email?"0 4px 18px rgba(166, 204, 0,.35)":"none"}}>
                    {loading==="email"
                      ? <><div style={{width:14,height:14,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"_sdSpin .65s linear infinite"}}/> Sending…</>
                      : <>{isSignUp ? "Create account" : "Continue"} <span style={{opacity:.6,fontSize:11}}>→</span></>}
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{padding:"12px 24px 20px",borderTop:"1px solid rgba(255,255,255,0.05)",textAlign:"center"}}>
            {!emailSent && (
              <p style={{margin:"0 0 10px",fontSize:".78rem",color:"#334155"}}>
                {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
                <button className="_sd-toggle" onClick={toggleMode}
                  style={{color:"#A6CC00",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:".78rem",fontWeight:600,textDecoration:"none",transition:"color .15s",padding:0}}>
                  {isSignUp ? "Sign in" : "Sign up free"}
                </button>
              </p>
            )}
            <p style={{margin:0,fontSize:".68rem",color:"#1e293b",lineHeight:1.7}}>
              By continuing you agree to our{" "}
              <a href="/terms" style={{color:"#A6CC00",textDecoration:"none",fontWeight:500}}>Terms</a>
              {" & "}
              <a href="/privacy" style={{color:"#A6CC00",textDecoration:"none",fontWeight:500}}>Privacy Policy</a>
              <br/><span>🔒 Secured · End-to-end encrypted</span>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
