import { Suspense } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import Navbar from "@/components/saas/Navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Seedance Studio — AI Video Generator",
  description: "Generate stunning AI videos with Seedance 2.0.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-dvh w-full" style={{ colorScheme: "dark" }}>
      <body className={inter.className} style={{ background: "#0a0a0a", color: "#f1f5f9" }}>
        <Providers>
          <Suspense fallback={null}>
            <Navbar />
          </Suspense>
          {children}
        </Providers>
      </body>
    </html>
  );
}
