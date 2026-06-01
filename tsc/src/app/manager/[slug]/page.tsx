import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadCareerSummary, type CareerSummary } from '@/lib/manager/career'
import {
  ChronicleShell, FolioRail, SecHead, Strip, Empty, FieldRule, Seal,
  Agate, PullQuote,
  fmtPct, romanOr, careerSpan, initials, syncDateLabel, firstLetter,
} from './_shared'

// ─────────────────────────────────────────────────────────────────────────────
// The FRONT PAGE.
//
// Angle: "what's the story?" Lead with the headline + dropcap prose, then
// fold-mix every desk's best bit so the reader can see all six ingredients
// from the cover before clicking deeper.
//
// Spine: Folio Rail (left edge printer's strip + circular postmark).
// ─────────────────────────────────────────────────────────────────────────────

export default async function FrontPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ added?: string }>
}) {
  const { slug } = await params
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const summary = await loadCareerSummary(slug, user.id)
  if (!summary) notFound()

  const t = summary.totals
  const ready = summary.leagues.filter((l) => l.status === 'ready')
  const span = careerSpan(ready)
  const regGames = t.wins + t.losses + t.ties
  const totalGames = regGames + t.playoffWins + t.playoffLosses
  const lead = leadHeadline(summary)
  const titleYears = summary.trophyCase.filter((tr) => tr.kind === 'champion').map((tr) => tr.year).sort((a, b) => a - b)
  const bestWin = summary.bestWins[0]
  const worstLoss = summary.worstLosses[0]
  const topRival = summary.topRivalries[0]

  return (
    <ChronicleShell
      slug={slug}
      summary={summary}
      spine={
        <FolioRail
          edition={`EDITION ${romanOr(t.seasonsPlayed || 1)}`}
          sectionNum="§ 01"
          sectionName="THE FRONT PAGE"
          initials={initials(summary.chronicle.displayName)}
          syncDate={syncDateLabel(summary)}
          postmark="front"
        />
      }
    >
      {sp.added && summary.pendingCount > 0 && (
        <div className="mh-banner">
          <div className="mh-banner-kicker">★ League added</div>
          <div className="mh-banner-body">
            {summary.pendingCount} {summary.pendingCount === 1 ? 'league needs' : 'leagues need'} a sync before they fill your book.{' '}
            <Link href={`/manager/${slug}/settings`} className="mh-banner-link">Sync now →</Link>
          </div>
          <style>{BANNER_CSS}</style>
        </div>
      )}

      {/* Masthead */}
      <header className="mh-front-mast">
        <div className="mh-mast-rule mh-mast-rule-thick" />
        <div className="mh-mast-meta">
          <span>Vol. {romanOr(t.seasonsPlayed)}</span>
          <span>★</span>
          <span>The {summary.chronicle.displayName} Chronicle</span>
          <span>★</span>
          <span>Est. {span}</span>
        </div>
        <h1 className="mh-mast-title">{summary.chronicle.displayName}<em>.</em></h1>
        <div className="mh-mast-rule" />
        <p className="mh-mast-tag">{summary.chronicle.subtitle || lead.sub}</p>
      </header>

      {/* Champion ribbon — if any titles */}
      {titleYears.length > 0 && (
        <div className="mh-seals">
          {titleYears.map((y) => <Seal key={y} year={y} />)}
        </div>
      )}

      <FieldRule />

      {/* Lead — headline + dropcap prose */}
      <div className="mh-lead">
        <div className="mh-kicker">★ Career Dispatch ★</div>
        <h2 className="mh-lead-head">{lead.head}</h2>
      </div>

      <div className="mh-cols">
        <p>
          <span className="mh-dropcap">{firstLetter(summary.chronicle.displayName)}</span>
          {frontProse(summary, span, totalGames)}
        </p>
      </div>

      {/* Above-the-fold 3-column mix: standings · trophies · drafts/leagues */}
      <div className="mh-fold">
        <div className="mh-foldcol">
          <h3>The Record So Far</h3>
          <div className="mh-big">{t.wins}–{t.losses}{t.ties ? `–${t.ties}` : ''}</div>
          <p>
            {regGames > 0
              ? <>Regular-season pace of <em style={{ color: 'var(--gold)' }}>{fmtPct(t.wins / (t.wins + t.losses || 1))}</em>. Postseason work brings the total games on file to <em style={{ color: 'var(--gold)' }}>{totalGames}</em>.</>
              : 'No games filed yet — sync a league to put the first numbers in the ledger.'}
          </p>
          <p style={{ marginTop: '.6rem' }}>
            <Link href={`/manager/${slug}/standings`} style={{ color: 'var(--gold)', textDecoration: 'underline', fontFamily: 'var(--mono)', fontSize: '.62rem', letterSpacing: '.18em', textTransform: 'uppercase' }}>Read the Standings Desk →</Link>
          </p>
        </div>

        <div className="mh-foldcol" style={{ textAlign: 'center' }}>
          <h3>The Trophy Case</h3>
          <div className="mh-big" style={{ color: 'var(--gold)' }}>{t.championships}</div>
          <p>
            {t.championships > 0
              ? <>{t.championships === 1 ? 'A single ring' : `${t.championships} rings`}{titleYears.length ? <> — <em style={{ color: 'var(--gold)' }}>{titleYears.join(', ')}</em></> : ''}. Runner-up finishes on file: {t.runnerUps}.</>
              : <>No rings yet. {t.runnerUps > 0 ? `${t.runnerUps} runner-up ${t.runnerUps === 1 ? 'finish' : 'finishes'} on file.` : 'The chase continues.'}</>}
          </p>
          <p style={{ marginTop: '.6rem' }}>
            <Link href={`/manager/${slug}/trophies`} style={{ color: 'var(--gold)', textDecoration: 'underline', fontFamily: 'var(--mono)', fontSize: '.62rem', letterSpacing: '.18em', textTransform: 'uppercase' }}>Open the Trophy Room →</Link>
          </p>
        </div>

        <div className="mh-foldcol" style={{ textAlign: 'right' }}>
          <h3>Filed From</h3>
          <div className="mh-big">{t.leagues}</div>
          <p>
            {ready.length > 0
              ? <>{t.leagues === 1 ? 'league' : 'leagues'} feeding the chronicle, spanning <em style={{ color: 'var(--gold)' }}>{span}</em>. {summary.pendingCount > 0 ? <>{summary.pendingCount} awaiting sync.</> : 'All synced.'}</>
              : <>No leagues filed yet. <Link href="/manager/new" style={{ color: 'var(--gold)' }}>Add one →</Link></>}
          </p>
          <p style={{ marginTop: '.6rem' }}>
            <Link href={`/manager/${slug}/settings`} style={{ color: 'var(--gold)', textDecoration: 'underline', fontFamily: 'var(--mono)', fontSize: '.62rem', letterSpacing: '.18em', textTransform: 'uppercase' }}>Open Manager Setup →</Link>
          </p>
        </div>
      </div>

      {/* In This Edition — agate strip teases each desk */}
      {(bestWin || worstLoss || topRival || titleYears.length > 0) && (
        <>
          <SecHead num="§ 01-A" title="In This Edition —" meta="page teases" />
          <Agate
            items={[
              ...(bestWin ? [{
                label: 'Hall of Fame',
                value: <><em>{bestWin.score.toFixed(1)}–{bestWin.oppScore.toFixed(1)}</em> over {bestWin.opponent} · W{bestWin.week} {bestWin.year}</>,
              }] : []),
              ...(worstLoss ? [{
                label: 'Hall of Pain',
                value: <>{worstLoss.score.toFixed(1)}–<em>{worstLoss.oppScore.toFixed(1)}</em> at {worstLoss.opponent} · {worstLoss.year}</>,
              }] : []),
              ...(topRival ? [{
                label: 'Society Page',
                value: <>vs <em>{topRival.opponent}</em> · {topRival.wins}–{topRival.losses}{topRival.ties ? `–${topRival.ties}` : ''} ({topRival.games} mtgs)</>,
              }] : []),
              ...(titleYears.length > 0 ? [{
                label: 'Trophy Room',
                value: <>Latest title: <em>{titleYears[titleYears.length - 1]}</em>{titleYears.length > 1 ? <> · {titleYears.length}× champion</> : ''}</>,
              }] : []),
              {
                label: 'Standings Desk',
                value: <>{t.playoffAppearances} playoff {t.playoffAppearances === 1 ? 'trip' : 'trips'} · {fmtPct(t.winPct)} pct</>,
              },
            ]}
          />
        </>
      )}

      {/* Two pull quotes — best win on the left, worst beat on the right */}
      {(bestWin || worstLoss) && (
        <div className="mh-twoup">
          {bestWin && (
            <PullQuote
              kicker="The Signature Win"
              body={<>“It read <em>{bestWin.score.toFixed(1)}–{bestWin.oppScore.toFixed(1)}</em> when the dust settled — a {Math.abs(bestWin.margin).toFixed(1)}-point statement against {bestWin.opponent}.”</>}
              attribution={`${bestWin.leagueName} · W${bestWin.week} ${bestWin.year}${bestWin.isPlayoff ? ' · Playoffs' : ''}`}
            />
          )}
          {worstLoss && (
            <PullQuote
              kicker="The Bruise"
              body={<>“Final: <em>{worstLoss.score.toFixed(1)}–{worstLoss.oppScore.toFixed(1)}</em>. The {Math.abs(worstLoss.margin).toFixed(1)}-point gap against {worstLoss.opponent} is the one that still stings.”</>}
              attribution={`${worstLoss.leagueName} · W${worstLoss.week} ${worstLoss.year}${worstLoss.isPlayoff ? ' · Playoffs' : ''}`}
            />
          )}
          <style>{TWOUP_CSS}</style>
        </div>
      )}

      {/* The leagues feeding the paper — small chip row */}
      {ready.length > 0 && (
        <>
          <SecHead num="§ 01-B" title="The Beats —" meta="leagues feeding this paper" />
          <div className="mh-beats">
            {ready.map((lg) => (
              <Link key={lg.leagueId} href={`/leagues/${lg.leagueSlug}/`} className="mh-beat">
                <div className="mh-beat-name">{lg.leagueName}</div>
                <div className="mh-beat-meta">
                  {lg.platform} · {lg.firstYear && lg.lastYear ? (lg.firstYear === lg.lastYear ? lg.firstYear : `${lg.firstYear}–${lg.lastYear}`) : '—'}
                </div>
                <div className="mh-beat-rec">
                  {lg.wins}–{lg.losses}{lg.ties ? `–${lg.ties}` : ''} · {lg.championships} {lg.championships === 1 ? 'ring' : 'rings'}
                </div>
              </Link>
            ))}
            {summary.leagues.filter((l) => l.status === 'pending').map((lg) => (
              <div key={lg.leagueId} className="mh-beat is-pending">
                <div className="mh-beat-name">{lg.leagueName}</div>
                <div className="mh-beat-meta">{lg.platform} · awaiting sync</div>
                <div className="mh-beat-rec">— · —</div>
              </div>
            ))}
            <style>{BEATS_CSS}</style>
          </div>
        </>
      )}

      {ready.length === 0 && (
        <Empty>
          This chronicle is freshly bound and waiting for its first edition. Add a league, point it at the right manager, and run a sync — every season, every matchup, and every trophy will be set into the pages that follow.
        </Empty>
      )}

      {/* Career numbers strip at the bottom — a quick-glance "by the numbers" close */}
      {regGames > 0 && (
        <>
          <SecHead num="§ 01-C" title="By the Numbers —" meta="quick glance" />
          <div className="mh-strip">
            <Strip label="Leagues" value={t.leagues} detail="on file" cream />
            <Strip label="Seasons" value={t.seasonsPlayed} detail={span} />
            <Strip label="Games" value={totalGames} detail="reg + playoff" cream />
            <Strip label="Titles" value={t.championships} detail={t.championships ? 'engraved' : 'chasing'} />
            <Strip label="Playoff" value={`${t.playoffWins}–${t.playoffLosses}`} detail={`${t.playoffAppearances} trips`} />
            <Strip label="Win pct" value={fmtPct(t.winPct)} detail="all-time reg" cream />
          </div>
        </>
      )}
    </ChronicleShell>
  )
}

// ── narrative helpers ────────────────────────────────────────────────────────

function leadHeadline(s: CareerSummary): { head: string; sub: string } {
  const t = s.totals
  if (t.championships >= 3) return { head: `A Dynasty Across ${t.leagues} ${t.leagues === 1 ? 'League' : 'Leagues'}`, sub: `${t.championships} championships and counting.` }
  if (t.championships >= 1) return { head: `${t.championships}× Champion`, sub: `${t.seasonsPlayed} seasons, ${t.wins}–${t.losses} all-time.` }
  if (t.playoffAppearances >= 3) return { head: 'A Perennial Contender', sub: `${t.playoffAppearances} playoff appearances, still chasing the ring.` }
  if (t.seasonsPlayed > 0) return { head: 'The Grind Continues', sub: `${t.seasonsPlayed} seasons across ${t.leagues} ${t.leagues === 1 ? 'league' : 'leagues'}.` }
  return { head: 'A New Chronicle Opens', sub: 'Sync your leagues to write the first chapter.' }
}

function frontProse(s: CareerSummary, span: string, totalGames: number): string {
  const t = s.totals
  if (t.seasonsPlayed === 0) return `his chronicle is freshly bound and waiting. Link your leagues, choose which manager is you, and run a sync — every season, every matchup, and every trophy will be set into these pages automatically.`
  const titlePhrase = t.championships > 0 ? `${t.championships} championship${t.championships === 1 ? '' : 's'}` : 'no titles yet, though the chase is alive'
  const playoffPhrase = t.playoffAppearances > 0 ? `${t.playoffAppearances} trip${t.playoffAppearances === 1 ? '' : 's'} to the postseason` : 'a postseason berth still pending'
  return `cross ${t.leagues} ${t.leagues === 1 ? 'league' : 'leagues'} and ${t.seasonsPlayed} season${t.seasonsPlayed === 1 ? '' : 's'} (${span}), ${totalGames} games have been played. The record reads ${t.wins}–${t.losses}${t.ties ? `–${t.ties}` : ''} with ${titlePhrase} and ${playoffPhrase}. The desks that follow break it down league by league and rival by rival — the full account of a manager's career, set in type.`
}

// ── page-local styles ────────────────────────────────────────────────────────

const BANNER_CSS = `
.mh-banner { max-width: 880px; margin: 0 auto 1.5rem; padding: 1rem 1.25rem; background: rgba(232,200,137,.06); border: 1px solid var(--gold-deep); border-radius: 2px; }
.mh-banner-kicker { font-family: var(--mono); font-size: .6rem; letter-spacing: .22em; text-transform: uppercase; color: var(--gold); margin-bottom: .25rem; }
.mh-banner-body { font-family: var(--serif); font-size: 1.05rem; color: var(--cream); }
.mh-banner-link { color: var(--gold); }
`

const TWOUP_CSS = `
.mh-twoup { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin: 1.6rem 0; }
.mh-twoup .mh-pull { margin: 0; }
.mh-twoup .mh-pull:nth-child(2) { border-left: none; border-right: 3px solid var(--rust); background: rgba(160,72,48,.05); text-align: right; }
.mh-twoup .mh-pull:nth-child(2) .mh-pull-kicker { color: var(--rust); }
@media (max-width: 720px) { .mh-twoup { grid-template-columns: 1fr; } .mh-twoup .mh-pull:nth-child(2) { text-align: left; border-right: none; border-left: 3px solid var(--rust); } }
`

const BEATS_CSS = `
.mh-beats { display: grid; grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); gap: .8rem; }
.mh-beat { display: block; padding: 1rem 1.1rem; border: 1px solid var(--ink-line); background: var(--ink-soft); border-radius: 2px; text-decoration: none; transition: all .15s; }
.mh-beat:hover { border-color: var(--gold-deep); background: rgba(232,200,137,.04); }
.mh-beat.is-pending { opacity: .55; }
.mh-beat-name { font-family: var(--serif); font-size: 1.05rem; color: var(--cream); line-height: 1.2; }
.mh-beat-meta { font-family: var(--mono); font-size: .56rem; letter-spacing: .18em; text-transform: uppercase; color: var(--cream-mute); margin-top: .35rem; }
.mh-beat-rec { font-family: var(--mono); font-size: .7rem; color: var(--gold); margin-top: .45rem; }
`
