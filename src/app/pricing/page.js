"use client";
import { useSession, signIn } from "next-auth/react";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

const PLANS = [
  { id: "starter", name: "Starter", credits: 3000, price: 15, desc: "Perfect for exploring AI video creation", features: ["3,000 Credits", "All video models", "All image models", "Standard quality"] },
  { id: "power",   name: "Power Engine", credits: 7000, price: 35, desc: "For serious creators", popular: true, features: ["7,000 Credits", "All video models", "All image models", "Priority generation"] },
  { id: "quantum", name: "Quantum Flow", credits: 24000, price: 120, desc: "Maximum creative output", features: ["24,000 Credits", "All video models", "All image models", "Fastest generation"] }
];

export default function PricingPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (searchParams.get("success")) setMsg("Payment successful! Credits added to your account.");
    if (searchParams.get("cancelled")) setMsg("Payment cancelled.");
  }, [searchParams]);

  async function handlePurchase(planId) {
    if (!session) { signIn("google"); return; }
    setLoading(planId);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId })
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; }
      else { setMsg("Error: " + (data.error || "Unknown error")); }
    } catch(e) {
      setMsg("Error: " + e.message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{background:"#0a0a0a",minHeight:"100vh",fontFamily:"Inter,sans-serif",padding:"60px 20px"}}>
      <div style={{maxWidth:"1000px",margin:"0 auto"}}>
        <h1 style={{textAlign:"center",color:"#fff",fontSize:"2rem",fontWeight:900,marginBottom:8}}>Simple, Transparent Pricing</h1>
        <p style={{textAlign:"center",color:"#64748b",marginBottom:48}}>Buy credits once, use across all models. No subscriptions.</p>
        {msg && <div style={{textAlign:"center",padding:"12px",borderRadius:"8px",marginBottom:32,background:msg.includes("success")?"rgba(34,197,94,.1)":"rgba(239,68,68,.1)",color:msg.includes("success")?"#22c55e":"#ef4444",border:`1px solid ${msg.includes("success")?"rgba(34,197,94,.3)":"rgba(239,68,68,.3)"}`}}>{msg}</div>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:20}}>
          {PLANS.map(plan => (
            <div key={plan.id} style={{background:"#111",border:plan.popular?"1px solid #8b5cf6":"1px solid rgba(255,255,255,.08)",borderRadius:16,padding:"32px 28px",position:"relative"}}>
              {plan.popular && <div style={{position:"absolute",top:-13,left:"50%",transform:"translateX(-50%)",background:"linear-gradient(135deg,#8b5cf6,#7c3aed)",color:"#fff",fontSize:".7rem",fontWeight:700,padding:"4px 14px",borderRadius:50,whiteSpace:"nowrap"}}>Most Popular</div>}
              <div style={{fontSize:".78rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"1px",marginBottom:10}}>{plan.name}</div>
              <div style={{fontSize:"2.6rem",fontWeight:900,color:"#fff",letterSpacing:-1,marginBottom:4}}><sup style={{fontSize:"1.2rem",verticalAlign:"top",marginTop:8}}>$</sup>{plan.price}</div>
              <div style={{fontSize:".82rem",color:"#8b5cf6",fontWeight:600,marginBottom:16}}>{plan.credits.toLocaleString()} Credits</div>
              <div style={{fontSize:".83rem",color:"#64748b",marginBottom:20,lineHeight:1.5}}>{plan.desc}</div>
              <hr style={{border:"none",borderTop:"1px solid rgba(255,255,255,.07)",margin:"20px 0"}}/>
              <ul style={{listStyle:"none",padding:0,margin:"0 0 24px",display:"flex",flexDirection:"column",gap:8}}>
                {plan.features.map(f => <li key={f} style={{fontSize:".84rem",color:"#94a3b8",paddingLeft:20,position:"relative"}}><span style={{position:"absolute",left:0,color:"#8b5cf6"}}>✓</span>{f}</li>)}
              </ul>
              <button onClick={() => handlePurchase(plan.id)} disabled={loading===plan.id} style={{width:"100%",padding:12,borderRadius:10,fontSize:".88rem",fontWeight:700,cursor:"pointer",border:plan.popular?"none":"1px solid rgba(255,255,255,.12)",background:plan.popular?"linear-gradient(135deg,#8b5cf6,#7c3aed)":"transparent",color:plan.popular?"#fff":"#94a3b8",opacity:loading===plan.id?.5:1,fontFamily:"inherit"}}>
                {loading===plan.id ? "Redirecting to Stripe..." : (session ? "Buy Credits" : "Sign in to Purchase")}
              </button>
            </div>
          ))}
        </div>
        <p style={{textAlign:"center",color:"#475569",fontSize:".78rem",marginTop:32}}>Payments processed securely by Stripe. Credits never expire.</p>
      </div>
    </div>
  );
            }
