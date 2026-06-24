import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { uaIsIOSApp } from "@/lib/iosApp";
import PricingClient from "./PricingClient";
import Footer from "@/components/saas/Footer";

export const metadata = {
  title: "Pricing",
  description:
    "Buy AI video generation credits once — no subscriptions, credits never expire. From £3.50 for one 15s 1080p video, up to 35 videos for £115.",
  openGraph: {
    title: "Pricing — Seedance Studio",
    description:
      "Buy AI video generation credits once — no subscriptions, credits never expire. From £3.50 for one 15s 1080p video.",
    url: "https://seedance.visualseffect.com/pricing",
  },
  twitter: {
    title: "Pricing — Seedance Studio",
    description:
      "Buy AI video credits once, no subscriptions. Credits never expire.",
  },
};

export default async function PricingPage() {
  // Apple Guideline 3.1.1: the iOS App Store build must not expose any
  // way to buy credits (those are Stripe/web purchases). Inside the iOS
  // app the pricing page is unreachable — send users back home. Web and
  // Android are unaffected. See src/lib/iosApp.js.
  if (uaIsIOSApp((await headers()).get("user-agent"))) {
    redirect("/");
  }

  return (
    <>
      <Suspense fallback={null}>
        <PricingClient />
      </Suspense>
      <Footer />
    </>
  );
}
