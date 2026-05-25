import type { Metadata } from "next";
import { DM_Serif_Display, Inter, JetBrains_Mono } from "next/font/google";
// Order matters: globals.css imports tailwindcss; main.css is loaded second
// so its custom design tokens (--ink, --cream, --gold, body bg) override the
// Tailwind preflight resets. Bundling both via JS imports lets Next.js stream
// them in the document head reliably — a manual <link rel="stylesheet"> in
// the head was racing the first paint, leaving the homepage occasionally
// unstyled on cold loads.
import "./globals.css";
import "@/styles/main.css";

const serif = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const sans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The Sunday Chronicle — Built for the history of the league.",
  description: "Built for the history of the league. An almanac of every season, draft, and rivalry, kept for as long as you play.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
    >
      <body>
        <div className="site-glow"></div>
        <div className="site-grain"></div>
        {children}
      </body>
    </html>
  );
}
