"use client";
export const dynamic = "force-dynamic";
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
