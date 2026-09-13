import DownloadClient from "./DownloadClient";

// Metadata lives here (server component); the page body is
// platform-aware and lives in DownloadClient.jsx — Android keeps the
// direct APK, iPhone gets the Add-to-Home-Screen install while the
// native app is in Apple review.
export const metadata = {
  title: "Download Seedance — iPhone & Android",
  description:
    "Install the Seedance AI video generator. iPhone: add to your home screen in 10 seconds (App Store version in review). Android: direct APK install.",
  alternates: { canonical: "https://seedance.visualseffect.com/download" },
  openGraph: {
    type: "website",
    siteName: "Seedance Studio",
    url: "https://seedance.visualseffect.com/download",
    title: "Get Seedance on your phone — 100 free credits",
    description:
      "Type. Tap. Cinema. Generate cinematic AI video from text, photos, or multi-shot stories. iPhone + Android — install in 30 seconds.",
    images: [
      {
        url: "https://seedance.visualseffect.com/og-download.png",
        width: 1200,
        height: 630,
        alt: "Seedance — AI Video Generator. Type. Tap. Cinema.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Get Seedance on your phone — 100 free credits",
    description:
      "Type. Tap. Cinema. Cinematic AI video in 30 seconds. iPhone + Android.",
    images: ["https://seedance.visualseffect.com/og-download.png"],
  },
};

export default function DownloadPage() {
  return <DownloadClient />;
}
