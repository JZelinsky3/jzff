import type { Metadata } from "next";
import { DM_Serif_Display, Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
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

const DESCRIPTION =
  "Turn your fantasy football league's full history into a polished public almanac. Walks Sleeper, ESPN, or NFL.com league IDs back through every season — champions, drafts, rivalries, head-to-head records, weekly pick'ems. Built for commissioners.";

export const metadata: Metadata = {
  metadataBase: new URL("https://jzff.online"),
  title: {
    default: "The Sunday Chronicle — Fantasy football league archive for commissioners",
    template: "%s · The Sunday Chronicle",
  },
  description: DESCRIPTION,
  keywords: [
    "fantasy football",
    "fantasy football league history",
    "fantasy football archive",
    "fantasy football commissioner",
    "sleeper league history",
    "espn fantasy league history",
    "dynasty league archive",
    "fantasy football record book",
    "fantasy football rivalries",
  ],
  authors: [{ name: "JZFF", url: "https://jzff.online" }],
  creator: "JZFF",
  openGraph: {
    type: "website",
    url: "https://jzff.online/",
    title: "The Sunday Chronicle — Fantasy football league archive for commissioners",
    description: DESCRIPTION,
    siteName: "The Sunday Chronicle",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Sunday Chronicle — Fantasy football league archive",
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  },
  alternates: { canonical: "https://jzff.online/" },
  // Search engine site verifications. Google uses the HTML file at
  // /public/google2963fe74b5dcc516.html; Bing uses the meta tag injected
  // here. Both can coexist; both improve indexing → AI tool retrieval.
  verification: {
    other: {
      "msvalidate.01": "61FE2490BE5D1908387539654B1C10C9",
    },
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "The Sunday Chronicle",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Fantasy Football League Archive",
  operatingSystem: "Web",
  url: "https://jzff.online/",
  description: DESCRIPTION,
  offers: [
    { "@type": "Offer", name: "Rookie", price: "5",  priceCurrency: "USD", description: "1 league, monthly" },
    { "@type": "Offer", name: "Veteran", price: "15", priceCurrency: "USD", description: "Up to 5 leagues, monthly" },
    { "@type": "Offer", name: "Legend", price: "25", priceCurrency: "USD", description: "Unlimited leagues, monthly" },
  ],
  featureList: [
    "Walks back through every season of a fantasy football league's history",
    "Imports from Sleeper, ESPN, and NFL.com league IDs",
    "Public almanac with standings, season archives, record book, draft history, manager profiles, and rivalries",
    "Weekly pick'ems and power rankings during the active season",
    "Auto-syncs in-season",
  ],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <div className="site-glow"></div>
        <div className="site-grain"></div>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
