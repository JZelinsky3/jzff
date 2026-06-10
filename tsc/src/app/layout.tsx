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
    default: "The Sunday Chronicle — Fantasy football league archive",
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
    images: [
      {
        url: "/tsc-logo-1200.png",
        width: 1200,
        height: 1200,
        alt: "The Sunday Chronicle — TSC.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Sunday Chronicle — Fantasy football league archive",
    description: DESCRIPTION,
    images: ["/tsc-logo-1200.png"],
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
    { "@type": "Offer", name: "Rookie",  price: "3",  priceCurrency: "USD", description: "1 league, monthly" },
    { "@type": "Offer", name: "Veteran", price: "5",  priceCurrency: "USD", description: "Up to 3 leagues, monthly" },
    { "@type": "Offer", name: "All-Pro", price: "15", priceCurrency: "USD", description: "Up to 10 leagues, monthly" },
  ],
  featureList: [
    "Walks back through every season of a fantasy football league's history",
    "Imports from Sleeper, ESPN, and NFL.com league IDs",
    "Public almanac with standings, season archives, record book, draft history, manager profiles, and rivalries",
    "Weekly pick'ems and power rankings during the active season",
    "Auto-syncs in-season",
  ],
};

// Clubhouse theme restore. Lives in the ROOT layout (not /hub's) for two
// reasons: it must run before first paint on hard loads so night-mode
// readers never flash cream, and the root layout is never re-rendered by
// client-side navigation — so the script executes exactly once per
// document and the <html> attribute survives every client-side route
// change (a script inside /hub's layout re-renders on nav and React
// never executes client-rendered <script> tags).
const HUB_THEME_SCRIPT = `try{if(localStorage.getItem('tsc-hub-theme')==='night')document.documentElement.setAttribute('data-hub-theme','night')}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
      // main.css sets scroll-behavior: smooth; Next 16 wants this attribute
      // so it can suspend smooth-scrolling during route transitions.
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: HUB_THEME_SCRIPT }} />
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
