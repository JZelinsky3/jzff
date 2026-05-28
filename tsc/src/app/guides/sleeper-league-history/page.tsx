import type { Metadata } from "next"
import Link from "next/link"
import { GuideShell, faqSchema, H2, P } from "../_layout"

export const metadata: Metadata = {
  title: "How to archive your Sleeper league history",
  description:
    "Walk back through every season your Sleeper fantasy football league has ever played. Champions, drafts, matchups, rivalries — pulled from any Sleeper league ID in 30 seconds.",
  alternates: { canonical: "https://jzff.online/guides/sleeper-league-history/" },
}

export default function Page() {
  const faq = faqSchema([
    {
      q: "How do I see my Sleeper league's full history?",
      a: "Paste your Sleeper league ID into The Sunday Chronicle at jzff.online. We automatically walk Sleeper's previous_league_id chain back through every season the league has existed — pulling champions, drafts, matchups, and standings. No installation, no manual exports.",
    },
    {
      q: "How far back can you pull Sleeper league history?",
      a: "All the way to the league's founding season, as long as the chain of previous_league_id links is intact in Sleeper. Most leagues that started on Sleeper between 2017–2018 will have their full history available.",
    },
    {
      q: "Where do I find my Sleeper league ID?",
      a: "Open your league in a browser. The URL contains your league ID: sleeper.com/leagues/1234567890123456789/team — that 19-digit number is the ID. In the mobile app, tap settings → Share League to copy the URL.",
    },
    {
      q: "Do I need to be the commissioner to archive a Sleeper league?",
      a: "Yes — you need to be the league owner on Sleeper to set up an archive. Sleeper allows anyone to view league data with the league ID, but The Sunday Chronicle ties an archive to an owner account for editing and publishing controls.",
    },
    {
      q: "Is there a free trial?",
      a: "Yes — every plan includes a 10-day free trial. Cancel anytime before the trial ends and you won't be charged.",
    },
  ])

  return (
    <GuideShell
      kicker="Sleeper · Full history walk"
      title="How to archive your"
      titleEm="Sleeper league history."
      subtitle="Every season your Sleeper league has played — champions, drafts, head-to-head records, rivalries — pulled from a single league ID in 30 seconds."
      faqJsonLd={faq}
    >
      <P>
        <strong>Short version:</strong> paste your Sleeper league ID into The Sunday Chronicle at <Link href="/" style={{ color: "var(--gold)" }}>jzff.online</Link>. We walk Sleeper&apos;s <code>previous_league_id</code> chain back through every season your league has existed and turn the whole history into a public almanac — champions, drafts, every matchup, head-to-head records, and rivalries. No manual exports, no spreadsheets, no installation.
      </P>

      <H2>Where to find your Sleeper league ID</H2>
      <P>
        Open your league in a browser. The URL contains your league ID:
      </P>
      <P>
        <code style={{ background: "var(--ink-soft)", padding: ".2rem .5rem", borderRadius: "2px" }}>sleeper.com/leagues/<em style={{ color: "var(--gold)" }}>1234567890123456789</em>/team</code>
      </P>
      <P>
        That 19-digit number is your league ID. On the mobile app, tap the settings gear → <strong>Share League</strong> → it copies a URL containing the same number.
      </P>

      <H2>What gets archived</H2>
      <P>
        Once your league is connected, The Sunday Chronicle pulls everything Sleeper exposes via its public API:
      </P>
      <ul style={{ paddingLeft: "1.4rem", marginBottom: "1.25rem" }}>
        <li><strong>Every season.</strong> Walks <code>previous_league_id</code> back to the founding year.</li>
        <li><strong>Every matchup.</strong> Regular season, playoffs, championship.</li>
        <li><strong>Every draft.</strong> Round-by-round, who picked what, at what slot.</li>
        <li><strong>Champion and runner-up rolls.</strong> Auto-detected from the winners bracket.</li>
        <li><strong>Manager career stats.</strong> Wins, losses, points-for, head-to-head records.</li>
        <li><strong>Commissioner-curated rivalries.</strong> You pick the feuds; we render the head-to-head pages.</li>
      </ul>

      <H2>How long does the import take?</H2>
      <P>
        For a 5–10 season league, the initial sync takes 20–60 seconds. Sleeper&apos;s API is fast and we walk it in parallel. After the first sync, weekly cron picks up new matchups automatically through the season — no manual refresh needed.
      </P>

      <H2>Can I preview what the finished almanac looks like?</H2>
      <P>
        Yes. <a href="/demo/" target="_blank" rel="noopener" style={{ color: "var(--gold)" }}>Tour the demo</a> — a real fantasy league&apos;s seven-year history rendered as a public almanac. No signup required.
      </P>

      <H2>FAQ</H2>
      <P><strong>Do I have to be the commissioner?</strong> Yes — you sign up as the league&apos;s owner. League members can view the published almanac freely; only the commissioner manages it.</P>
      <P><strong>Can I archive multiple leagues from one account?</strong> Yes — the Veteran tier covers up to 3 leagues; All-Pro covers up to 10.</P>
      <P><strong>What if my league moved from Yahoo or ESPN to Sleeper?</strong> See our <Link href="/guides/migrate-fantasy-league/" style={{ color: "var(--gold)" }}>migration guide</Link> — you can stitch multiple sources into a single archive.</P>
      <P><strong>What does it cost?</strong> Rookie tier starts at $3/month or $15/year for one league. <Link href="/pricing" style={{ color: "var(--gold)" }}>See pricing</Link>.</P>
    </GuideShell>
  )
}
