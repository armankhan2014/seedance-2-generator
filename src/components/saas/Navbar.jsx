"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const links = [
    { href: "/", label: "Generate" },
    { href: "/creations", label: "Gallery" },
    { href: "/pricing", label: "Pricing" },
  ];
  return (
    <header style={{background:"#0a0a0a",borderBottom:"1px solid rgba(255,255,255,0.08)",position:"sticky",top:0,zIndex:50,fontFamily:"Inter,sans-serif"}}>
      <div style={{maxWidth:"1200px",margin:"0 auto",padding:"0 20px",height:"64px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <Link href="/" style={{textDecoration:"none",fontSize:"1.1rem",fontWeight:800,color:"#fff"}}>
          Seedance<span style={{background:"linear-gradient(135deg,#8b5cf6,#7c3aed)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Studio</span>
        </Link>
        <nav style={{display:"flex",gap:"4px"}}>
          {links.map(l => (
            <Link key={l.href} href={l.href} style={{padding:"6px 14px",borderRadius:"8px",fontSize:"0.85rem",fontWeight:600,textDecoration:"none",color:pathname===l.href?"#fff":"#64748b",background:pathname===l.href?"rgba(139,92,246,0.15)":"transparent"}}>{l.label}</Link>
          ))}
        </nav>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          {session ? (
            <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
              <span style={{fontSize:"0.8rem",color:"#94a3b8"}}>{session.user?.name?.split(" ")[0]}</span>
              <button onClick={() => signOut()} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"8px",color:"#94a3b8",padding:"6px 14px",fontSize:"0.8rem",cursor:"pointer",fontFamily:"inherit"}}>Sign out</button>
            </div>
          ) : (
            <button onClick={() => signIn("google")} style={{background:"linear-gradient(135deg,#8b5cf6,#7c3aed)",border:"none",borderRadius:"8px",color:"#fff",padding:"8px 20px",fontSize:"0.85rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Sign in with Google</button>
          )}
        </div>
      </div>
    </header>
  );
}
