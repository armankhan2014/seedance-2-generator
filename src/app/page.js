import HomepageV2 from "@/components/saas/HomepageV2";
import { getCachedPublicGallery } from "@/lib/cache";

export const metadata = {
  title: "Seedance Studio — AI Video Generator",
  description: "Turn your ideas into cinematic AI videos with Seedance 2.0. Write a prompt and generate stunning videos in seconds.",
};

// Revalidate this page every 60 seconds so gallery stays fresh
export const revalidate = 60;

export default async function HomePage() {
  // Pre-fetch on the server — data arrives with the HTML, zero client wait
  let initialVideos = [];
  try {
    initialVideos = await getCachedPublicGallery();
  } catch (_) {}

  return <HomepageV2 initialVideos={initialVideos} />;
}
