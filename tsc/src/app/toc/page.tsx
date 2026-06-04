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

      <section className="hero" style={{ paddingTop: "3rem", paddingBottom: "1.5rem" }}>
        <div className="hero-sup">★ A map of the whole thing ★</div>
        <h1 className="hero-title" style={{ fontSize: "clamp(2.25rem, 5.5vw, 4rem)" }}>
          The <em>Index.</em>
        </h1>
        <p className="hero-sub">
          Every page you can click to in The Sunday Chronicle — the commissioner-only
          management side and the public-facing almanac your visitors see. URLs use{" "}
          <code>{`{slug}`}</code> as a placeholder for the league&apos;s slug.
        </p>
      </section>

      {/* ────────────────────────────── LEAGUE SETUP (commish only) ────────────────────────────── */}
      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 00 · Management</span>
          <span className="section-title">League setup —</span>
          <span className="section-meta">/league/{`{slug}`}/* · owner-only</span>
        </div>

        <Page path={`/league/{slug}`} title="League Overview">
          Hero with season/manager/matchup totals, onboarding checklist (sources →
          sync → review members → curate rivalries → publish), the Public Almanac
          billboard, Sync &amp; Publish controls, and (Jake-only) the AI Trade
          Grader card.
        </Page>

        <Page path={`/league/{slug}/sources`} title="Sources">
          Add &amp; manage Sleeper, ESPN, NFL.com, and Yahoo connections. Each row
          shows the platform, year range it walks, last-pulled status, and a remove
          button.
        </Page>

        <Page path={`/league/{slug}/setup`} title="Setup &amp; Review">
          The pre-publish review queue — merge cross-platform identities, mark
          alumni, hide throwaway accounts, set the canonical manager name.
        </Page>

        <Page path={`/league/{slug}/settings`} title="Settings">
          League name, abbreviation, slug, trades-theme picker (Tribunal · Wire ·
          Floor · Cards), publish toggle, danger-zone delete.
        </Page>

        <Page path={`/league/{slug}/rivalries`} title="Rivalries (curate)">
          Pick the head-to-heads that get their own chapter on the public site.
          <SubList items={[
            { path: `/league/{slug}/rivalries/new`, label: "New rivalry — two-manager picker, custom name, tagline" },
          ]} />
        </Page>

        <Page path={`/league/{slug}/live`} title="Live Season Controls">
          Game of the Week picker, live-data source picker, weekly form overrides.
        </Page>

        <Page path={`/league/{slug}/present`} title="Chronicle Builder (Present)">
          Drag-and-drop builder for a TV-ready slideshow of the season&apos;s biggest
          moments.
          <SubList items={[
            { path: `/league/{slug}/present/run`, label: "Run — fullscreen presenter mode" },
          ]} />
        </Page>

        <Page path={`/league/{slug}/debug`} title="Debug">
          Raw bundle inspector — schemas, warnings array, parser diagnostics.
        </Page>
      </div>

      {/* ────────────────────────────── LEAGUE HOME ────────────────────────────── */}
      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 01 · The Public Almanac</span>
          <span className="section-title">League Home —</span>
          <span className="section-meta">/leagues/{`{slug}`}/</span>
        </div>

        <Page path={`/leagues/{slug}/`} title="League Home (index)">
          The masthead — a single-page broadsheet that scrolls through nine
          sections of the league at a glance, ending with the chapter index.
          <SubList items={[
            { label: "§ 01 · Benchmarks — the records of record (Trackboard tabs: News · Watch · Risers · Odds)" },
            { label: "§ 02 · Reigning — the defending champion + seal" },
            { label: "§ 03 · Hall of Champions — every chip-winner, pennanted" },
            { label: "§ 04 · Career Leaders — leaderboards you can pan through" },
            { label: "§ 05 · Spotlight — featured manager + clipping" },
            { label: "§ 06 · Feuds — the rivalries reel" },
            { label: "§ 07 · Roll Call — every manager A→Z, active &amp; alumni" },
            { label: "§ 08 · The Index — the seven chapters (this list)" },
            { label: "§ 09 · By the Numbers — the almanac, totaled" },
          ]} />
        </Page>
      </div>

      {/* ────────────────────────────── THE SEVEN CHAPTERS ────────────────────────────── */}
      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 02 · The Seven Chapters</span>
          <span className="section-title">Everything off the Hub —</span>
          <span className="section-meta">Ch. I through Ch. VII</span>
        </div>

        <Page path={`/leagues/{slug}/standings.html`} title="Ch. I · All-Time Standings">
          League totals strip + a sortable ranked table of every manager who has
          ever set a lineup.
          <SubList items={[
            { label: "Sort bar: Win % · Championships · Wins · Total Points · Seasons Played · Playoff Apps · Avg Finish · Alphabetical" },
          ]} />
        </Page>

        <Page path={`/leagues/{slug}/managers/`} title="Ch. II · The Society (managers index)">
          Current society up top, former society below — each card links to a full
          manager dossier.
          <SubList items={[
            { label: "Sort bar: Win % · Championships · Games Played · Total Points · Alphabetical" },
            { path: `/leagues/{slug}/managers/manager.html?id={userId}`, label: "Manager profile — stat strip, Career splits, Season Ledger, Top Performances, Head-to-Head" },
          ]} />
        </Page>

        <Page path={`/leagues/{slug}/seasons/`} title="Ch. III · Season Archives">
          Chronicle of every season from founding year to now — each entry has a
          champion ribbon and clicks through to the per-season page.
          <SubList items={[
            { path: `/leagues/{slug}/seasons/season.html?year={year}`, label: "Season page — Champion block, Podium (top three), Final Table standings" },
          ]} />
        </Page>

        <Page path={`/leagues/{slug}/draft/`} title="Ch. IV · Draft History">
          Hero stats (Seasons · Total Picks · Managers) then six tabbed sections.
          <SubList items={[
            { label: "Tab — Board · the full draft board with year tabs and position legend" },
            { label: "Tab — History · First Round History, Draft Order History" },
            { label: "Tab — Tendencies · Manager DNA, Round Tendencies" },
            { label: "Tab — Players · Most Coveted (R1-R3), Best &amp; Worst by Year" },
            { label: "Tab — Loyalty · Favorite Player by manager, NFL Team Affinity" },
            { label: "Tab — Value · Pick Slot History, Draft Value (QB/RB/WR/TE sub-tabs)" },
          ]} />
        </Page>

        <Page path={`/leagues/{slug}/records.html`} title="Ch. V · The Record Book">
          Five tabbed panels of league-wide records.
          <SubList items={[
            { label: "Tab — Honors · Championship Roll, Single Season Records, All-Time Records" },
            { label: "Tab — Marks · Fastest To Reach, Boom or Bust" },
            { label: "Tab — Edge · Gauntlet &amp; Clutch" },
            { label: "Tab — Streaks · Win &amp; Loss Streaks" },
            { label: "Tab — Career · Career Records leaderboards (active managers)" },
          ]} />
        </Page>

        <Page path={`/leagues/{slug}/rivalries/`} title="Ch. VI · The Rivalries">
          Slideshow intro, then every curated rivalry as an entry card.
          <SubList items={[
            { path: `/leagues/{slug}/rivalries/rivalry.html?id={rivalryId}`, label: "Rivalry page — head-to-head splits, verdict, recent meetings, full series log" },
          ]} />
        </Page>

        <Page path={`/leagues/{slug}/live-season/`} title="Ch. VII · Live Season (hub)">
          Paid feature — the in-season homepage with feature cards plus the
          horizontal &quot;By the Numbers&quot; pager.
          <SubList items={[
            { label: "§ 01 · This Week — nine feature cards (see below)" },
            { label: "§ 02 · The Charts — Current Form Sheet + The Mileage Matrix (paged)" },
          ]} />
        </Page>
      </div>

      {/* ────────────────────────────── LIVE SEASON FEATURES ────────────────────────────── */}
      <div className="section">
        <div className="section-header">
          <span className="section-num">§ 03 · In-Season</span>
          <span className="section-title">Live Season feature pages —</span>
          <span className="section-meta">/leagues/{`{slug}`}/live-season/*</span>
        </div>

        <Page path={`/leagues/{slug}/live-season/matchup-preview/`} title="Matchup Preview">
          Every game this week on a railway departures board. Claim your name for
          the H2H archive, your current form, and a kickoff projection.
        </Page>

        <Page path={`/leagues/{slug}/live-season/best-coach/`} title="Best Coach Board">
          Every starting lineup graded against its optimal version. Season-long
          efficiency standings + the worst single-week benchings.
        </Page>

        <Page path={`/leagues/{slug}/live-season/pickems/`} title="Weekly Pick'ems">
          Pick the winner of every matchup each week. Honor-system identity
          (claim your name and vote). Voting Records section below.
          <SubList items={[
            { path: `/leagues/{slug}/live-season/pickems/submit`, label: "Submit endpoint — receives the week's ballot" },
          ]} />
        </Page>

        <Page path={`/leagues/{slug}/live-season/powerrank/`} title="Power Rankings">
          Auto-calculated each week from record, points for, recent form, and full
          league history. Includes a Season Outlook section.
        </Page>

        <Page path={`/leagues/{slug}/live-season/records-watch/`} title="Records Watch">
          What&apos;s on pace to break — split into Records Broken · On the Brink ·
          On Pace · Just Missed.
        </Page>

        <Page path={`/leagues/{slug}/live-season/trades/`} title="Trade Grader">
          Every completed trade for your league, auto-pulled. Themed per league
          setting (Tribunal · Wire · Floor · Cards). Grades + 4-week revisits in
          progress.
        </Page>

        <Page path={`/leagues/{slug}/live-season/milestones/`} title="Milestone Tracker">
          Honors-roll feed split into Just Achieved · One Game Away · On the
          Horizon.
        </Page>

        <Page path={`/leagues/{slug}/live-season/manager-dna/`} title="Manager DNA">
          Every transaction, lineup, and draft pick sequenced into an archetype
          per manager (Trade Hawks, Coin-Flippers, Set-and-Forget, more).
        </Page>

        <Page path="(coming soon)" title="Weekly Recap">
          Veteran tier — an auto-written recap of the week&apos;s matchups,
          blowouts, and grudge games, generated every Tuesday morning. Card is
          live on the hub but not yet wired.
        </Page>
      </div>

      <SiteFooter />
    </main>
  )
}

function Page({
  path,
  title,
  children,
}: {
  path: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      className="dc-card-static"
      style={{ marginBottom: "1rem", padding: "1.2rem 1.4rem" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: ".9rem",
          flexWrap: "wrap",
          marginBottom: ".55rem",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--serif)",
            fontSize: "1.25rem",
            color: "var(--cream)",
            margin: 0,
          }}
          dangerouslySetInnerHTML={{ __html: title }}
        />
        <code
          style={{
            fontFamily: "var(--mono)",
            fontSize: ".7rem",
            color: "var(--gold)",
            opacity: 0.85,
            letterSpacing: ".03em",
          }}
        >
          {path}
        </code>
      </div>
      <div
        style={{
          color: "var(--cream-soft)",
          lineHeight: 1.55,
          fontSize: ".92rem",
        }}
      >
        {children}
      </div>
    </div>
  )
}

function SubList({
  items,
}: {
  items: Array<{ path?: string; label: string }>
}) {
  return (
    <ul
      style={{
        listStyle: "none",
        padding: 0,
        margin: ".7rem 0 0",
        borderLeft: "1px solid var(--gold)",
        borderLeftColor: "rgba(180,140,60,0.35)",
      }}
    >
      {items.map((it, i) => (
        <li
          key={i}
          style={{
            padding: ".3rem 0 .3rem .9rem",
            fontSize: ".88rem",
            color: "var(--cream-soft)",
            lineHeight: 1.5,
          }}
        >
          {it.path && (
            <code
              style={{
                fontFamily: "var(--mono)",
                fontSize: ".66rem",
                color: "var(--gold)",
                opacity: 0.8,
                marginRight: ".55rem",
                letterSpacing: ".03em",
              }}
            >
              {it.path}
            </code>
          )}
          <span dangerouslySetInnerHTML={{ __html: it.label }} />
        </li>
      ))}
    </ul>
  )
}
