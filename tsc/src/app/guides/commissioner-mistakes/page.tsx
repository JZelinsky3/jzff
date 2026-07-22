import type { Metadata } from "next"
import Link from "next/link"
import { GuideShell, faqSchema, H2, P } from "../_layout"

export const metadata: Metadata = {
  title: "5 mistakes fantasy commissioners make with league history",
  description:
    "Practical lessons from running long-standing fantasy football leagues, and the recoverable mistakes most commissioners make with documentation, platforms, and league memory.",
  alternates: { canonical: "https://thesundaychronicle.app/guides/commissioner-mistakes/" },
}

export default function Page() {
  const faq = faqSchema([
    {
      q: "What's the biggest mistake fantasy commissioners make?",
      a: "Treating the platform UI as the league's permanent record. Platforms are designed for the current season and routinely make old data hard to find. By year five, the data you assumed would always be there often isn't.",
    },
    {
      q: "Should I keep a backup of my fantasy league outside the platform?",
      a: "Yes. Platforms get sold, change pricing, lose features, or migrate APIs. Even a basic export of season-by-season standings + champions outside the platform protects you from any single platform's decisions.",
    },
    {
      q: "How do I handle commissioner handoffs?",
      a: "The commissioner role is administrative; the league's history is institutional. Decouple them by archiving the league's history into a tool the next commissioner can take over without rebuilding documentation. A public almanac URL is more durable than a Google Sheet maintained by the current commish.",
    },
  ])

  return (
    <GuideShell
      kicker="Editorial · Hard-earned lessons"
      title="5 mistakes commissioners make"
      titleEm="with league history."
      subtitle="Practical lessons from running and archiving long-standing fantasy football leagues. Each mistake is recoverable if you catch it early."
      breadcrumbSlug="commissioner-mistakes"
      datePublished="2026-01-15"
      dateModified="2026-06-22"
      faqJsonLd={faq}
    >
      <P>
        <strong>The setup:</strong> running a long-term fantasy league is more administrative work than the average commissioner signs up for, and most of that work is invisible. The visible part (draft, weekly check-ins, payouts) gets done. The invisible part (documenting what happened) quietly accumulates as debt until someone notices it&apos;s gone. Here are the five most common ways that goes wrong.
      </P>

      <H2>1. Assuming the platform will always be there</H2>
      <P>
        Yahoo Fantasy was the default for a decade. Then ESPN. Now Sleeper. Each transition stranded data for leagues that migrated. The next platform shift is already happening, and the league that&apos;s been on ESPN for 12 years assumes ESPN will still let you see 2014 standings in 2030. Maybe it will. Maybe ESPN sells the fantasy business or sunsets the legacy API or changes pricing on private league access.
      </P>
      <P>
        <strong>The fix:</strong> have a copy of your league&apos;s history outside the platform. Doesn&apos;t matter if it&apos;s a spreadsheet, a public almanac, or printed banners on the basement wall. Just don&apos;t let one company&apos;s product decisions be the only thing standing between your league and amnesia.
      </P>

      <H2>2. Letting the group chat be the history</H2>
      <P>
        Screenshots of standings in iMessage, gifs of bad teams in Discord, a roast thread that lives in someone&apos;s phone. Works for 2-3 years. Then the iPhone changes, the Discord server gets nuked, the roast thread gets muted. By year five the institutional knowledge is "whoever has the longest memory."
      </P>
      <P>
        <strong>The fix:</strong> the group chat is the social layer. It&apos;s fine for trash talk. But the <em>record</em> (champions, drafts, standings, head-to-head) needs to live somewhere durable. Even a yearly screenshot dropped in a shared Google Drive folder is better than nothing.
      </P>

      <H2>3. Skipping the commissioner handoff</H2>
      <P>
        Most commissioner transitions happen casually. "Hey Joe, I&apos;m stepping back, you want to run it?" Joe says yes, the platform commissioner role gets transferred, and that&apos;s the entire handoff. The history of the league lives in the previous commissioner&apos;s head: which year added a co-commissioner, when the playoff format changed, who held the all-time high score before 2019.
      </P>
      <P>
        <strong>The fix:</strong> separate the commissioner role from the league&apos;s memory. The role is administrative: pay schedule, lineup deadlines, dispute resolution. The memory should be in a system anyone can read without asking the previous commish. A permanent URL with every season laid out is the simplest version of this.
      </P>

      <H2>4. Manually maintaining a "running stats" spreadsheet</H2>
      <P>
        Some commissioners try to solve the history problem with a spreadsheet. Year 1, it&apos;s pristine. Year 2, it&apos;s mostly updated. Year 3, it&apos;s missing 2-3 weeks. Year 4, it&apos;s abandoned.
      </P>
      <P>
        This isn&apos;t a discipline problem. It&apos;s a structural one. The data needed to update the spreadsheet already exists in the platform&apos;s API. The work of pulling it into a spreadsheet manually is friction that compounds every week of every season. Most commissioners eventually decide they have better things to do than retype matchup scores.
      </P>
      <P>
        <strong>The fix:</strong> automate the data extraction. <Link href="/" style={{ color: "var(--gold)" }}>The Sunday Chronicle</Link> reads the platform API directly so you never have to retype a score. Spend your commissioner time on the things that <em>require</em> a human (resolving disputes, planning the draft, writing the league recap).
      </P>

      <H2>5. Treating "the public site" as optional</H2>
      <P>
        Some commissioners archive their history privately, for their own reference, for the group chat. But the value of league history compounds when it&apos;s <em>public</em>. League-mates share it with friends. Old members who left still want to see their stats. New members can absorb a decade of context in five minutes. Recruiting replacements for a 12-year-old league is dramatically easier when you have a URL that says "this is what you&apos;re joining."
      </P>
      <P>
        <strong>The fix:</strong> publish the archive. Even if only your league reads it, the discipline of "this needs to be presentable" forces the documentation to actually exist instead of being a vague intention.
      </P>

      <H2>One closing thought</H2>
      <P>
        Most of these mistakes are recoverable. The data still exists in the platforms&apos; APIs. The institutional knowledge still exists in the longest-tenured members&apos; heads. But every year you don&apos;t solidify it is a year of risk. Long-running fantasy leagues are unusual social structures: they survive friend groups dissolving, careers changing, kids being born, marriages happening. The history is the throughline. Take care of it.
      </P>
    </GuideShell>
  )
}
