import { Suspense } from "react";
import ProfileClient from "./ProfileClient";

export const metadata = {
  title: "Profile",
  description:
    "Manage your Seedance Studio profile, view your credit balance, and track your AI video generation stats.",
  openGraph: {
    title: "Profile — Seedance Studio",
    description:
      "Manage your Seedance Studio profile, view your credit balance, and track your AI video generation stats.",
    url: "https://seedance.visualseffect.com/profile",
  },
  twitter: {
    title: "Profile — Seedance Studio",
    description: "Manage your Seedance Studio profile and credits.",
  },
};

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfileClient />
    </Suspense>
  );
}
