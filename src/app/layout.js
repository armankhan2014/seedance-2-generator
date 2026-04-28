import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/saas/Navbar";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  metadataBase: new URL("https://seedance.visualseffect.com"),
  title: {
    default: "Seedance Studio — AI Video Generator",
    template: "%s | Seedance Studio",
  },
  description:
    "Generate stunning AI videos in seconds with Seedance 2.0. Text-to-video, image-to-video, and audio sync powered by cutting-edge AI.",
  keywords: [
    "AI video generator",
    "text to video",
    "image to video",
    "Seedance",
    "Seedance 2.0",
    "AI video",
    "video generation",
  ],
  openGraph: {
    type: "website",
    siteName: "Seedance Studio",
    title: "Seedance Studio — AI Video Generator",
    description:
      "Generate stunning AI videos in seconds with Seedance 2.0. Text-to-video, image-to-video, and audio sync.",
    url: "https://seedance.visualseffect.com",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Seedance Studio — AI Video Generator",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Seedance Studio — AI Video Generator",
    description:
      "Generate stunning AI videos in seconds with Seedance 2.0.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <Navbar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
