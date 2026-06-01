import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadCareerSummary } from '@/lib/manager/career'
import {
  ChronicleShell, PressPlate, SecHead, Strip, Empty, PullQuote, Agate,
  fmtPct, ordinal, careerSpan,
} from '../_shared'

// ─────────────────────────────────────────────────────────────────────────────
// The STANDINGS DESK.
//
// Angle: "the W/L spine" — but the page is intermixed. After the standings
// lead it pulls in: per-league finish ledger (with title rows), draft-class
// → outcome cross-cut (which years yielded which records), milestone agate
// (first 50 wins / first ring / first playoff), and a rivalry shadow that
// names the opponents who decided the standings.
//
// Spine: Press Plate (top-right circular registration + left column rule).
// Accent: cream (the ledger reads in cream, not gold).
// ─────────────────────────────────────────────────────────────────────────────

export default async function StandingsDeskPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const summary = await loadCareerSummary(slug, user.id)
  if (!summary) notFound()

  const t = summary.totals
  const ready = summary.leagues.filter((l) => l.status === 'ready')
  const span = careerSpan(ready)
  const regGames = t.wins + t.losses + t.ties
  const plGames = t.playoffWins + t.playoffLosses
  const totalGames = regGames + plGames
  const regPct = regGames > 0 ? t.wins / (t.wins + t.losses || 1) : 0
  const plPct = plGames > 0 ? t.playoffWins / plGames : 0

  // Flatten every season-finish across leagues into one chronological ledger.
  // We carry the league name so the row reads as a single career timeline.
  const allFinishes = ready.flatMap((lg) =>
    lg.finishes.map((f) => ({ ...f, leagueName: lg.leagueName, leagueSlug: lg.leagueSlug })),
  ).sort((a, b) => a.year - b.year || a.leagueName.localeCompare(b.leagueName))

  // Best & worst seasons by record (for the pull-quote bookends).
  const bestSeason = [...allFinishes].sort((a, b) =>
    (b.wins - b.losses) - (a.wins - a.losses) || (b.wins - a.wins),
  )[0]
  const worstSeason = [...allFinishes].sort((a, b) =>
    (a.wins - a.losses) - (b.wins - b.losses) || (a.wins - b.wins),
  )[0]

  const topRival = summary.topRivalries[0]

  return (
    <ChronicleShell
      slug={slug}
      summary={summary}
      spine={
        <PressPlate
          glyph="⚖"
          accent="cream"
          sectionNum="§ 02"
          sectionName="Standings Desk"
        />
      }
    >
      <div className="mh-sec-first">
        <SecHead num="§ 02" title="The Standings Desk —" meta="every game, weighed" />
      </div>

      {regGames === 0 ? (
        <Empty>No regular-season games on file yet. Open Manager Setup, run a sync, and the ledger fills itself.</Empty>
      ) : (
        <>
          <p className="sd-deck">
            Across <strong>{t.leagues}</strong> {t.leagues === 1 ? 'league' : 'leagues'} and <strong>{t.seasonsPlayed}</strong> seasons
            ({span}), the desk has weighed <strong>{totalGames}</strong> games. What follows is the long ledger —
            broken open league by league, with the draft classes that produced each finish and the rivals who decided the closer ones.
          </p>

          {/* ── 6-strip career glance ── */}
          <div className="mh-strip">
            <Strip label="Leagues" value={t.leagues} detail="on file" cream />
            <Strip label="Seasons" value={t.seasonsPlayed} detail={span} />
            <Strip label="Games" value={totalGames} detail="reg + playoff" cream />
            <Strip label="Win pct" value={fmtPct(t.winPct)} detail="all-time reg" />
            <Strip label="Playoff trips" value={t.playoffAppearances} detail="postseasons" cream />
            <Strip label="Rings" value={t.championships} detail={t.championships ? 'engraved' : 'still chasing'} />
          </div>

          {/* ── Reg vs Playoff split ── */}
          <div className="mh-split">
            <div className="mh-splitcol">
              <div className="mh-split-lbl">Regular Season</div>
              <div className="mh-split-rec">{t.wins}–{t.losses}{t.ties ? `–${t.ties}` : ''}</div>
              <div className="mh-split-pct">{fmtPct(regPct)} win pct</div>
              <div className="mh-split-pf">PF {Math.round(t.pointsFor).toLocaleString()} · PA {Math.round(t.pointsAgainst).toLocaleString()}</div>
            </div>
            <div className="mh-splitcol is-playoff">
              <div className="mh-split-lbl">Playoffs</div>
              <div className="mh-split-rec">{t.playoffWins}–{t.playoffLosses}</div>
              <div className="mh-split-pct">{plGames ? `${fmtPct(plPct)} win pct` : 'no playoff games yet'}</div>
              <div className="mh-split-pf">PF {Math.round(t.playoffPointsFor).toLocaleString()} · PA {Math.round(t.playoffPointsAgainst).toLocaleString()}</div>
            </div>
          </div>

          {/* ── Mixed: pull-quote about the best win + milestone agate ── */}
          {(summary.bestWins[0] || bestSeason || worstSeason) && (
            <div className="sd-mixrow">
              {summary.bestWins[0] && (
                <PullQuote
                  kicker="From the Hall of Fame Desk"
                  body={<>“The signature win on file reads <em>{summary.bestWins[0].score.toFixed(1)}–{summary.bestWins[0].oppScore.toFixed(1)}</em> over {summary.bestWins[0].opponent}. The desk slotted it directly into the {summary.bestWins[0].year} ledger.”</>}
                  attribution={`${summary.bestWins[0].leagueName} · W${summary.bestWins[0].week} ${summary.bestWins[0].year}${summary.bestWins[0].isPlayoff ? ' · Playoffs' : ''}`}
                />
              )}
              <Agate
                items={[
                  ...(bestSeason ? [{
                    label: 'Best Season',
                    value: <><em>{bestSeason.wins}–{bestSeason.losses}{bestSeason.ties ? `–${bestSeason.ties}` : ''}</em> · {bestSeason.year}{bestSeason.rank ? ` · ${ordinal(bestSeason.rank)}` : ''}</>,
                  }] : []),
                  ...(worstSeason && worstSeason.year !== bestSeason?.year ? [{
                    label: 'Worst Season',
                    value: <><em>{worstSeason.wins}–{worstSeason.losses}{worstSeason.ties ? `–${worstSeason.ties}` : ''}</em> · {worstSeason.year}{worstSeason.rank ? ` · ${ordinal(worstSeason.rank)}` : ''}</>,
                  }] : []),
                  ...(topRival ? [{
                    label: 'Rivalry Shadow',
                    value: <>vs <em>{topRival.opponent}</em> · {topRival.wins}–{topRival.losses} · {topRival.games} mtgs</>,
                  }] : []),
                  {
                    label: 'Playoff Rate',
                    value: <em>{t.seasonsPlayed > 0 ? `${Math.round(100 * t.playoffAppearances / t.seasonsPlayed)}%` : '—'}</em>,
                  },
                ]}
              />
              <style>{MIX_CSS}</style>
            </div>
          )}

          {/* ── Per-league finish ledger — the long table ── */}
          <SecHead num="§ 02-A" title="The League-by-League Ledger —" meta={`${ready.length} ${ready.length === 1 ? 'desk' : 'desks'} reporting`} />

          {ready.length === 0 ? (
            <Empty>No leagues synced yet.</Empty>
          ) : (
            <div className="sd-ledgers">
              {ready.map((lg) => (
                <article key={lg.leagueId} className="sd-ledger">
                  <header className="sd-ledger-head">
                    <div>
                      <div className="sd-ledger-name">{lg.leagueName}</div>
                      <div className="sd-ledger-meta">
                        {lg.platform} · {lg.firstYear && lg.lastYear ? (lg.firstYear === lg.lastYear ? lg.firstYear : `${lg.firstYear}–${lg.lastYear}`) : '—'}
                      </div>
                    </div>
                    <div className="sd-ledger-line">
                      <span className="sd-ledger-rec">{lg.wins}–{lg.losses}{lg.ties ? `–${lg.ties}` : ''}</span>
                      <span className="sd-ledger-pct">{fmtPct(lg.wins / (lg.wins + lg.losses || 1))}</span>
                    </div>
                  </header>

                  <div className="sd-ledger-strip">
                    <div><span>Playoff</span>{lg.playoffWins}–{lg.playoffLosses}</div>
                    <div><span>Trips</span>{lg.playoffAppearances}</div>
                    <div><span>Titles</span>{lg.championships}</div>
                    <div><span>Best</span>{lg.bestFinish != null ? ordinal(lg.bestFinish) : '—'}</div>
                  </div>

                  {lg.finishes.length > 0 && (
                    <div className="mh-table">
                      <table>
                        <thead><tr>
                          <th>Year</th>
                          <th className="num">Record</th>
                          <th className="num">Finish</th>
                          <th>Postseason</th>
                        </tr></thead>
                        <tbody>
                          {lg.finishes.map((f) => (
                            <tr key={f.year} className={f.champion ? 'is-title' : ''}>
                              <td className="year">{f.year}</td>
                              <td className="num">{f.wins}–{f.losses}{f.ties ? `–${f.ties}` : ''}</td>
                              <td className={`num finish ${f.rank === 1 ? 'gold' : f.rank === 2 ? 'silver' : f.rank === 3 ? 'bronze' : ''}`}>
                                {f.rank === 1 ? '★ 1st' : f.rank != null ? ordinal(f.rank) : '—'}
                              </td>
                              <td>{f.champion ? '🏆 Champion' : f.madePlayoffs ? 'Made playoffs' : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              ))}
              <style>{LEDGER_CSS}</style>
            </div>
          )}

          {/* ── Mixed: cross-pollination with other desks ── */}
          <SecHead num="§ 02-B" title="What the Standings Hide —" meta="cross-desk notes" />
          <div className="sd-crossnotes">
            {topRival && (
              <div className="sd-note">
                <div className="sd-note-kicker">From the Society Page</div>
                <div className="sd-note-body">
                  <em>{topRival.opponent}</em> sits across the table {topRival.games} times in this chronicle. The head-to-head is{' '}
                  <strong>{topRival.wins}–{topRival.losses}{topRival.ties ? `–${topRival.ties}` : ''}</strong> — a swing that maps directly onto the standings above.
                </div>
                <Link href={`/manager/${slug}/rivals`} className="sd-note-link">Read the Society Page →</Link>
              </div>
            )}
            {summary.worstLosses[0] && (
              <div className="sd-note">
                <div className="sd-note-kicker">From the Record Book</div>
                <div className="sd-note-body">
                  The worst beat on file is <em>{summary.worstLosses[0].score.toFixed(1)}–{summary.worstLosses[0].oppScore.toFixed(1)}</em> at {summary.worstLosses[0].opponent} in {summary.worstLosses[0].year}.
                  {' '}One loss explains a lot of standings.
                </div>
                <Link href={`/manager/${slug}/records`} className="sd-note-link">Open the Record Book →</Link>
              </div>
            )}
            {t.championships > 0 && (
              <div className="sd-note">
                <div className="sd-note-kicker">From the Trophy Room</div>
                <div className="sd-note-body">
                  {t.championships} ring{t.championships === 1 ? '' : 's'} pulled the year-end finish to <em>1st</em> — those rows are highlighted in the ledger above.
                </div>
                <Link href={`/manager/${slug}/trophies`} className="sd-note-link">Open the Trophy Room →</Link>
              </div>
            )}
          </div>

          <p className="mh-foot">
            ★ Championship-bracket games only. Consolation &amp; placement games are excluded — same rules the league almanac uses.
          </p>
          <style>{FOOT_CSS}</style>
        </>
      )}
    </ChronicleShell>
  )
}

// ── page-local styles ────────────────────────────────────────────────────────

const MIX_CSS = `
.sd-mixrow { display: grid; grid-template-columns: 1.2fr 1fr; gap: 1.5rem; margin: 1.6rem 0; align-items: start; }
@media (max-width: 760px) { .sd-mixrow { grid-template-columns: 1fr; } }
.sd-mixrow .mh-pull { margin: 0; }
.sd-mixrow .mh-agate { margin: 0; }
`

const LEDGER_CSS = `
.sd-ledgers { display: flex; flex-direction: column; gap: 1.6rem; }
.sd-ledger { border: 1px solid var(--ink-line); background: var(--ink-soft); padding: 1.4rem 1.5rem; border-radius: 2px; position: relative; }
.sd-ledger::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: var(--cream-mute); }
.sd-ledger-head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; flex-wrap: wrap; padding-bottom: .8rem; border-bottom: 1px solid var(--ink-line); }
.sd-ledger-name { font-family: var(--serif); font-size: 1.4rem; color: var(--cream); line-height: 1.1; }
.sd-ledger-meta { font-family: var(--mono); font-size: .58rem; letter-spacing: .18em; text-transform: uppercase; color: var(--cream-mute); margin-top: .25rem; }
.sd-ledger-line { display: flex; gap: 1rem; align-items: baseline; }
.sd-ledger-rec { font-family: var(--serif); font-style: italic; font-size: 1.7rem; color: var(--gold); }
.sd-ledger-pct { font-family: var(--mono); font-weight: 700; font-size: .8rem; color: var(--cream-soft); }
.sd-ledger-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin-top: 1rem; border-top: 1px solid var(--ink-line-soft); border-bottom: 1px solid var(--ink-line-soft); }
.sd-ledger-strip > div { padding: .75rem 0; text-align: center; border-right: 1px solid var(--ink-line-soft); font-family: var(--serif); color: var(--cream); font-size: 1.1rem; }
.sd-ledger-strip > div:last-child { border-right: none; }
.sd-ledger-strip > div span { display: block; font-family: var(--mono); font-weight: 700; font-size: .5rem; letter-spacing: .22em; text-transform: uppercase; color: var(--cream-mute); margin-bottom: .25rem; }
`

const FOOT_CSS = `
.sd-deck { font-family: var(--serif); font-size: 1.05rem; color: var(--cream-soft); line-height: 1.65; max-width: 56ch; margin: 0 auto 1.5rem; text-align: center; }
.sd-deck strong { color: var(--gold); font-weight: 400; font-style: italic; }
.mh-foot { font-family: var(--serif); font-style: italic; font-size: .82rem; color: var(--cream-mute); margin-top: 1.5rem; line-height: 1.5; text-align: center; }
.sd-crossnotes { display: grid; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); gap: 1rem; margin-top: 1rem; }
.sd-note { padding: 1rem 1.1rem; background: var(--ink-card); border: 1px solid var(--ink-line); border-left: 3px solid var(--steel); border-radius: 2px; }
.sd-note-kicker { font-family: var(--mono); font-weight: 700; font-size: .54rem; letter-spacing: .22em; text-transform: uppercase; color: var(--steel); margin-bottom: .4rem; }
.sd-note-body { font-family: var(--serif); font-size: .95rem; line-height: 1.55; color: var(--cream-soft); }
.sd-note-body em { color: var(--cream); font-style: italic; }
.sd-note-body strong { color: var(--gold); font-weight: 400; }
.sd-note-link { display: inline-block; margin-top: .6rem; font-family: var(--mono); font-size: .58rem; letter-spacing: .18em; text-transform: uppercase; color: var(--gold); text-decoration: underline; }
`
