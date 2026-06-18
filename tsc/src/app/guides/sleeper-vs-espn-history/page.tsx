import type { Metadata } from "next"
import Link from "next/link"
import { GuideShell, faqSchema, H2, P } from "../_layout"

export const metadata: Metadata = {
  title: "Sleeper vs ESPN — what each fantasy platform actually saves",
  description:
    "Comparing how Sleeper and ESPN handle fantasy football league history: how far back each goes, what data is exposed, how private leagues differ, and which platform makes archiving easier.",
  alternates: { canonical: "https://thesundaychronicle.app/guides/sleeper-vs-espn-history/" },
}

export default function Page() {
  const faq = faqSchema([
    {
      q: "Does Sleeper or ESPN save more fantasy league history?",
      a: "Both retain full history forever, but they expose it differently. Sleeper has a clean public API that returns every season via league_id linking. ESPN has a comprehensive API too but split between modern (2018+) and legacy (pre-2018) endpoints, and private leagues require cookie-based auth.",
    },
    {
      q: "Which platform makes it easier to archive league history?",
      a: "Sleeper. The API is public, well-documented, and walks back through previous_league_id automatically. ESPN requires more setup for private leagues (SWID + espn_s2 cookies that expire periodically) but covers more historical depth via its legacy archive.",
    },
    {
      q: "What data does Sleeper expose that ESPN doesn't?",
      a: "Sleeper exposes draft picks, all matchups, rosters, playoff brackets, and trade history through public endpoints with no authentication. ESPN exposes equivalents but with private-league friction and inconsistent pre-2018 playoff tagging (consolation games sometimes misidentified).",
    },
    {
      q: "Can I see ESPN history from 2010?",
      a: "Yes — ESPN's leagueHistory endpoint retains pre-2018 seasons. The Sunday Chronicle automatically falls back to this endpoint when modern API returns 404 for older years, so a 15-year ESPN league can be fully archived.",
    },
    {
      q: "Which is better for current-year sync?",
      a: "Roughly tied. Both APIs update in near-real-time after games complete. Sleeper edges ahead because its public API doesn't rate-limit aggressively; ESPN occasionally rate-limits private-league cookie auth.",
    },
  ])

  return (
    <GuideShell
      kicker="Comparison · Platform deep dive"
      title="Sleeper vs ESPN —"
      titleEm="what each platform saves."
      subtitle="Side-by-side: how far back you can see, what data you can pull, how private leagues differ, and where each falls short for long-term league archiving."
      faqJsonLd={faq}
    >
      <P>
        <strong>Bottom line:</strong> Sleeper exposes more league data more cleanly via a public API. ESPN retains more historical depth (back to the 2000s for some leagues) but requires cookie-based auth for private leagues and has split modern/legacy API surfaces. Both work well for archiving once you know the quirks. Below is the platform-by-platform breakdown.
      </P>

      <H2>Historical depth — how far back can you go?</H2>
      <P>
        <strong>Sleeper:</strong> Founded in 2017. Most leagues go back to 2018–2019. Every season is reachable via <code>previous_league_id</code> chain. No fall-off.
      </P>
      <P>
        <strong>ESPN:</strong> Has run fantasy football since 2003. Modern API covers 2018+ via <code>lm-api-reads.fantasy.espn.com</code>; pre-2018 seasons live in a legacy <code>leagueHistory</code> archive at a different endpoint. Both are accessible, but the legacy API has gaps (some seasons missing <code>playoffTierType</code>, some missing final rank assignments).
      </P>
      <P>
        <strong>Verdict:</strong> ESPN wins on depth (15+ year leagues are possible). Sleeper wins on consistency (every season is structured the same way).
      </P>

      <H2>API surface — what data is exposed</H2>
      <P>
        <strong>Sleeper:</strong> Public, unauthenticated. League settings, users, rosters, matchups (by week), playoffs bracket, drafts, draft picks, transactions. Returns clean JSON. Zero rate limit issues for our use case.
      </P>
      <P>
        <strong>ESPN:</strong> Similar coverage — settings, members, schedule, scoring, drafts, transactions. Modern endpoint returns rich data including positional matchups and player IDs. Legacy endpoint returns less detail and occasionally misidentifies consolation games as championship-bracket.
      </P>
      <P>
        <strong>Verdict:</strong> Sleeper is friendlier for tooling. ESPN&apos;s data is comparable in detail but requires more handling.
      </P>

      <H2>Authentication — public vs private leagues</H2>
      <P>
        <strong>Sleeper:</strong> Public by default. League ID is enough to read any data. No auth required for archiving.
      </P>
      <P>
        <strong>ESPN:</strong> Public leagues work with just the league ID. Private leagues require two browser cookies (<code>SWID</code> and <code>espn_s2</code>) that you grab from a logged-in ESPN tab. The cookies expire every few months and need refreshing.
      </P>
      <P>
        <strong>Verdict:</strong> Sleeper is dramatically simpler. ESPN&apos;s cookie auth is workable but adds friction.
      </P>

      <H2>Live-season sync</H2>
      <P>
        <strong>Sleeper:</strong> Matchup data updates within minutes of games completing. Standings refresh during the week. Sleeper&apos;s API is fast and rarely rate-limits.
      </P>
      <P>
        <strong>ESPN:</strong> Similar speed. Modern API is reliable. Private-league cookies occasionally rate-limit if you sync too aggressively, but a weekly cron is fine.
      </P>
      <P>
        <strong>Verdict:</strong> Tied for practical purposes.
      </P>

      <H2>Drafts</H2>
      <P>
        <strong>Sleeper:</strong> Draft picks come with round, pick number, roster ID, player ID, and timestamp. Player names need a separate API call but Sleeper exposes that too.
      </P>
      <P>
        <strong>ESPN:</strong> Drafts available via the same league endpoint with full pick history. Player names resolved via <code>kona_player_info</code> batch lookup.
      </P>
      <P>
        <strong>Verdict:</strong> Both fully exposed. Sleeper is easier to parse; ESPN is more verbose but equally complete.
      </P>

      <H2>Playoff bracket detection</H2>
      <P>
        <strong>Sleeper:</strong> Winners bracket exposed as a separate endpoint with placement (<code>p</code>) values that distinguish championship-bracket games from consolation. Clean.
      </P>
      <P>
        <strong>ESPN:</strong> Modern API tags games with <code>playoffTierType</code> (WINNERS_BRACKET, LOSERS_CONSOLATION_LADDER, etc). Older seasons sometimes miss this tag, requiring a seed-based fallback to identify real playoff games vs placement ladders.
      </P>
      <P>
        <strong>Verdict:</strong> Sleeper&apos;s is cleaner. ESPN&apos;s requires more parsing logic but works once handled.
      </P>

      <H2>If your league has lived on both</H2>
      <P>
        Many long-running leagues started on ESPN (2008–2015) and migrated to Sleeper (2017–present). You don&apos;t have to pick one — see our <Link href="/guides/migrate-fantasy-league/" style={{ color: "var(--gold)" }}>migration guide</Link>. The Sunday Chronicle supports multiple sources per league archive, so an ESPN history + Sleeper present can live under one almanac.
      </P>

      <H2>Both work. Which should you archive first?</H2>
      <P>
        If your league has a longer ESPN tail, start there — the legacy archive is the harder data to recover later. Sleeper is well-documented and stable; you can always add it as a second source. The Sunday Chronicle handles either as the primary or both together.
      </P>
    </GuideShell>
  )
}
