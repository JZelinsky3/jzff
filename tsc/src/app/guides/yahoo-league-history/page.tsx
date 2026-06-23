import type { Metadata } from "next"
import Link from "next/link"
import { GuideShell, faqSchema, howToSchema, H2, P } from "../_layout"

export const metadata: Metadata = {
  title: "How to archive your Yahoo fantasy league history",
  description:
    "Pull every season your Yahoo fantasy football league has ever played into a clean public almanac — champions, drafts, head-to-head records, rivalries — without screenshots or spreadsheets.",
  alternates: { canonical: "https://thesundaychronicle.app/guides/yahoo-league-history/" },
}

export default function Page() {
  const faq = faqSchema([
    {
      q: "Can I archive a Yahoo fantasy football league's full history?",
      a: "Yes. Connect your Yahoo account to The Sunday Chronicle at thesundaychronicle.app and we walk every season the league has played in Yahoo — pulling champions, drafts, weekly matchups, and standings into a single public almanac. Yahoo support requires a one-time OAuth handshake; after that the import runs the same way as Sleeper or ESPN.",
    },
    {
      q: "Why does Yahoo need OAuth when Sleeper and ESPN don't?",
      a: "Yahoo's fantasy API requires an authenticated app token to read your league data — even for the commissioner who owns the league. Sleeper and NFL.com expose read-only league data publicly behind a league ID, so they don't need a sign-in step.",
    },
    {
      q: "How far back can Yahoo league history go?",
      a: "As long as the league has been continuous in Yahoo (rolled over each season under the same league ID), every season is fetchable. Yahoo retains league history indefinitely for leagues that haven't been deleted — leagues from the mid-2000s are commonly recoverable.",
    },
    {
      q: "Where do I find my Yahoo league ID?",
      a: "Open the league in a browser. The URL looks like football.fantasysports.yahoo.com/f1/123456 — the digits at the end are your league ID. In the Yahoo Fantasy mobile app, tap the league name and the ID is visible in the share link.",
    },
    {
      q: "Do I need to be the commissioner to archive a Yahoo league?",
      a: "You need to be a current or former member of the league — the OAuth grant is tied to your Yahoo account's access. Commissioners can publish the almanac to a public URL; non-commish members can pull the archive privately for their own reference.",
    },
    {
      q: "Is there a free trial?",
      a: "Yes — every plan includes a 7-day free trial. Cancel anytime before the trial ends and you won't be charged.",
    },
  ])

  const howTo = howToSchema({
    name: "How to archive Yahoo fantasy football league history",
    description:
      "Pull every season of a Yahoo fantasy football league into a single public almanac using The Sunday Chronicle's Yahoo OAuth flow.",
    totalTime: "PT5M",
    steps: [
      {
        name: "Sign up at The Sunday Chronicle",
        text: "Go to thesundaychronicle.app and create an account. Free tier covers one league forever.",
        url: "https://thesundaychronicle.app/login?mode=signup",
      },
      {
        name: "Start a new league and pick Yahoo",
        text: "On the new-league screen, select Yahoo. You'll be redirected to Yahoo to authorize read access — a one-time OAuth handshake.",
      },
      {
        name: "Authorize via Yahoo sign-in",
        text: "Sign in with the Yahoo account that owns the league. Grant the requested read scopes. Yahoo redirects you back to The Sunday Chronicle automatically.",
      },
      {
        name: "Pick the league to import",
        text: "Yahoo returns a list of every league your account owns or plays in. Pick the one to archive.",
      },
      {
        name: "Wait for the full-history walk",
        text: "Yahoo's API returns every season the league has played. Typical import time: 1–3 minutes depending on league age.",
      },
      {
        name: "Publish your public almanac",
        text: "Once import finishes, hit Publish. The almanac becomes available at thesundaychronicle.app/leagues/your-slug/.",
      },
    ],
  })

  return (
    <GuideShell
      kicker="Yahoo · Full history walk"
      title="How to archive your"
      titleEm="Yahoo league history."
      subtitle="Every season your Yahoo fantasy football league has played (champions, drafts, head-to-head records, rivalries) pulled into a public almanac after a one-time Yahoo sign-in."
      breadcrumbSlug="yahoo-league-history"
      datePublished="2026-01-15"
      dateModified="2026-06-22"
      faqJsonLd={faq}
      howToJsonLd={howTo}
    >
      <P>
        <strong>Short version:</strong> sign in with Yahoo on The Sunday Chronicle at{" "}
        <Link href="/" style={{ color: "var(--gold)" }}>thesundaychronicle.app</Link>, paste your league ID, and we walk every season the league has played in Yahoo and turn the whole history into a public almanac — champions, drafts, every matchup, head-to-head records, and rivalries. The Yahoo step is a standard OAuth handshake; after the first run, refreshes are automatic.
      </P>

      <H2>Why Yahoo needs a sign-in</H2>
      <P>
        Yahoo&apos;s fantasy API requires an authenticated app token for any league data read — even your own commissioner data. That&apos;s a Yahoo policy, not a Sunday Chronicle one. Sleeper and NFL.com expose league data publicly behind the league ID, so those imports skip the auth step. ESPN&apos;s newer private leagues sit somewhere in the middle. With Yahoo, the trade-off is one extra click at setup and then it runs the same as everyone else.
      </P>

      <H2>Where to find your Yahoo league ID</H2>
      <P>
        Open the league in a browser. The URL looks like:
      </P>
      <P>
        <code style={{ background: "var(--ink-soft)", padding: ".15rem .45rem", borderRadius: "2px", fontSize: ".85rem" }}>
          football.fantasysports.yahoo.com/f1/<strong style={{ color: "var(--gold)" }}>123456</strong>
        </code>
      </P>
      <P>
        The digits at the end are your league ID — typically 5 or 6 digits for older leagues, longer for newer ones. In the Yahoo Fantasy mobile app, tap the league name and the ID is visible in the share link.
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

      <H2>Moving between platforms?</H2>
      <P>
        If your league has bounced between Yahoo, ESPN, and Sleeper across seasons, you can connect multiple sources to a single archive and we&apos;ll stitch the eras together. See <Link href="/guides/migrate-fantasy-league/" style={{ color: "var(--gold)" }}>migrating between platforms</Link> for the full workflow.
      </P>
    </GuideShell>
  )
}
