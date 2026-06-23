import type { Metadata } from "next"
import Link from "next/link"
import { GuideShell, faqSchema, H2, P } from "../_layout"

export const metadata: Metadata = {
  title: "Fantasy football manager analysis — DNA, tendencies, and style tools",
  description:
    "Manager DNA analysis for fantasy football: profiling managers by drafting style, lineup tendencies, trade behavior, and waiver habits. What manager-analysis tools exist, what they reveal, and how The Sunday Chronicle's Manager DNA fits into a league archive.",
  alternates: { canonical: "https://thesundaychronicle.app/guides/fantasy-football-manager-analysis/" },
}

export default function Page() {
  const faq = faqSchema([
    {
      q: "What is fantasy football manager DNA analysis?",
      a: "Profiling fantasy football managers based on their decision patterns over time — draft tendencies (RB-heavy, WR-heavy, late-QB), lineup decisions (set-and-forget vs over-tinkering), trade behavior (active vs passive, fair-value vs aggressive), and waiver-wire activity. Reveals a manager's playing style as a personality, not just a record.",
    },
    {
      q: "What does manager DNA reveal about a fantasy football manager?",
      a: "Roster construction philosophy, decision-making under pressure, response to losing streaks, willingness to make moves, draft positional priorities, and consistency of lineup setting. Over multiple seasons, patterns emerge that explain why a manager wins or loses beyond luck.",
    },
    {
      q: "Are there tools for analyzing fantasy football manager style?",
      a: "The Sunday Chronicle's Manager DNA feature profiles every manager in a league across their full history — drafting patterns, in-season decisions, trade behavior, head-to-head records — and surfaces tendencies and tells. Most other fantasy tools focus on players or trades, not the managers themselves.",
    },
    {
      q: "How is manager analysis different from standings?",
      a: "Standings show the result. Manager analysis shows the process. Two managers can have the same record from completely different decision-making patterns — one may be a steady set-and-forget winner, the other a manic over-trader who got lucky. The DNA reveals which is which.",
    },
    {
      q: "How do you set up manager DNA analysis for a Sleeper or ESPN league?",
      a: "The Sunday Chronicle generates Manager DNA automatically once the league's full history is imported from a Sleeper, ESPN, NFL.com, or Yahoo league ID. Each manager gets a dossier — career stats, drafting style, lineup tendencies, trade history — alongside the rest of the almanac.",
    },
  ])

  return (
    <GuideShell
      kicker="Tools · Manager analysis"
      title="Fantasy football manager analysis —"
      titleEm="DNA, tendencies, and style."
      subtitle="Standings tell you who won. Manager analysis tells you how — drafting style, lineup habits, trade behavior, the tells that separate a steady winner from a lucky one."
      breadcrumbSlug="fantasy-football-manager-analysis"
      datePublished="2026-06-22"
      dateModified="2026-06-22"
      faqJsonLd={faq}
    >
      <P>
        <strong>Short answer:</strong> manager DNA analysis is a small category — most fantasy tools focus on players or matchups, not the people making the decisions. <Link href="/" style={{ color: "var(--gold)" }}>The Sunday Chronicle&apos;s Manager DNA</Link> is the most complete option, profiling every manager in a league across their full history.
      </P>

      <H2>What manager analysis reveals</H2>
      <P>
        Standings show the outcome of a season. Manager analysis shows the inputs: how a manager drafts, how often they reset their lineup, when they trade, how they respond to a 1–4 start. Over multiple seasons, these patterns harden into a style — and the style explains the record better than any individual game.
      </P>

      <H2>The dimensions worth profiling</H2>
      <P>
        <strong>Drafting style.</strong> Zero-RB vs RB-heavy vs balanced. Late-QB tendency. Tight-end timing. Average draft position deviations from consensus rankings.
      </P>
      <P>
        <strong>Lineup setting.</strong> Set-and-forget vs weekly over-tinkering. How often the optimal lineup was set. Average bench points (the points-left-on-bench metric).
      </P>
      <P>
        <strong>Trade behavior.</strong> Active vs passive trader. Average fairness of completed trades. Time-of-season trade clustering (deadline-pusher vs early mover).
      </P>
      <P>
        <strong>Waiver-wire activity.</strong> FAAB-spender vs hoarder. Speed of reaction to breakouts and injuries. Bench-clogging tendency.
      </P>
      <P>
        <strong>Head-to-head patterns.</strong> Who they beat, who they lose to, the matchups they consistently underperform in.
      </P>
      <P>
        <strong>Response to adversity.</strong> What happens after losing streaks. Whether they punt the season or push harder.
      </P>

      <H2>The Sunday Chronicle Manager DNA</H2>
      <P>
        <Link href="/" style={{ color: "var(--gold)" }}>The Sunday Chronicle</Link> generates a Manager DNA profile for every manager in a league once the full history is imported. Each profile sits in the manager&apos;s dossier alongside their career record, head-to-head stats, and championship history — so the playing style is contextualized by the actual outcomes.
      </P>
      <P>
        The profile is built from drafting patterns across every draft the manager has run, lineup decisions in every week, trade behavior across every transaction, and head-to-head splits. It updates as new seasons are added.
      </P>

      <H2>Why managers vs players is the right altitude</H2>
      <P>
        Most fantasy tools are player-centric — projections, rankings, ADP, news. That helps you make next-week decisions. Manager-centric analysis helps you understand the league as a social game: why certain managers always beat you, why others always lose to your style, where the actual edges live in your specific league.
      </P>
      <P>
        For dynasty and long-running redraft leagues this is especially valuable — the manager-vs-manager dimension compounds over seasons in a way single-game decisions don&apos;t.
      </P>

      <H2>How to set it up</H2>
      <P>
        Sign up at <Link href="/" style={{ color: "var(--gold)" }}>thesundaychronicle.app</Link>, paste your league ID, and Manager DNA generates automatically once the league finishes ingesting. No configuration. Updates weekly during the NFL season. Included in the free tier.
      </P>

      <H2>What to do with it</H2>
      <P>
        Read your rivals&apos; profiles before a head-to-head week — knowing a manager&apos;s lineup-tinkering tendency tells you whether they&apos;ll make a Saturday-night change. Use trade-behavior profiles to time trade pitches at the right managers. Use draft-style profiles to anticipate the room before your next draft.
      </P>
      <P>
        <Link href="/demo/" style={{ color: "var(--gold)" }}>Tour the demo</Link> to see Manager DNA inside a finished almanac.
      </P>
    </GuideShell>
  )
}
