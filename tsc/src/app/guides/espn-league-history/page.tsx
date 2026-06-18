import type { Metadata } from "next"
import Link from "next/link"
import { GuideShell, faqSchema, H2, P } from "../_layout"

export const metadata: Metadata = {
  title: "How to see your ESPN league's full history",
  description:
    "Pull every season of your ESPN fantasy football league into one public almanac. Works for public AND private leagues (with a quick cookie paste). 10+ year leagues fully supported.",
  alternates: { canonical: "https://thesundaychronicle.app/guides/espn-league-history/" },
}

export default function Page() {
  const faq = faqSchema([
    {
      q: "How can I see ESPN fantasy league history from years ago?",
      a: "ESPN keeps every season your league has ever played, but their UI makes it painful to browse. The Sunday Chronicle reads ESPN's league API directly and walks back through every season — including pre-2018 archives where ESPN switched to leagueHistory endpoints. Paste your league ID at thesundaychronicle.app to get a unified public almanac.",
    },
    {
      q: "Can The Sunday Chronicle pull data from an ESPN private league?",
      a: "Yes — private leagues require pasting two cookies (SWID and espn_s2) from a logged-in ESPN tab. We store them encrypted and use them only for that league's API calls. Cookies expire periodically; you'll get a prompt to refresh them when that happens.",
    },
    {
      q: "How far back can you pull ESPN league history?",
      a: "All the way to the league's founding season. ESPN serves modern seasons via lm-api-reads.fantasy.espn.com and pre-2018 seasons via the leagueHistory archive — both supported automatically.",
    },
    {
      q: "Where do I find my ESPN league ID?",
      a: "Open your league. The URL contains: fantasy.espn.com/football/league?leagueId=47847 — that number is your ID. In the ESPN app, tap the gear icon → Share League → the URL contains the same leagueId parameter.",
    },
    {
      q: "Where do I get the SWID and espn_s2 cookies for a private league?",
      a: "Log into ESPN in a desktop browser. Open DevTools → Application tab → Cookies → fantasy.espn.com. Copy the values of SWID and espn_s2 cookies (espn_s2 is a long opaque string). Paste both into the league setup screen on The Sunday Chronicle.",
    },
  ])

  return (
    <GuideShell
      kicker="ESPN · Public + private leagues"
      title="How to see your"
      titleEm="ESPN league's full history."
      subtitle="ESPN saves everything but buries it. Pull every season your league has ever played — even private leagues — into a single public almanac."
      faqJsonLd={faq}
    >
      <P>
        <strong>Short version:</strong> The Sunday Chronicle reads ESPN&apos;s fantasy API and walks back through every season your league has existed, including pre-2018 archives. Public leagues only need the league ID. Private leagues need two browser cookies (SWID and espn_s2). The result is a unified almanac at <code>thesundaychronicle.app/leagues/your-league/</code> with every champion, draft, matchup, and head-to-head record.
      </P>

      <H2>Find your ESPN league ID</H2>
      <P>
        Open your league in a browser. The URL looks like:
      </P>
      <P>
        <code style={{ background: "var(--ink-soft)", padding: ".2rem .5rem", borderRadius: "2px" }}>fantasy.espn.com/football/league?leagueId=<em style={{ color: "var(--gold)" }}>47847</em></code>
      </P>
      <P>
        That number is your league ID. In the ESPN Fantasy app, tap the gear icon → <strong>Share League</strong> → the URL has the same parameter.
      </P>

      <H2>Public leagues: just paste the ID</H2>
      <P>
        If your league is set to public on ESPN, that&apos;s the whole setup. The Sunday Chronicle calls ESPN&apos;s API directly with your league ID and walks every season. Initial sync for a 10-year league takes about 90 seconds.
      </P>

      <H2>Private leagues: two cookies, paste once</H2>
      <P>
        Private ESPN leagues require authentication. ESPN doesn&apos;t expose user passwords through its API — instead, it uses two session cookies that your browser holds when you&apos;re logged in: <strong>SWID</strong> and <strong>espn_s2</strong>.
      </P>
      <P>
        <strong>Easy mode (recommended):</strong> use our one-click bookmarklet at{' '}
        <Link href="/tools/espn-cookies/" style={{ color: "var(--gold)" }}>thesundaychronicle.app/tools/espn-cookies</Link>.
        Drag it to your bookmarks bar once; from then on, one click on a logged-in
        fantasy.espn.com tab copies both cookies to your clipboard. No DevTools, no
        third-party extension, ~5 seconds.
      </P>
      <P>
        <strong>Manual fallback,</strong> if you&apos;d rather:
      </P>
      <ol style={{ paddingLeft: "1.4rem", marginBottom: "1.25rem" }}>
        <li>Open ESPN Fantasy in a desktop browser, signed in to your league.</li>
        <li>Open DevTools (Cmd+Option+I on Mac, Ctrl+Shift+I on Windows).</li>
        <li>Application tab → Cookies → fantasy.espn.com.</li>
        <li>Copy the value of <code>SWID</code> (looks like <code>{`{ABC12345-DEF6-7890-...}`}</code>).</li>
        <li>Copy the value of <code>espn_s2</code> (a long opaque token).</li>
        <li>Paste both into the league setup screen on The Sunday Chronicle.</li>
      </ol>
      <P>
        Cookies expire every few months. When that happens, the sync will tell you to refresh them — same DevTools paste, takes 30 seconds.
      </P>

      <H2>Pre-2018 seasons (ESPN&apos;s legacy archive)</H2>
      <P>
        ESPN switched fantasy backends in 2018. Modern seasons live at <code>lm-api-reads.fantasy.espn.com</code>; pre-2018 seasons live at a separate <code>leagueHistory</code> endpoint. The Sunday Chronicle handles both transparently — if your league started in 2012, we&apos;ll pull all 13 seasons into the same archive.
      </P>

      <H2>What about consolation games and old playoff brackets?</H2>
      <P>
        ESPN tagged consolation/placement games inconsistently over the years (some seasons mark them properly, some don&apos;t). The Sunday Chronicle filters them out via both ESPN&apos;s playoff-tier tags and a seed-based fallback, so career stats only count actual championship-bracket playoff games.
      </P>

      <H2>FAQ</H2>
      <P><strong>Will my league members see the cookies?</strong> No — cookies are stored server-side, encrypted, and never reach the public almanac.</P>
      <P><strong>What if I forget to refresh expired cookies?</strong> The sync logs a warning and the public almanac keeps showing the last successful sync&apos;s data. New seasons just won&apos;t appear until you refresh.</P>
      <P><strong>Can I combine an ESPN history with a Sleeper or NFL.com source?</strong> Yes — see our <Link href="/guides/migrate-fantasy-league/" style={{ color: "var(--gold)" }}>migration guide</Link>.</P>
    </GuideShell>
  )
}
