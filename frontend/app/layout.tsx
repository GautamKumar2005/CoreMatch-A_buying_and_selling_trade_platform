import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Toaster } from "react-hot-toast";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "CoreMatch — Stock Exchange Simulator",
  description:
    "Production-grade stock exchange simulator with a high-performance C++20 matching engine. Place orders, watch real-time matching, and analyze portfolio performance.",
  keywords: [
    "stock exchange",
    "matching engine",
    "trading simulator",
    "HFT",
    "order book",
    "C++",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased bg-[#0a0a0f] text-gray-100`}
      >
        <Providers>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "#1a1a2e",
                color: "#e2e8f0",
                border: "1px solid #2d2d44",
                fontFamily: "var(--font-inter)",
              },
              success: {
                iconTheme: { primary: "#00ff88", secondary: "#0a0a0f" },
              },
              error: {
                iconTheme: { primary: "#ff4444", secondary: "#0a0a0f" },
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
