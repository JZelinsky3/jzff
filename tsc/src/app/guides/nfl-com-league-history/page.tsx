import type { Metadata } from "next"
import Link from "next/link"
import { GuideShell, faqSchema, howToSchema, H2, P } from "../_layout"

export const metadata: Metadata = {
  title: "How to archive your NFL.com fantasy league history",
  description:
    "Pull every season your NFL.com fantasy football league has ever played into a clean public almanac — champions, drafts, head-to-head records, rivalries — without screenshots or spreadsheets.",
  alternates: { canonical: "https://thesundaychronicle.app/guides/nfl-com-league-history/" },
}

export default function Page() {
  const faq = faqSchema([
    {
      q: "Can I archive an NFL.com fantasy league's full history?",
      a: "Yes. Paste your NFL.com league ID into The Sunday Chronicle at thesundaychronicle.app and we walk every season the league has played on NFL.com — pulling champions, drafts, weekly matchups, and standings into a single public almanac. NFL.com exposes league history publicly behind the league ID, so no sign-in is required.",
    },
    {
      q: "How far back can NFL.com league history go?",
      a: "NFL.com retains league history indefinitely for leagues that haven't been deleted. Many leagues from the early-to-mid 2000s still have their full season archives intact and can be fully recovered.",
    },
    {
      q: "Where do I find my NFL.com league ID?",
      a: "Open the league in a browser. The URL looks like fantasy.nfl.com/league/1234567 — the digits at the end are your league ID. In the NFL Fantasy mobile app, tap the league name and the league ID is visible in the share link.",
    },
    {
      q: "Do I need to be the commissioner to archive an NFL.com league?",
      a: "No. NFL.com league data is publicly readable by anyone with the league ID, so any current or former member can pull the archive. Only the commissioner can publish it to a public almanac URL.",
    },
    {
      q: "What about leagues that moved from NFL.com to another platform?",
      a: "Connect multiple sources to a single archive and we stitch the eras together. See the migrate fantasy league guide for the full workflow — useful for long-running leagues that started on NFL.com or Yahoo and migrated to Sleeper or ESPN.",
    },
    {
      q: "Is there a free trial?",
      a: "Yes — every plan includes a 7-day free trial. Cancel anytime before the trial ends and you won't be charged.",
    },
  ])

  const howTo = howToSchema({
    name: "How to archive NFL.com fantasy football league history",
    description:
      "Pull every season of an NFL.com fantasy football league into a single public almanac using The Sunday Chronicle. No sign-in required — NFL.com exposes league data publicly.",
    totalTime: "PT3M",
    steps: [
      {
        name: "Find your NFL.com league ID",
        text: "Open your league on fantasy.nfl.com. The URL contains the league ID — usually a 6–8 digit number after /league/ in the path.",
      },
      {
        name: "Sign up at The Sunday Chronicle",
        text: "Go to thesundaychronicle.app and create an account. Free tier covers one league forever.",
        url: "https://thesundaychronicle.app/login?mode=signup",
      },
      {
        name: "Paste your NFL.com league ID",
        text: "On the new-league screen, select NFL.com and paste your league ID. NFL.com exposes league data publicly, so no authentication is required.",
      },
      {
        name: "Wait for the full-history walk",
        text: "The Sunday Chronicle pulls every season your NFL.com league has played. Typical import time: 1–2 minutes.",
      },
      {
        name: "Publish your public almanac",
        text: "Once import finishes, hit Publish. The almanac becomes available at thesundaychronicle.app/leagues/your-slug/.",
      },
    ],
  })

  return (
    <GuideShell
      kicker="NFL.com · Full history walk"
      title="How to archive your"
      titleEm="NFL.com league history."
      subtitle="Every season your NFL.com fantasy football league has played — champions, drafts, head-to-head records, rivalries — pulled from a single league ID. NFL.com's public league data means no sign-in, no exports."
      breadcrumbSlug="nfl-com-league-history"
      datePublished="2026-01-15"
      dateModified="2026-06-22"
      faqJsonLd={faq}
      howToJsonLd={howTo}
    >
      <P>
        <strong>Short version:</strong> paste your NFL.com league ID into The Sunday Chronicle at{" "}
        <Link href="/" style={{ color: "var(--gold)" }}>thesundaychronicle.app</Link>. We walk every season your league has played on NFL.com and turn the whole history into a public almanac — champions, drafts, every matchup, head-to-head records, and rivalries. No sign-in needed; NFL.com exposes league data publicly behind the league ID.
      </P>

      <H2>Where to find your NFL.com league ID</H2>
      <P>
        Open the league in a browser. The URL looks like:
      </P>
      <P>
        <code style={{ background: "var(--ink-soft)", padding: ".15rem .45rem", borderRadius: "2px", fontSize: ".85rem" }}>
          fantasy.nfl.com/league/<strong style={{ color: "var(--gold)" }}>1234567</strong>
        </code>
      </P>
      <P>
        The digits at the end are your league ID — typically 7 digits for newer leagues, sometimes shorter for older ones. In the NFL Fantasy mobile app, tap the league name to open the share menu and the league ID is in the share link.
      </P>

      <H2>Why NFL.com is easy to archive</H2>
      <P>
        Unlike Yahoo (which gates league reads behind OAuth), NFL.com&apos;s league data is publicly readable by anyone who has the league ID. That means the import is as light as Sleeper&apos;s — paste the ID, the rest is automatic. You don&apos;t need to be the commissioner. You don&apos;t need to be a current member. The only thing the commissioner&apos;s account is needed for is publishing the almanac to a public URL after the import finishes.
      </P>

      <H2>What you&apos;ll see in the almanac</H2>
      <P>
        Once the import finishes, the public almanac at{" "}
        <code style={{ background: "var(--ink-soft)", padding: ".1rem .35rem", borderRadius: "2px" }}>
          thesundaychronicle.app/leagues/your-league/
        </code>{" "}
        gives every league member a single URL to bookmark — with:
      </P>
      <P>
        <strong>Champion rolls</strong> — every season, every title game, every runner-up.<br />
        <strong>Standings archives</strong> — final standings for every year the league has run.<br />
        <strong>Draft boards</strong> — round by round, every year, every pick.<br />
        <strong>Manager dossiers</strong> — career records, championships, head-to-head against every rival.<br />
        <strong>Rivalries</strong> — hand-pick the feuds that deserve their own page, with running scoreboards and meeting logs.
      </P>

      <H2>Migrating between NFL.com and other platforms</H2>
      <P>
        Many long-running leagues started on NFL.com or Yahoo and migrated to Sleeper or ESPN over the years. You can connect multiple sources to a single archive and we&apos;ll stitch the eras together by manager identity. See <Link href="/guides/migrate-fantasy-league/" style={{ color: "var(--gold)" }}>migrating between platforms</Link> for the full workflow.
      </P>
    </GuideShell>
  )
}
