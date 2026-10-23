import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { recapViewable } from '@/lib/recap/load'
import { SITE_URL } from '@/lib/recap/links'
import { TIER_PRICES } from '@/lib/stripe'
import { loadReportCached } from '@/lib/report/cached'
import { needsLabel, needsVerdict, ordinal, raceGroups, type Grade, type ReportTeam, type ReportView } from '@/lib/report/build'
import { divisionLabels } from '@/lib/divisionLabels'
import { ShareButton } from '../recap/ShareButton'
import styles from './report.module.css'

// The Progress Report, printed as a school report card: blue-grey card
// stock, navy ink, grades circled in red pen. The playoff race sits on its
// own navy board between the letterhead and the cards, so the two halves
// read as two things. Its own house on purpose, not the recap's newsprint
// or the Cup's green board.
//
// Free leagues get the race and every overall grade; the subject marks,
// the comments and next week's win/loss odds are blurred over placeholder
// text (never the real values) with the upgrade line on top.

export async function reportLeague(slug: string) {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound()
  const db = createAdminClient()
  const { data } = await db.from('leagues').select('id, name, slug, owner_id, published_at').eq('slug', slug).maybeSingle()
  if (!data || !(await recapViewable(data))) notFound()
  return data as { id: string; name: string; slug: string; owner_id: string | null; published_at: string | null }
}

function titleOf(v: ReportView): string {
  return v.final ? 'Final Report Card' : 'Progress Report'
}

function summaryOf(v: ReportView): string {
  if (v.tier === 'free') {
    const honor = [...v.teams].sort((a, b) => b.gpa - a.gpa).slice(0, 3)
    return `A report card for all ${v.teams.length} managers through week ${v.week}. Honor roll: ${honor.map((t) => `${t.name} (${t.grades.overall.letter})`).join(', ')}.`
  }
  const top = v.teams[0]
  const mover = [...v.teams]
    .filter((t) => t.before != null)
    .sort((a, b) => Math.abs(b.odds - (b.before ?? 0)) - Math.abs(a.odds - (a.before ?? 0)))[0]
  const parts = [`Playoff odds and a report card for all ${v.teams.length} managers through week ${v.week}.`]
  if (top) parts.push(`${top.name} leads the race at ${Math.round(top.odds)}%.`)
  if (mover && mover.before != null && Math.abs(mover.odds - mover.before) >= 8) {
    const d = Math.round(mover.odds - mover.before)
    parts.push(`${mover.name} ${d > 0 ? 'up' : 'down'} ${Math.abs(d)} points.`)
  }
  return parts.join(' ')
}

export async function reportMetadata(slug: string, week: number | null): Promise<Metadata> {
  const league = await reportLeague(slug)
  const r = await loadReportCached(league, week)
  if (r.status !== 'ok') return { title: `Progress Report · ${league.name}`, robots: { index: false, follow: false } }
  const v = r.view
  const title = `${titleOf(v)}, week ${v.week} · ${league.name}`
  const description = summaryOf(v)
  const image = { url: `${SITE_URL}/api/og/report/${slug}/${v.week}/?v=1`, width: 1200, height: 630, alt: title }
  return {
    title,
    description,
    ...(league.published_at ? {} : { robots: { index: false, follow: false } }),
    alternates: { canonical: `${SITE_URL}/leagues/${slug}/report/${v.week}/` },
    openGraph: { title, description, images: [image], type: 'article' },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  }
}

export async function ReportPage({ slug, week, previewTier }: { slug: string; week: number; previewTier?: string | null }) {
  const league = await reportLeague(slug)
  const r = await loadReportCached(league, week)
  if (r.status !== 'ok') notFound()
  // Not a report week (the 2026 week 5 edition, from before the weeks were
  // fixed, or one that isn't out yet): the newest report instead.
  if (r.view.week !== week) redirect(`/leagues/${slug}/report/${r.view.week}/`)
  const v = r.view
  // ?tier=free shows the free page on a paid league, outside production only.
  const paid = previewTier === 'free' && process.env.NODE_ENV !== 'production' ? false : v.tier !== 'free'
  // Playoff odds are a paid feature across the site, so the free race is the
  // standings, with the odds columns blurred over placeholders.
  const raceTeams = paid ? v.teams : [...v.teams].sort((a, b) => a.seed - b.seed)
  // One board, or one per conference when each sends its own top N.
  const raceBoards = raceGroups(v, raceTeams)
  const divLabels = v.divisions ? divisionLabels(v.divisions) : null
  const pageUrl = `${SITE_URL}/leagues/${slug}/report/${v.week}/`
  const byGpa = [...v.teams].sort((a, b) => b.gpa - a.gpa || b.odds - a.odds)
  const honor = byGpa.slice(0, 3)
  const seeMe = byGpa[byGpa.length - 1]
  const tickLabel = v.compareWeek ? (v.compareIsEdition ? `in the week ${v.compareWeek} report` : `after week ${v.compareWeek}`) : null
  const hasNext = v.teams.some((t) => t.next)
  const needers = v.teams.filter((t) => t.needs)
  const clinched = v.teams.filter((t) => t.clinched)
  const out = v.teams.filter((t) => t.eliminated)
  const nameOf = new Map(v.teams.map((t) => [t.managerId, t.name]))

  return (
    <main className={styles.page}>
      {/* ── Letterhead ── */}
      <header className={styles.head}>
        <div className={styles.headInner}>
          <p className={styles.school}>
            {league.name} · {v.year} season
          </p>
          <h1 className={styles.title}>{titleOf(v)}</h1>
          <dl className={styles.fields}>
            <div className={styles.field}>
              <dt>Covers</dt>
              <dd>Weeks 1 to {v.week}</dd>
            </div>
            <div className={styles.field}>
              <dt>Playoff spots</dt>
              <dd>{v.playoffTeams}</dd>
            </div>
            <div className={`${styles.field} ${styles.termField}`}>
              <dt>
                Report {v.edition} of {v.editions.length}
                <span className={styles.termNext}>{v.nextEdition ? `Next after week ${v.nextEdition}` : 'The last one'}</span>
              </dt>
              <dd>
                <TermTrack slug={slug} v={v} />
              </dd>
            </div>
          </dl>
          <div className={styles.actions}>
            <ShareButton className={styles.btnPrimary} url={pageUrl} title={`${titleOf(v)} · ${league.name}`} />
            <Link className={styles.btn} href={`/leagues/${slug}/recap/${v.year}/${v.week}/`}>
              Week {v.week} recap
            </Link>
            <Link className={`${styles.btn} ${styles.btnWide}`} href={`/leagues/${slug}/`}>
              View the league
            </Link>
          </div>
        </div>
      </header>

      {/* ── The race ── */}
      <section className={styles.race} aria-labelledby="race-h">
        <div className={styles.raceInner}>
          <div className={styles.sectionHead}>
            <h2 id="race-h" className={styles.raceTitle}>
              The Playoff Race
            </h2>
            <p className={styles.raceSub}>
              {paid
                ? `Odds from 8,000 simulated finishes to the season${tickLabel ? `. The tick on each bar is where they stood ${tickLabel}.` : '.'}`
                : `The standings through week ${v.week}, with each team's odds from 8,000 simulated finishes to the season.`}
            </p>
          </div>

          {/* A standings board: the place in the race, the team, the odds
              big on the right with the move since last time under it, the
              bar, and next week's stakes in one plain line. By the league's
              playoff rules: one board, or one per conference when each
              conference sends its own top N (raceGroups). */}
          {raceBoards.groups.map((g) => (
            <div key={g.div ?? 'all'} className={styles.raceGroup}>
              {g.name ? (
                <div className={styles.groupHead}>
                  <DivBadge div={g.div} labels={divLabels} names={v.divisions} />
                  <span className={styles.groupName}>{g.name}</span>
                  <span className={styles.groupRule}>Top {g.spots} make the playoffs</span>
                </div>
              ) : null}
              <div className={styles.raceTable} role="table" aria-label={g.name ? `${g.name} playoff odds` : 'Playoff odds'}>
                <div className={`${styles.raceRow} ${styles.raceHeadRow}`} role="row">
                  <span role="columnheader" className={styles.rankHead}>
                    #
                  </span>
                  <span role="columnheader" className={styles.whoHead}>
                    Team
                  </span>
                  <span role="columnheader" className={styles.barHead}>
                    Playoff odds
                  </span>
                  <span role="columnheader" className={styles.oddsHead}>
                    {tickLabel ? 'Odds · move' : 'Odds'}
                  </span>
                  {hasNext ? (
                    <span role="columnheader" className={styles.nextHead}>
                      Week {v.week + 1}: win / lose
                    </span>
                  ) : null}
                </div>
                {g.teams.map((t, i) => (
                  <div key={t.managerId}>
                    {i === g.spots && i < g.teams.length ? (
                      <div className={styles.line} role="presentation">
                        <span>{g.name ? `Playoff line · top ${g.spots} in the ${g.name}` : paid ? `Playoff line · top ${g.spots}` : 'Playoff line'}</span>
                      </div>
                    ) : null}
                    <div className={`${styles.raceRow} ${i < g.spots ? styles.raceIn : ''}`} role="row" title={paid ? `${t.name}: ${t.odds}% playoff odds, ${t.projW}-${t.projL} projected` : t.name}>
                      <span className={styles.rank} role="cell">
                        {i + 1}
                      </span>
                      <span className={styles.who} role="cell">
                        <span className={styles.whoName}>
                          {t.name}
                          {/* A conference board already says which one. */}
                          {g.name ? null : <DivBadge div={t.div} labels={divLabels} names={v.divisions} />}
                          {t.clinched ? <span className={styles.tagIn}>Clinched</span> : null}
                          {t.eliminated ? <span className={styles.tagOut}>Out</span> : null}
                        </span>
                        <span className={styles.whoMeta}>
                          {t.w}-{t.l}
                          {t.t ? `-${t.t}` : ''} · {t.pf.toFixed(1)} pts · seed {t.seed}
                        </span>
                      </span>
                      <span className={`${styles.oddsCell}${paid ? '' : ` ${styles.blurred}`}`} role="cell" aria-hidden={!paid || undefined}>
                        <span className={styles.oddsBig}>{paid ? fmtOdds(t.odds) : `${PLACEHOLDER_ODDS[i % PLACEHOLDER_ODDS.length]}%`}</span>
                        <span className={styles.change}>{paid ? changeOf(t) : <span className={styles.up}>▲ 8</span>}</span>
                      </span>
                      <span className={`${styles.barCell}${paid ? '' : ` ${styles.blurred}`}`} role="cell" aria-hidden={!paid || undefined}>
                        <span className={styles.track}>
                          <span className={styles.fill} style={{ width: `${Math.max(1, paid ? t.odds : PLACEHOLDER_ODDS[i % PLACEHOLDER_ODDS.length])}%` }} />
                          {paid && t.before != null ? <span className={styles.tick} style={{ left: `${t.before}%` }} /> : null}
                        </span>
                      </span>
                      {hasNext ? (
                        <span className={styles.nextCell} role="cell">
                          {t.next ? (
                            <>
                              <span className={styles.nextVs}>
                                Wk {v.week + 1} v {t.next.opponent}
                              </span>
                              {paid ? (
                                <span className={styles.nextPair}>
                                  <b>{fmtOdds(t.next.ifWin)}</b> win <span aria-hidden>·</span> <b>{fmtOdds(t.next.ifLoss)}</b> lose
                                </span>
                              ) : (
                                <span className={`${styles.nextPair} ${styles.blurred}`} aria-hidden>
                                  <b>64%</b> win · <b>31%</b> lose
                                </span>
                              )}
                            </>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {raceBoards.wildcards ? (
            <p className={styles.wildcards}>
              Plus {raceBoards.wildcards} wildcard {raceBoards.wildcards === 1 ? 'spot' : 'spots'} for the best {raceBoards.wildcards === 1 ? 'record' : 'records'} left over.
            </p>
          ) : null}
          {paid && v.bigGame ? (
            <p className={styles.bigGame}>
              <span className={styles.bigGameLabel}>Week {v.week + 1}&apos;s biggest game</span>
              {nameOf.get(v.bigGame.a)} vs. {nameOf.get(v.bigGame.b)}: {v.bigGame.swing} points of playoff odds ride on it between them.
            </p>
          ) : null}
          {paid && needers.length ? (
            <div className={styles.needs}>
              <h3 className={styles.needsTitle}>What They Need</h3>
              <p className={styles.needsSub}>
                Playoff odds by how each team still in the race finishes the last {v.left === 1 ? 'week' : `${v.left} weeks`}.
              </p>
              <div className={styles.needsList}>
                {needers.map((t) => (
                  <div className={styles.needsRow} key={t.managerId}>
                    <span className={styles.needsWho}>
                      <span className={styles.needsName}>{t.name}</span>
                      <span className={styles.needsVerdict}>{needsVerdict(t)}</span>
                    </span>
                    <span className={styles.needsOdds}>
                      {t.needs!.map((x) => (
                        <span className={styles.needsCell} key={x.wins}>
                          <span className={styles.needsLabel}>{needsLabel(x)}</span>
                          {fmtOdds(x.pct)}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
              {clinched.length || out.length ? (
                <p className={styles.needsSettled}>
                  {clinched.length ? `Clinched: ${clinched.map((t) => t.name).join(', ')}.` : ''}
                  {clinched.length && out.length ? ' ' : ''}
                  {out.length ? `Out: ${out.map((t) => t.name).join(', ')}.` : ''}
                </p>
              ) : null}
            </div>
          ) : null}
          {!paid ? <UpgradeLine slug={slug} what="playoff odds, how they've moved, and what next week is worth" /> : null}
        </div>
      </section>

      {/* ── The cards ── */}
      <section className={styles.cards} aria-labelledby="cards-h">
        <div className={styles.cardsInner}>
          <div className={styles.sectionHead}>
            <h2 id="cards-h" className={styles.cardsTitle}>
              Report Cards
            </h2>
            <p className={styles.cardsSub}>
              Graded on the league&apos;s curve: where each manager ranks this season. Ordered by grade point average.
            </p>
          </div>

          <div className={styles.rolls}>
            <p className={styles.roll}>
              <span className={styles.rollLabel}>Honor roll</span>
              {honor.map((t, i) => (
                <span key={t.managerId} className={styles.rollName}>
                  {t.name} ({t.grades.overall.letter}){i < honor.length - 1 ? ', ' : ''}
                </span>
              ))}
            </p>
            {seeMe ? (
              <p className={styles.roll}>
                <span className={styles.rollLabel}>See me after class</span>
                {seeMe.name} ({seeMe.grades.overall.letter})
              </p>
            ) : null}
          </div>

          <div className={styles.grid}>
            {byGpa.map((t) => (
              <article className={styles.card} key={t.managerId}>
                <header className={styles.cardHead}>
                  <div className={styles.cardWho}>
                    <span className={styles.label}>Student</span>
                    <span className={styles.cardName}>
                      <span>{t.name}</span>
                      <DivBadge div={t.div} labels={divLabels} names={v.divisions} />
                    </span>
                    {t.team && t.team !== t.name ? <span className={styles.cardTeam}>{t.team}</span> : null}
                  </div>
                  <div className={styles.cardGrade}>
                    <span className={styles.label}>Overall</span>
                    {circled(t.grades.overall, true)}
                  </div>
                </header>

                <div className={styles.subjects}>
                  <div className={`${styles.subject} ${styles.subjectHead}`}>
                    <span>Subject</span>
                    <span>Mark</span>
                    <span>Notes</span>
                  </div>
                  {paid ? (
                    <>
                      {subjectRow('Scoring', t.grades.scoring, `${t.ppg.toFixed(1)} a week, ${ordinal(t.ranks.scoring)}`)}
                      {t.grades.lineups && t.lineup
                        ? subjectRow('Lineups', t.grades.lineups, `${Math.round(t.lineup.pct * 100)}% of possible points, ${ordinal(t.ranks.lineups ?? 0)}`)
                        : null}
                      {t.grades.moves && t.moves
                        ? subjectRow(
                            'Roster moves',
                            t.grades.moves,
                            `${Math.round(t.moves.pts)} starter pts from adds, ${ordinal(t.ranks.moves ?? 0)}`,
                          )
                        : null}
                      <div className={styles.subject}>
                        <span className={styles.subjectName}>Luck</span>
                        <span className={styles.luckMark}>{t.luck > 0 ? `+${t.luck.toFixed(1)}` : t.luck.toFixed(1)}</span>
                        <span className={styles.subjectNote}>
                          {t.w} {t.w === 1 ? 'win' : 'wins'}, scores worth {t.expectedWins.toFixed(1)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      {subjectRow('Scoring', t.grades.scoring, `${t.ppg.toFixed(1)} a week, ${ordinal(t.ranks.scoring)}`)}
                      <div className={styles.blurBlock} aria-hidden>
                        {subjectRow('Lineups', { letter: 'B+', points: 3.3 }, '89% of possible points, 4th')}
                        {subjectRow('Roster moves', { letter: 'C', points: 2 }, '74 starter pts from adds, 8th')}
                        {subjectRow('Luck', { letter: '+0.6', points: 0 }, '4 wins, scores worth 3.4')}
                      </div>
                    </>
                  )}
                </div>

                <div className={styles.comments}>
                  <span className={styles.label}>Comments</span>
                  {paid ? (
                    t.comment.map((c, i) => (
                      <p className={styles.comment} key={i}>
                        {c}
                      </p>
                    ))
                  ) : (
                    <p className={`${styles.comment} ${styles.blurred}`} aria-hidden>
                      Playoff odds are up 12 points since the last report. Has left 70 points on the bench.
                    </p>
                  )}
                </div>

                <footer className={styles.cardFoot}>
                  {paid ? (
                    <>
                      <span>Playoff odds {fmtOdds(t.odds)}</span>
                      {spark(t)}
                    </>
                  ) : (
                    <span>
                      {t.w}-{t.l}
                      {t.t ? `-${t.t}` : ''} · seed {t.seed}
                    </span>
                  )}
                </footer>
              </article>
            ))}
          </div>
          {!paid ? <UpgradeLine slug={slug} what="every subject grade, luck and the comments" /> : null}

          <div className={styles.method}>
            <h3 className={styles.methodHead}>How the Grades Work</h3>
            <ul className={styles.methodList}>
              <li>Scoring: points per game.</li>
              <li>Lineups: the share of the best possible starting lineup&apos;s points actually started.</li>
              <li>Roster moves: starter points from players who weren&apos;t on the week 1 roster, pickups and trades alike.</li>
              <li>Each is graded on where you rank in the league, from A at the top to F at the bottom. Scoring counts for half the overall grade, the other two a quarter each.</li>
              <li>Luck is a note, not a grade: wins against what your scores would have won against every team, every week.</li>
            </ul>
          </div>
        </div>
      </section>

      <footer className={styles.foot}>
        <Link href="/" className={styles.footLink}>
          The Sunday Chronicle
        </Link>
      </footer>
    </main>
  )
}

// Blurred bar widths for the free race: plausible, never the real odds.
const PLACEHOLDER_ODDS = [88, 74, 66, 58, 47, 41, 35, 29, 22, 16, 11, 6, 4, 2]

// The season as a term calendar: a rule from week 1 to the last regular
// week, inked up to this report, with a stop at every report week. Earlier
// reports link back; this one is the red-pen stop; later ones are open rings.
function TermTrack({ slug, v }: { slug: string; v: ReportView }) {
  const last = Math.max(v.lastRegularWeek, ...v.editions, v.week)
  const at = (w: number) => `${((w - 1) / Math.max(1, last - 1)) * 100}%`
  return (
    <span className={styles.term}>
      <span className={styles.termRule} aria-hidden>
        {Array.from({ length: last }, (_, i) => (
          <span key={i} className={`${styles.termTick}${i + 1 <= v.week ? ` ${styles.termTickInked}` : ''}`} style={{ left: at(i + 1) }} />
        ))}
        <span className={styles.termInk} style={{ width: at(v.week) }} />
      </span>
      <nav aria-label="Reports this season">
        {v.editions.map((w, i) => {
          const where = w === v.week ? styles.stopNow : w < v.week ? styles.stopPast : styles.stopLater
          const body = (
            <>
              <span className={styles.stopDot} />
              <span className={styles.stopWk}>Wk {w}</span>
            </>
          )
          return w < v.week ? (
            <Link key={w} className={`${styles.stop} ${where}`} style={{ left: at(w) }} href={`/leagues/${slug}/report/${w}/`} aria-label={`Report ${i + 1}, week ${w}`}>
              {body}
            </Link>
          ) : (
            <span key={w} className={`${styles.stop} ${where}`} style={{ left: at(w) }} aria-current={w === v.week ? 'page' : undefined} aria-label={`Report ${i + 1}, week ${w}${w > v.week ? ', not out yet' : ''}`}>
              {body}
            </span>
          )
        })}
      </nav>
    </span>
  )
}

function UpgradeLine({ slug, what }: { slug: string; what: string }) {
  return (
    <p className={styles.upgrade}>
      Rookie and up see {what}, from ${(TIER_PRICES.tier1.yearly.amountCents / 100).toFixed(0)} a year.{' '}
      <Link href={`/pricing?back=${encodeURIComponent(`/leagues/${slug}/report/`)}`}>See plans</Link>
    </p>
  )
}

function fmtOdds(n: number): string {
  if (n >= 99.95) return '100%'
  if (n > 0 && n < 1) return '<1%'
  if (n > 99) return '>99%'
  return `${Math.round(n)}%`
}

// A conference badge after a name: "W" or "S" for pams' Whole and Skim, the
// recap's letters and colours.
function DivBadge({ div, labels, names }: { div: number | null; labels: string[] | null; names: string[] | null }) {
  if (div == null || !labels || !names || labels[div] == null) return null
  return (
    <span className={styles.divBadge} data-div={div % 4} title={names[div]}>
      {labels[div]}
    </span>
  )
}

function changeOf(t: ReportTeam) {
  if (t.before == null) return <span className={styles.flat}>-</span>
  const d = Math.round(t.odds - t.before)
  if (d === 0) return <span className={styles.flat}>0</span>
  return d > 0 ? <span className={styles.up}>▲ {d}</span> : <span className={styles.down}>▼ {Math.abs(d)}</span>
}

// A red-pen circle round the letter, a little off true like a real one.
function circled(g: Grade, big = false) {
  const size = big ? 64 : 40
  return (
    <span className={big ? styles.markBig : styles.mark} aria-label={`Grade ${g.letter}`}>
      <svg className={styles.ring} width={size} height={size * 0.8} viewBox="0 0 100 80" aria-hidden>
        <path
          d="M52 6 C80 5 96 22 94 42 C92 63 72 75 48 74 C22 73 5 59 6 38 C7 18 26 7 56 9"
          fill="none"
          stroke="currentColor"
          strokeWidth={big ? 3.2 : 4}
          strokeLinecap="round"
        />
      </svg>
      <span className={styles.letter}>{g.letter}</span>
    </span>
  )
}

function subjectRow(name: string, g: Grade, note: string) {
  return (
    <div className={styles.subject}>
      <span className={styles.subjectName}>{name}</span>
      <span className={styles.subjectMark}>{g.letter}</span>
      <span className={styles.subjectNote}>{note}</span>
    </div>
  )
}

// Odds by week, one thin line on a 0-100 scale.
function spark(t: ReportTeam) {
  const pts = t.path
  if (pts.length < 2) return null
  const w = 96
  const h = 22
  const x = (i: number) => (i / (pts.length - 1)) * (w - 4) + 2
  const y = (o: number) => h - 2 - (o / 100) * (h - 4)
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.odds).toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]!
  return (
    <svg className={styles.spark} width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Playoff odds by week: ${pts.map((p) => `week ${p.week} ${Math.round(p.odds)}%`).join(', ')}`}>
      <line x1="2" x2={w - 2} y1={y(50)} y2={y(50)} className={styles.sparkMid} />
      <path d={d} className={styles.sparkLine} />
      <circle cx={x(pts.length - 1)} cy={y(last.odds)} r="2.5" className={styles.sparkDot} />
    </svg>
  )
}
