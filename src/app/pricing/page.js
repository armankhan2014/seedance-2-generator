import { Suspense } from "react";
import PricingClient from "./PricingClient";

export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingClient />
    </Suspense>
  );
}
