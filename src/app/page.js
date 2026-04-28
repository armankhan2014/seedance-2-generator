import { Suspense } from "react";
import GenerateClient from "./GenerateClient";

export const metadata = {
  title: "AI Video Generator",
  description:
    "Generate stunning AI videos in seconds. Text-to-video, image-to-video, and audio sync powered by Seedance 2.0.",
  openGraph: {
    title: "Seedance Studio — AI Video Generator",
    description:
      "Generate stunning AI videos in seconds. Text-to-video, image-to-video, and audio sync powered by Seedance 2.0.",
    url: "https://seedance.visualseffect.com",
  },
  twitter: {
    title: "Seedance Studio — AI Video Generator",
    description:
      "Generate stunning AI videos in seconds with Seedance 2.0.",
  },
};

export default function GeneratePage() {
  return (
    <Suspense fallback={null}>
      <GenerateClient />
    </Suspense>
  );
}
