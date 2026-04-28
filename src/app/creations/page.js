import { Suspense } from "react";
import CreationsClient from "./CreationsClient";
import Footer from "@/components/saas/Footer";

export const metadata = {
  title: "My Creations",
  description:
    "Browse and manage all your AI-generated videos in your Seedance Studio gallery.",
  openGraph: {
    title: "My Creations — Seedance Studio",
    description:
      "Browse and manage all your AI-generated videos in your Seedance Studio gallery.",
    url: "https://seedance.visualseffect.com/creations",
  },
  twitter: {
    title: "My Creations — Seedance Studio",
    description: "Browse your AI-generated video gallery on Seedance Studio.",
  },
};

export default function CreationsPage() {
  return (
    <>
      <Suspense fallback={null}>
        <CreationsClient />
      </Suspense>
      <Footer />
    </>
  );
}
