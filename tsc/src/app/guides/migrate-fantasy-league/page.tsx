import type { Metadata } from "next"
import Link from "next/link"
import { GuideShell, faqSchema, H2, P } from "../_layout"

export const metadata: Metadata = {
  title: "Moving your fantasy league between platforms — keeping the history",
  description:
    "When a fantasy football league moves from Yahoo to ESPN, ESPN to Sleeper, or anywhere else, the historical data typically gets stranded. Here's how to preserve every season under one unified archive.",
  alternates: { canonical: "https://jzff.online/guides/migrate-fantasy-league/" },
}

export default function Page() {
  const faq = faqSchema([
    {
      q: "Can I keep my fantasy football league history when changing platforms?",
      a: "Yes, but you need a tool that imports from each platform separately and stitches them together. The Sunday Chronicle supports multiple sources per league — paste your old Yahoo/ESPN ID for past seasons + your new Sleeper ID for current seasons, and we render them as one unified almanac.",
    },
    {
      q: "What if my league started on Yahoo and moved to ESPN, then to Sleeper?",
      a: "Add each platform as a separate source on the league. Sleeper handles 2020+ via its API, ESPN handles 2015-2019 via its API + legacy archive, and Yahoo support is coming when their developer portal reopens. Each source contributes its years; the almanac unifies them.",
    },
    {
      q: "Will the manager identities match across platforms?",
      a: "Not automatically — each platform issues its own user IDs. After sync, the commissioner reviews a 'Members' page that lists every platform identity. You merge identities of the same real person (e.g., 'Joe E.' on Yahoo + 'JoeEnos' on Sleeper = one profile), and their stats roll up into one career.",
    },
    {
      q: "Can I bring in NFL.com league history?",
      a: "Yes for historical seasons. NFL.com hasn't reopened current-year leagues this cycle, so live support is paused, but every past season you played there can be scraped and joined to a newer Sleeper/ESPN source.",
    },
    {
      q: "What about leagues that moved to a platform we don't support yet?",
      a: "Yahoo is in active development (blocked on Yahoo developer portal access). If your league lived elsewhere (CBS, MyFantasyLeague, FleaFlicker, etc), email us at jzffgames@gmail.com — we maintain a wishlist and prioritize based on demand.",
    },
  ])

  return (
    <GuideShell
      kicker="Migration · Preserve every season"
      title="Moving your league between platforms —"
      titleEm="keeping the history."
      subtitle="Yahoo → ESPN → Sleeper. When commissioners migrate, league history typically dies. Here's how to keep every season alive under one unified archive."
      faqJsonLd={faq}
    >
      <P>
        <strong>Short version:</strong> The Sunday Chronicle treats each platform as a separate <em>source</em> on a single league archive. Past seasons from Yahoo + current seasons from Sleeper can both live under one almanac. After import, you merge cross-platform manager identities so each real person&apos;s stats roll up into a single career line.
      </P>

      <H2>Why league history dies when you migrate</H2>
      <P>
        Fantasy platforms don&apos;t talk to each other. When a league moves from Yahoo to ESPN, the new platform starts at year zero — no historical champions, no past drafts, no head-to-heads, nothing carried over. The old platform&apos;s data is technically still there, but increasingly hard to access: Yahoo deletes leagues after inactivity, ESPN buries pre-2018 seasons in a legacy archive, NFL.com periodically takes leagues offline entirely.
      </P>
      <P>
        Most commissioners give up and start tracking the league&apos;s history in a Google Sheet. A year later, no one updates the sheet. Two years later, no one remembers who won 2019. The league&apos;s story dies.
      </P>

      <H2>The "multiple sources" model</H2>
      <P>
        On The Sunday Chronicle, a single league can have multiple platform sources attached. Each source contributes the years it covers:
      </P>
      <ul style={{ paddingLeft: "1.4rem", marginBottom: "1.25rem" }}>
        <li><strong>Yahoo source (2015–2018):</strong> imports old champions, drafts, matchups</li>
        <li><strong>ESPN source (2019–2022):</strong> imports the middle era</li>
        <li><strong>Sleeper source (2023–present):</strong> imports current + auto-syncs weekly</li>
      </ul>
      <P>
        The public almanac at <code>jzff.online/leagues/your-league/</code> shows all 10 seasons as one continuous history. Career standings, head-to-head records, and rivalries are computed across all three eras.
      </P>

      <H2>Step-by-step migration</H2>
      <ol style={{ paddingLeft: "1.4rem", marginBottom: "1.25rem" }}>
        <li><strong>Create the league archive.</strong> Use your most recent platform (typically Sleeper or ESPN) as the primary source. Paste that league ID at signup.</li>
        <li><strong>Sync the primary source.</strong> Pulls every season on that platform.</li>
        <li><strong>Add additional sources.</strong> Open your league&apos;s admin page → Sources → Add. Paste your old league ID from a different platform. Sync that source.</li>
        <li><strong>Merge identities.</strong> Open the Members page. Each real person now appears once per platform they played on. Click two rows, click Merge — pick the canonical name. Repeat for each multi-platform commissioner.</li>
        <li><strong>Publish.</strong> Toggle the public almanac on. Share the URL with your league.</li>
      </ol>

      <H2>What gets unified automatically</H2>
      <P>
        Once identities are merged, the following roll up across platforms:
      </P>
      <ul style={{ paddingLeft: "1.4rem", marginBottom: "1.25rem" }}>
        <li>Career wins, losses, and points-for / against</li>
        <li>Championship roll (every title across every platform era)</li>
        <li>Head-to-head records (e.g., your career record vs Joe spans all platforms)</li>
        <li>Top single-week scores, biggest blowouts, longest streaks</li>
        <li>Commissioner-curated rivalries (you can pick a feud that spans multiple eras)</li>
      </ul>

      <H2>What doesn&apos;t carry over</H2>
      <P>
        Some platforms don&apos;t expose data via API — chat logs, trade discussions, sideline notes, etc. Those are lost when a platform is abandoned. The Sunday Chronicle archives the <em>game record</em>: standings, matchups, drafts, champions, manager performance. The social context lives in your group chat.
      </P>

      <H2>FAQ</H2>
      <P><strong>What if I never had an account on the old platform?</strong> The previous commissioner&apos;s league ID is enough (for public leagues). Ask them to share it.</P>
      <P><strong>How much does multi-source cost?</strong> Multiple sources on one league count as one league — Rookie tier ($5/mo) covers it.</P>
      <P><strong>Can I add a source years later?</strong> Yes — sources can be added anytime. The almanac re-renders with the new history merged in.</P>
    </GuideShell>
  )
}
