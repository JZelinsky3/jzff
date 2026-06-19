import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { MobileSiteMenu } from "@/components/MobileSiteMenu";
import { MobileHeaderCollapse } from "@/components/MobileHeaderCollapse";
import { createClient } from "@/lib/supabase/server";
import { isSiteAdmin } from "@/lib/siteAdmin";
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
  metadataBase: new URL("https://thesundaychronicle.app"),
  title: {
    default: "The Sunday Chronicle — Fantasy Football League History & Almanac",
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
  authors: [{ name: "JZFF", url: "https://thesundaychronicle.app" }],
  creator: "JZFF",
  openGraph: {
    type: "website",
    url: "https://thesundaychronicle.app/",
    title: "The Sunday Chronicle — Fantasy football league archive for commissioners",
    description: DESCRIPTION,
    siteName: "The Sunday Chronicle",
    locale: "en_US",
    images: [
      {
        // Editorial card rendered server-side at /api/og/home — broadsheet
        // masthead + tagline + feature/platform strips. Sized 1200×630 to
        // satisfy iMessage / Slack / Discord / X large-card previews. Bump
        // the ?v= when the design changes if crawlers cache the old one.
        url: "/api/og/home?v=1",
        width: 1200,
        height: 630,
        alt: "The Sunday Chronicle — your league's history, archived for good.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Sunday Chronicle — Fantasy Football League History & Almanac",
    description: DESCRIPTION,
    images: ["/api/og/home?v=1"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  },
  // iOS home-screen install. Modern Safari (16.4+) reads the manifest for
  // standalone display; these metas keep the app title + status bar right
  // on older iOS and when installed via the share sheet.
  appleWebApp: {
    capable: true,
    title: "TSC",
    statusBarStyle: "black-translucent",
  },
  alternates: { canonical: "https://thesundaychronicle.app/" },
  // Search engine site verifications. Google uses the HTML file at
  // /public/google2963fe74b5dcc516.html; Bing uses the meta tag injected
  // here. Both can coexist; both improve indexing → AI tool retrieval.
  verification: {
    other: {
      "msvalidate.01": "61FE2490BE5D1908387539654B1C10C9",
    },
  },
};

// Tints the Android/Chrome toolbar (and the installed PWA's title bar) to
// the site's ink so the chrome blends with the masthead instead of flashing
// white. Matches theme_color in manifest.ts.
export const viewport: Viewport = {
  themeColor: "#0e1620",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "The Sunday Chronicle",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Fantasy Football League Archive",
  operatingSystem: "Web",
  url: "https://thesundaychronicle.app/",
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Mount the mobile-only site menu once globally so every page (including
  // ones that don't render their own <nav>: /dashboard, /league/[slug]/*,
  // /admin) gets the same uniform avatar trigger on phones. Desktop hides
  // it via CSS; the existing per-page desktop nav clusters stay unchanged.
  // One auth check per request is cheap relative to a page render.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const signedIn = !!user;
  const admin = signedIn ? await isSiteAdmin(user!.id) : false;

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
        <MobileSiteMenu signedIn={signedIn} email={user?.email ?? null} admin={admin} />
        <MobileHeaderCollapse />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
