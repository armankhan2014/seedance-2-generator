"use client";
export const dynamic = "force-dynamic";
import { useSession, signIn } from "next-auth/react";
import { useState } from "react";

const P = [{id:"starter",n:"Starter",c:3000,p:10},{id:"power",n:"Power Engine",c:7000,p:35,hot:true},{id:"quantum",n:"Quantum Flow",c:24000,p:120}];

export default function Page() {
  const {data:s} = useSession();
  const [l,setL] = useState(null);
  const [m,setM] = useState("");
  async function buy(id) {
    if(!s){signIn("google");return;}
    setL(id);
    try {
      const r = await fetch("/api/stripe/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan:id})});
      const d = await r.json();
      if(d.url) window.location.href=d.url;
      else setM("Error: "+(d.error||"unknown"));
    } catch(e){setM("Error: "+e.message);}
    setL(null);
  }
  return (
    <div style={{background:"#0a0a0a",minHeight:"100vh",fontFamily:"Inter,sans-serif",padding:"60px 20px"}}>
      <div style={{maxWidth:"900px",margin:"0 auto"}}>
        <h1 style={{textAlign:"center",color:"#fff",fontSize:"2rem",fontWeight:900,marginBottom:8}}>Simple Pricing</h1>
        <p style={{textAlign:"center",color:"#64748b",marginBottom:40}}>Buy credits once. No subscriptions. Never expire.</p>
        {m && <div style={{textAlign:"center",padding:"10px",borderRadius:"8px",marginBottom:24,background:"rgba(139,92,246,.1)",color:"#a78bfa",border:"1px solid rgba(139,92,246,.3)"}}>{m}</div>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:20}}>
          {P.map(plan=>(
            <div key={plan.id} style={{background:"#111",border:plan.hot?"1px solid #8b5cf6":"1px solid rgba(255,255,255,.08)",borderRadius:16,padding:"32px 24px",position:"relative"}}>
              {plan.hot&&<div style={{position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",background:"linear-gradient(135deg,#8b5cf6,#7c3aed)",color:"#fff",fontSize:".7rem",fontWeight:700,padding:"3px 14px",borderRadius:50}}>Most Popular</div>}
              <div style={{fontSize:".75rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"1px",marginBottom:10}}>{plan.n}</div>
              <div style={{fontSize:"2.4rem",fontWeight:900,color:"#fff",marginBottom:4}}><sup style={{fontSize:"1.1rem",verticalAlign:"top",marginTop:6}}>$</sup>{plan.p}</div>
              <div style={{fontSize:".82rem",color:"#8b5cf6",fontWeight:600,marginBottom:24}}>{plan.c.toLocaleString()} Credits</div>
              <button onClick={()=>buy(plan.id)} disabled={l===plan.id} style={{width:"100%",padding:"11px",borderRadius:9,fontSize:".88rem",fontWeight:700,cursor:"pointer",border:plan.hot?"none":"1px solid rgba(255,255,255,.12)",background:plan.hot?"linear-gradient(135deg,#8b5cf6,#7c3aed)":"transparent",color:plan.hot?"#fff":"#94a3b8",fontFamily:"inherit",opacity:l===plan.id?.5:1}}>
                {l===plan.id?"Redirecting...":(s?"Buy Credits":"Sign in to Buy")}
              </button>
            </div>
          ))}
        </div>
        <p style={{textAlign:"center",color:"#475569",fontSize:".75rem",marginTop:28}}>Secure payments via Stripe. Credits never expire.</p>
      </div>
    </div>
  );
}
