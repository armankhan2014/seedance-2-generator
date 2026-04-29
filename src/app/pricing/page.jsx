import { Suspense } from "react";
import PricingClient from "./PricingClient";
import Footer from "@/components/saas/Footer";

export const metadata = {
  title: "Pricing",
  description:
    "Buy AI video generation credits once — no subscriptions, credits never expire. Starting at $37.50 for 3,000 credits.",
  openGraph: {
    title: "Pricing — Seedance Studio",
    description:
      "Buy AI video generation credits once — no subscriptions, credits never expire. Starting at $37.50 for 3,000 credits.",
    url: "https://seedance.visualseffect.com/pricing",
  },
  twitter: {
    title: "Pricing — Seedance Studio",
    description:
      "Buy AI video credits once, no subscriptions. Credits never expire.",
  },
};

export default function PricingPage() {
  return (
    <>
      <Suspense fallback={null}>
        <PricingClient />
      </Suspense>
      <Footer />
    </>
  );
}
