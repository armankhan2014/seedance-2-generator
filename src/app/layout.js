import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import Navbar from "@/components/saas/Navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Seedance Studio — AI Video Generator",
  description: "Generate stunning AI videos with Seedance 2.0. Professional quality, instant results.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-dvh w-full transition-colors duration-500" data-theme="dark" style={{ colorScheme: "dark" }}>
      <body className={inter.className + " antialiased"} style={{ background: "#0a0a0a", color: "#f1f5f9" }}>
        <Providers>
          <Navbar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
