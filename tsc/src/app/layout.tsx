import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { MobileSiteMenu } from "@/components/MobileSiteMenu";
import { MobileHeaderCollapse } from "@/components/MobileHeaderCollapse";
import { MobileViewEscape } from "@/components/MobileViewEscape";
import { NavTracker } from "@/components/NavTracker";
import { createClient } from "@/lib/supabase/server";
import { isSiteAdmin } from "@/lib/siteAdmin";
import { isMobileForcingDesktop } from "@/lib/viewMode";
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
  "Turn your fantasy football league's full history into the best-designed public almanac on the web. Walks Sleeper, ESPN, Yahoo, or NFL.com league IDs back through every season: champions, drafts, rivalries, head-to-head records, weekly pick'ems. Built for commissioners.";

export const metadata: Metadata = {
  metadataBase: new URL("https://thesundaychronicle.app"),
  title: {
    default: "The Sunday Chronicle · Fantasy Football League History & Almanac",
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
    title: "The Sunday Chronicle · Fantasy football league archive for commissioners",
    description: DESCRIPTION,
    siteName: "The Sunday Chronicle",
    locale: "en_US",
    images: [
      {
        // Editorial card rendered server-side at /api/og/home — broadsheet
        // masthead + tagline + feature/platform strips. Sized 1200×630 to
        // satisfy iMessage / Slack / Discord / X large-card previews. Bump
        // the ?v= when the design changes if crawlers cache the old one.
        url: "/api/og/home?v=5",
        width: 1200,
        height: 630,
        alt: "The Sunday Chronicle: your league's history, archived for good.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Sunday Chronicle · Fantasy Football League History & Almanac",
    description: DESCRIPTION,
    images: ["/api/og/home?v=5"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  },
  // iOS home-screen install. Modern Safari (16.4+) reads the manifest for
  // standalone display; these metas keep the app title + status bar right
  // on older iOS and when installed via the share sheet.
  //
  // startupImage covers the icon-tap -> first-paint window on iOS — without
  // these, iOS shows OS-default black/white. Each entry pairs a device
  // resolution with the splash route at the matching dimensions. Bump ?v=
  // on every entry when you redesign /api/og/splash so iOS refetches.
  appleWebApp: {
    capable: true,
    title: "TSC",
    statusBarStyle: "black-translucent",
    startupImage: [
      // iPhone 16 Pro Max
      { url: "/api/og/splash?w=1320&h=2868&v=1", media: "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      // iPhone 16 Pro
      { url: "/api/og/splash?w=1206&h=2622&v=1", media: "(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      // iPhone 15/16 Plus / 14 Pro Max / 15 Pro Max
      { url: "/api/og/splash?w=1290&h=2796&v=1", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      // iPhone 14 Pro / 15 / 15 Pro / 16
      { url: "/api/og/splash?w=1179&h=2556&v=1", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      // iPhone 12/13 Pro Max / 14 Plus
      { url: "/api/og/splash?w=1284&h=2778&v=1", media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      // iPhone 12/13/14
      { url: "/api/og/splash?w=1170&h=2532&v=1", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      // iPhone 12/13 mini
      { url: "/api/og/splash?w=1080&h=2340&v=1", media: "(device-width: 360px) and (device-height: 780px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      // iPhone X / XS / 11 Pro
      { url: "/api/og/splash?w=1125&h=2436&v=1", media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      // iPhone XS Max / 11 Pro Max
      { url: "/api/og/splash?w=1242&h=2688&v=1", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      // iPhone XR / 11
      { url: "/api/og/splash?w=828&h=1792&v=1",  media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      // iPhone 6/7/8 Plus
      { url: "/api/og/splash?w=1242&h=2208&v=1", media: "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      // iPhone 6/7/8 / SE 2/3
      { url: "/api/og/splash?w=750&h=1334&v=1",  media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      // iPhone SE 1st gen / 5/5s
      { url: "/api/og/splash?w=640&h=1136&v=1",  media: "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
    ],
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
//
// width/initialScale default for every page so phones get a real mobile
// viewport. Without this, pages that don't export their own `viewport`
// (e.g. /dashboard, /account, /toc, /privacy, /terms, /dashboard/new)
// fall back to iOS Safari's 980px default — the mobile fork renders, but
// the whole page is scaled down to fit, so cards look "wide" and text
// looks tiny. Pages that need a different setting (maximumScale, etc.)
// can still override by exporting their own `viewport`.
export const viewport: Viewport = {
  themeColor: "#0e1620",
  width: "device-width",
  initialScale: 1,
};

// Multi-block JSON-LD. AI assistants and search crawlers each weight
// different schema.org types: SoftwareApplication answers "what does it
// do / what does it cost" queries, Organization establishes the brand as
// an entity in the model's knowledge graph, WebSite enables sitelinks +
// in-result search boxes, Product gives shopping/marketplace surfaces
// something to compare against competitor listings. All four describe the
// same thing — duplication is intentional and recommended.
const softwareLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": "https://thesundaychronicle.app/#software",
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
    "Imports from Sleeper, ESPN, NFL.com, and Yahoo league IDs",
    "Public almanac with standings, season archives, record book, draft history, manager profiles, and rivalries",
    "Weekly pick'ems and power rankings during the active season",
    "Live-season tools: Sunday command center, matchup previews, best-coach tracker, manager DNA, weekly recaps",
    "Auto-syncs in-season",
  ],
  publisher: { "@id": "https://thesundaychronicle.app/#org" },
};

const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://thesundaychronicle.app/#org",
  name: "The Sunday Chronicle",
  alternateName: ["TSC", "JZFF"],
  url: "https://thesundaychronicle.app/",
  logo: "https://thesundaychronicle.app/icon.png",
  description:
    "The Sunday Chronicle builds polished, public-facing fantasy football league history almanacs from Sleeper, ESPN, NFL.com, and Yahoo league IDs.",
  foundingDate: "2026",
  knowsAbout: [
    "Fantasy football",
    "Fantasy football league history",
    "Dynasty fantasy football",
    "Sleeper fantasy football",
    "ESPN fantasy football",
    "NFL.com fantasy football",
    "Yahoo fantasy football",
    "Fantasy football league management",
    "Fantasy football commissioner tools",
  ],
};

const websiteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://thesundaychronicle.app/#website",
  name: "The Sunday Chronicle",
  url: "https://thesundaychronicle.app/",
  description: DESCRIPTION,
  publisher: { "@id": "https://thesundaychronicle.app/#org" },
  inLanguage: "en-US",
};

const productLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  "@id": "https://thesundaychronicle.app/#product",
  name: "The Sunday Chronicle · Fantasy Football League History Almanac",
  description: DESCRIPTION,
  brand: { "@id": "https://thesundaychronicle.app/#org" },
  category: "Fantasy Football League Management Software",
  url: "https://thesundaychronicle.app/",
  image: "https://thesundaychronicle.app/api/og/home?v=5",
  offers: {
    "@type": "AggregateOffer",
    lowPrice: "0",
    highPrice: "15",
    priceCurrency: "USD",
    offerCount: 4,
    offers: [
      { "@type": "Offer", name: "Free",    price: "0",  priceCurrency: "USD", description: "1 league, forever" },
      { "@type": "Offer", name: "Rookie",  price: "3",  priceCurrency: "USD", description: "1 league, monthly" },
      { "@type": "Offer", name: "Veteran", price: "5",  priceCurrency: "USD", description: "Up to 3 leagues, monthly" },
      { "@type": "Offer", name: "All-Pro", price: "15", priceCurrency: "USD", description: "Up to 10 leagues, monthly" },
    ],
  },
};

const jsonLdGraph = {
  "@context": "https://schema.org",
  "@graph": [softwareLd, organizationLd, websiteLd, productLd],
};

// Clubhouse theme restore. Lives in the ROOT layout (not /hub's) for two
// reasons: it must run before first paint on hard loads so night-mode
// readers never flash cream, and the root layout is never re-rendered by
// client-side navigation — so the script executes exactly once per
// document and the <html> attribute survives every client-side route
// change (a script inside /hub's layout re-renders on nav and React
// never executes client-rendered <script> tags).
// The second half keeps Safari's toolbar tint honest on /hub at night:
// the hub layout SSRs theme-color as clubhouse cream (day), so when the
// stored theme is night the meta must flip to the hub's black pre-paint.
// HubThemeToggle keeps it in sync from then on.
const HUB_THEME_SCRIPT = `try{var n=localStorage.getItem('tsc-hub-theme')==='night';if(n)document.documentElement.setAttribute('data-hub-theme','night');if(n&&location.pathname.slice(0,4)==='/hub'){var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content','#0d0d0d')}}catch(e){}`;

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
  // A phone that explicitly opted into the desktop view (dc_view=desktop)
  // gets a global "Switch back to mobile" pill so they can always escape
  // — otherwise a single accidental tap on a "View desktop site" link
  // strands them in the desktop tree on every page until they hand-clear
  // the cookie.
  const stuckOnDesktop = await isMobileForcingDesktop();

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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph) }}
        />
        <div className="site-glow"></div>
        <div className="site-grain"></div>
        <NavTracker />
        {children}
        <MobileSiteMenu signedIn={signedIn} email={user?.email ?? null} admin={admin} />
        {stuckOnDesktop && <MobileViewEscape />}
        <MobileHeaderCollapse />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
