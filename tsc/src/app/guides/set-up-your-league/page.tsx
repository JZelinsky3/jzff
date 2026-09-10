import { PLATFORM_SUMMARY } from '@/lib/platformStatus'
import type { Metadata } from "next"
import Link from "next/link"
import { GuideShell, faqSchema, P } from "../_layout"
import { SectionHead } from "../_compare"

export const metadata: Metadata = {
  title: "Set up your league on The Sunday Chronicle",
  description:
    "Step-by-step setup for every supported fantasy football platform. Sleeper, ESPN, Yahoo, and NFL.com. Find your league ID, paste it, publish your public almanac.",
  alternates: { canonical: "https://thesundaychronicle.app/guides/set-up-your-league/" },
}

type Platform = {
  slug: string
  name: string
  status: "Live" | "Retired" | "Unavailable"
  blurb: string
  steps: string
}

const PLATFORMS: Platform[] = [
  {
    slug: "sleeper-league-history",
    name: "Sleeper",
    status: "Live",
    blurb:
      "Sleeper's API is public and clean. No authentication, no cookies, no OAuth. Paste the league ID and every season walks back automatically through the previous_league_id chain.",
    steps: "Find league ID in URL · Paste at signup · Wait ~30s · Publish",
  },
  {
    slug: "espn-league-history",
    name: "ESPN",
    status: "Live",
    blurb:
      "Works for public and private ESPN leagues. Public leagues need only the league ID; private leagues need two cookies (SWID, espn_s2) from a logged-in ESPN tab. Pre-2018 seasons supported via the legacy archive endpoint.",
    steps: "Find league ID · Grab cookies if private · Paste at signup · Publish",
  },
  {
    slug: "yahoo-league-history",
    name: "Yahoo",
    status: "Unavailable",
    blurb:
      "Yahoo is temporarily unavailable. Yahoo now gates its fantasy API behind an approval process and our access is being re-applied for, so new Yahoo imports cannot be started right now. The OAuth flow and every season parser are already built, so this is an access problem, not a missing feature. Yahoo archives that were already imported stay online.",
    steps: "Temporarily unavailable · Existing Yahoo archives unaffected",
  },
  {
    slug: "nfl-com-league-history",
    name: "NFL.com",
    status: "Retired",
    blurb:
      "NFL.com retired its fantasy platform in August 2026. fantasy.nfl.com is gone, so there is no longer anything to import from and new NFL.com archives cannot be created. Archives built from NFL.com before the shutdown stay online and keep working. If your league is moving, ESPN is the migration path.",
    steps: "Retired by the NFL · Existing NFL.com archives unaffected",
  },
]

export default function Page() {
  const faq = faqSchema([
    {
      q: "Which fantasy football platforms does The Sunday Chronicle support?",
      a: PLATFORM_SUMMARY,
    },
    {
      q: "Do I need separate accounts for each platform?",
      a: "No. One Sunday Chronicle account works for every platform. Add a league from any host using its native ID or auth flow.",
    },
    {
      q: "Can I archive a league that started on ESPN and moved to Sleeper?",
      a: "Yes. The Sunday Chronicle supports multiple data sources per league. An ESPN history from 2010-2017 plus a Sleeper present from 2018 onwards can live under one unified almanac. See the migration guide for details.",
    },
    {
      q: "How long does setup take?",
      a: "Under 5 minutes for most platforms. Sleeper and NFL.com are 30-60 seconds; ESPN takes longer if you need to grab cookies for a private league; Yahoo requires a one-time OAuth handshake but is still under 3 minutes start-to-finish.",
    },
  ])

  return (
    <GuideShell
      kicker="Setup · Every supported platform"
      title="Set up your league."
      titleEm="Every platform, every step."
      subtitle="Pick your fantasy football host below. Each guide walks the exact steps to find your league ID, paste it, and publish your public almanac. Most setups take under 5 minutes."
      breadcrumbSlug="set-up-your-league"
      datePublished="2026-06-22"
      dateModified="2026-06-22"
      faqJsonLd={faq}
    >
      <P>
        <strong>One account, four platforms.</strong> The Sunday Chronicle reads from your existing fantasy host (Sleeper, ESPN, Yahoo, or NFL.com) and turns the full history into a public almanac. You don&apos;t move your league. The host stays exactly where it is. Pick your platform below for the step-by-step.
      </P>

      <SectionHead kicker="Platforms" title="Pick your fantasy host.">
        Each link opens the dedicated setup guide for that platform.
      </SectionHead>

      <div className="setup-platforms">
        {PLATFORMS.map((p) => (
          <Link key={p.slug} href={`/guides/${p.slug}/`} className="setup-platform">
            <div className="setup-platform-head">
              <span className="setup-platform-name">{p.name}</span>
              <span className={`setup-platform-pill setup-platform-pill-${p.status.toLowerCase()}`}>
                {p.status}
              </span>
            </div>
            <p className="setup-platform-blurb">{p.blurb}</p>
            <div className="setup-platform-steps">{p.steps}</div>
            <span className="setup-platform-cta">
              Open the {p.name} setup guide <span aria-hidden>→</span>
            </span>
          </Link>
        ))}
      </div>

      <SectionHead kicker="Cross-platform leagues" title="Started on one host, moved to another?">
        Common: ESPN to Sleeper, Yahoo to ESPN, NFL.com to anywhere. You don&apos;t have to pick one.
      </SectionHead>

      <P>
        Long-running leagues often span multiple platforms. The Sunday Chronicle supports multiple data sources under a single archive, so an ESPN history can sit next to a Sleeper present without losing either. Walk through{" "}
        <Link href="/guides/migrate-fantasy-league/" style={{ color: "var(--gold)" }}>the migration guide</Link>
        {" "}for the full process.
      </P>

      <SectionHead kicker="Stuck or evaluating" title="Not sure your league is ready?">
        Try the demo first.
      </SectionHead>

      <P>
        <Link href="/demo/" style={{ color: "var(--gold)" }}>Tour the demo almanac</Link>
        {" "}to see exactly what a finished league archive looks like. Seven seasons populated, every page working, no signup required. Once you can picture it for your league, the setup is the easy part.
      </P>
    </GuideShell>
  )
}
