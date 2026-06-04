import type { Metadata } from "next"
import Link from "next/link"
import { SiteFooter } from "@/components/SiteFooter"

export const metadata: Metadata = {
  title: "Table of Contents — every page in The Sunday Chronicle",
  description:
    "Every page, tab, and section across the league management dashboard and the public almanac.",
  alternates: { canonical: "https://jzff.online/toc/" },
}

export default function TocPage() {
  return (
    <main>
      <nav className="nav">
        <Link href="/" className="dc-nav-icon" aria-label="Back">
          <svg viewBox="0 0 8 14" width="10" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 1 1 7 7 13" />
          </svg>
        </Link>
        <div className="nav-center">
          <div className="nav-kicker">Reference · Table of Contents</div>
          <div className="nav-title">Every <em>page.</em></div>
        </div>
        <span className="dc-nav-icon" aria-hidden style={{ visibility: "hidden" }} />
      </nav>

      <div
        style={{
          maxWidth: "780px",
          margin: "0 auto",
          padding: "2.5rem 1.5rem 4rem",
          color: "var(--cream-soft)",
          fontFamily: "var(--serif)",
          fontSize: "1.02rem",
          lineHeight: 1.65,
        }}
      >
        <p style={{ opacity: 0.7, fontSize: ".88rem", marginBottom: "2rem" }}>
          Every page you can click to in The Sunday Chronicle. URLs use{" "}
          <code>{`{slug}`}</code> as a placeholder for the league&apos;s slug.
        </p>

        {/* ════════════ LEAGUE SETUP ════════════ */}
        <H1>League Setup</H1>
        <Meta>/league/{`{slug}`}/* — commissioner-only management side</Meta>

        <Item>League Overview — <Path>/league/{`{slug}`}</Path></Item>
        <Sub>hero with season/manager/matchup totals, the onboarding checklist, the Public Almanac billboard, the Sync &amp; Publish row, and (Jake-only) the AI Trade Grader card</Sub>

        <Item>Sources — <Path>/league/{`{slug}`}/sources</Path></Item>
        <Sub>add &amp; manage Sleeper, ESPN, NFL.com, and Yahoo connections</Sub>

        <Item>Setup &amp; Review — <Path>/league/{`{slug}`}/setup</Path></Item>
        <Sub>pre-publish review queue — merge cross-platform identities, mark alumni, hide throwaways, set canonical names</Sub>

        <Item>Settings — <Path>/league/{`{slug}`}/settings</Path></Item>
        <Sub>league name, abbreviation, slug, trades-theme picker (Tribunal · Wire · Floor · Cards), publish toggle, danger-zone delete</Sub>

        <Item>Rivalries (curate) — <Path>/league/{`{slug}`}/rivalries</Path></Item>
        <Sub>pick the head-to-heads that get their own chapter on the public site</Sub>
        <Sub>↳ New rivalry — <Path>/league/{`{slug}`}/rivalries/new</Path> — two-manager picker, custom name, tagline</Sub>

        <Item>Live Season Controls — <Path>/league/{`{slug}`}/live</Path></Item>
        <Sub>Game of the Week picker, live-data source picker, weekly form overrides</Sub>

        <Item>Chronicle Builder (Present) — <Path>/league/{`{slug}`}/present</Path></Item>
        <Sub>drag-and-drop builder for a TV-ready slideshow of the season&apos;s biggest moments</Sub>
        <Sub>↳ Run — <Path>/league/{`{slug}`}/present/run</Path> — fullscreen presenter mode</Sub>

        <Item>Debug — <Path>/league/{`{slug}`}/debug</Path></Item>
        <Sub>raw bundle inspector — schemas, warnings array, parser diagnostics</Sub>

        {/* ════════════ LEAGUES HOME (PUBLIC ALMANAC) ════════════ */}
        <H1 style={{ marginTop: "3rem" }}>Leagues — Public Almanac</H1>
        <Meta>/leagues/{`{slug}`}/* — the public-facing site your visitors read</Meta>

        <Item>League Home — <Path>/leagues/{`{slug}`}/</Path></Item>
        <Sub>the masthead — a single-page broadsheet that scrolls through nine sections of the league at a glance</Sub>
        <Sub>↳ § 01 · Benchmarks — the records of record (Trackboard tabs: News · Watch · Risers · Odds)</Sub>
        <Sub>↳ § 02 · Reigning — the defending champion + seal</Sub>
        <Sub>↳ § 03 · Hall of Champions — every chip-winner, pennanted</Sub>
        <Sub>↳ § 04 · Career Leaders — leaderboards you can pan through</Sub>
        <Sub>↳ § 05 · Spotlight — featured manager + clipping</Sub>
        <Sub>↳ § 06 · Feuds — the rivalries reel</Sub>
        <Sub>↳ § 07 · Roll Call — every manager A→Z, active &amp; alumni</Sub>
        <Sub>↳ § 08 · The Index — the seven chapters</Sub>
        <Sub>↳ § 09 · By the Numbers — the almanac, totaled</Sub>

        <Item>Ch. I · All-Time Standings — <Path>/leagues/{`{slug}`}/standings.html</Path></Item>
        <Sub>league totals strip + a sortable ranked table of every manager who has ever set a lineup</Sub>
        <Sub>↳ Sort bar: Win % · Championships · Wins · Total Points · Seasons Played · Playoff Apps · Avg Finish · Alphabetical</Sub>

        <Item>Ch. II · The Society (managers) — <Path>/leagues/{`{slug}`}/managers/</Path></Item>
        <Sub>current society up top, former society below — each card links to a full manager dossier</Sub>
        <Sub>↳ Sort bar: Win % · Championships · Games Played · Total Points · Alphabetical</Sub>
        <Sub>↳ Manager profile — <Path>/leagues/{`{slug}`}/managers/manager.html?id={`{userId}`}</Path> — stat strip, Career splits, Season Ledger, Top Performances, Head-to-Head</Sub>

        <Item>Ch. III · Season Archives — <Path>/leagues/{`{slug}`}/seasons/</Path></Item>
        <Sub>chronicle of every season from founding year to now — each entry has a champion ribbon</Sub>
        <Sub>↳ Season page — <Path>/leagues/{`{slug}`}/seasons/season.html?year={`{year}`}</Path> — Champion block, Podium (top three), Final Table standings</Sub>

        <Item>Ch. IV · Draft History — <Path>/leagues/{`{slug}`}/draft/</Path></Item>
        <Sub>hero stats (Seasons · Total Picks · Managers) then six tabbed sections</Sub>
        <Sub>↳ Tab — Board · full draft board with year tabs and position legend</Sub>
        <Sub>↳ Tab — History · First Round History, Draft Order History</Sub>
        <Sub>↳ Tab — Tendencies · Manager DNA, Round Tendencies</Sub>
        <Sub>↳ Tab — Players · Most Coveted (R1-R3), Best &amp; Worst by Year</Sub>
        <Sub>↳ Tab — Loyalty · Favorite Player by manager, NFL Team Affinity</Sub>
        <Sub>↳ Tab — Value · Pick Slot History, Draft Value (QB/RB/WR/TE sub-tabs)</Sub>

        <Item>Ch. V · The Record Book — <Path>/leagues/{`{slug}`}/records.html</Path></Item>
        <Sub>five tabbed panels of league-wide records</Sub>
        <Sub>↳ Tab — Honors · Championship Roll, Single Season Records, All-Time Records</Sub>
        <Sub>↳ Tab — Marks · Fastest To Reach, Boom or Bust</Sub>
        <Sub>↳ Tab — Edge · Gauntlet &amp; Clutch</Sub>
        <Sub>↳ Tab — Streaks · Win &amp; Loss Streaks</Sub>
        <Sub>↳ Tab — Career · Career Records leaderboards (active managers)</Sub>

        <Item>Ch. VI · The Rivalries — <Path>/leagues/{`{slug}`}/rivalries/</Path></Item>
        <Sub>slideshow intro, then every curated rivalry as an entry card</Sub>
        <Sub>↳ Rivalry page — <Path>/leagues/{`{slug}`}/rivalries/rivalry.html?id={`{rivalryId}`}</Path> — head-to-head splits, verdict, recent meetings, full series log</Sub>

        <Item>Ch. VII · Live Season (hub) — <Path>/leagues/{`{slug}`}/live-season/</Path></Item>
        <Sub>paid feature — the in-season homepage with feature cards plus the horizontal &quot;By the Numbers&quot; pager</Sub>
        <Sub>↳ § 01 · This Week — the nine feature cards listed below</Sub>
        <Sub>↳ § 02 · The Charts — Current Form Sheet + The Mileage Matrix (paged)</Sub>

        <Item>Live Season · Matchup Preview — <Path>/leagues/{`{slug}`}/live-season/matchup-preview/</Path></Item>
        <Sub>every game this week on a railway departures board; claim your name for the H2H archive, your current form, and a kickoff projection</Sub>

        <Item>Live Season · Best Coach Board — <Path>/leagues/{`{slug}`}/live-season/best-coach/</Path></Item>
        <Sub>every starting lineup graded against its optimal version; season-long efficiency standings + worst single-week benchings</Sub>

        <Item>Live Season · Weekly Pick&apos;ems — <Path>/leagues/{`{slug}`}/live-season/pickems/</Path></Item>
        <Sub>pick the winner of every matchup each week; honor-system identity (claim your name and vote); Voting Records section below</Sub>
        <Sub>↳ Submit endpoint — <Path>/leagues/{`{slug}`}/live-season/pickems/submit</Path></Sub>

        <Item>Live Season · Power Rankings — <Path>/leagues/{`{slug}`}/live-season/powerrank/</Path></Item>
        <Sub>auto-calculated each week from record, points for, recent form, and full league history; includes Season Outlook</Sub>

        <Item>Live Season · Records Watch — <Path>/leagues/{`{slug}`}/live-season/records-watch/</Path></Item>
        <Sub>what&apos;s on pace to break — Records Broken · On the Brink · On Pace · Just Missed</Sub>

        <Item>Live Season · Trade Grader — <Path>/leagues/{`{slug}`}/live-season/trades/</Path></Item>
        <Sub>every completed trade for your league, auto-pulled; themed per league setting (Tribunal · Wire · Floor · Cards)</Sub>

        <Item>Live Season · Milestone Tracker — <Path>/leagues/{`{slug}`}/live-season/milestones/</Path></Item>
        <Sub>honors-roll feed — Just Achieved · One Game Away · On the Horizon</Sub>

        <Item>Live Season · Manager DNA — <Path>/leagues/{`{slug}`}/live-season/manager-dna/</Path></Item>
        <Sub>every transaction, lineup, and draft pick sequenced into an archetype per manager (Trade Hawks, Coin-Flippers, Set-and-Forget, more)</Sub>

        <Item>Live Season · Weekly Recap — <i>coming soon</i></Item>
        <Sub>Veteran tier — auto-written recap of the week&apos;s matchups, blowouts, and grudge games every Tuesday morning; card is on the hub but not yet wired</Sub>

      </div>

      <SiteFooter />
    </main>
  )
}

function H1({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <h1
      style={{
        fontFamily: "var(--serif)",
        fontSize: "1.85rem",
        color: "var(--cream)",
        borderBottom: "1px solid rgba(180,140,60,0.35)",
        paddingBottom: ".4rem",
        marginBottom: ".3rem",
        marginTop: 0,
        ...style,
      }}
    >
      {children}
    </h1>
  )
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily: "var(--mono)",
        fontSize: ".7rem",
        color: "var(--gold)",
        opacity: 0.75,
        letterSpacing: ".05em",
        textTransform: "uppercase",
        margin: "0 0 1.2rem",
      }}
    >
      {children}
    </p>
  )
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: "1rem 0 .1rem",
        color: "var(--cream)",
        fontWeight: 500,
      }}
    >
      • {children}
    </p>
  )
}

function Sub({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: ".15rem 0 .15rem 1.4rem",
        color: "var(--cream-soft)",
        fontSize: ".93rem",
        opacity: 0.85,
      }}
    >
      {children}
    </p>
  )
}

function Path({ children }: { children: React.ReactNode }) {
  return (
    <code
      style={{
        fontFamily: "var(--mono)",
        fontSize: ".72rem",
        color: "var(--gold)",
        opacity: 0.85,
        letterSpacing: ".03em",
      }}
    >
      {children}
    </code>
  )
}
