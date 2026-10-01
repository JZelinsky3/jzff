import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRecap } from '@/lib/recap/load'
import {
  ordinal,
  pts,
  recapSections,
  recordStr,
  seriesLine,
  type RecapGame,
  type RecapTeamCard,
} from '@/lib/recap/facts'
import { recapPageUrl } from '@/lib/recap/links'
import { TIER_PRICES } from '@/lib/stripe'
import { ShareButton } from '../../ShareButton'
import { YourWeek, type YourWeekTeam } from '../../YourWeek'
import styles from '../../recap.module.css'

export const dynamic = 'force-dynamic'

// The weekly recap, as a run of separate regions. Each region wears the
// colours of the page it summarises (the scoreboard is the site's own navy,
// Every Team is the Manager DNA lab, the lineup desk is the Best Coach
// chalkboard, the table is the power rankings' paper, next week is the
// matchup preview's departures board), so the recap reads as a tour of the
// league's site rather than a document of its own, and every region links
// to the page it came from.
//
// No site nav and no hamburger: it is opened from a group chat. The way back
// is the "View the league" button, at the top and again at the bottom.

async function loadLeague(slug: string) {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound()
  const db = createAdminClient()
  const { data } = await db.from('leagues').select('id, name, slug, owner_id, published_at').eq('slug', slug).maybeSingle()
  // Same rule as the almanac: until the owner publishes, nothing about the
  // league is public. A 404 also keeps the name and scores out of link
  // previews for a league that hasn't gone live.
  if (!data || !data.published_at) notFound()
  return data as { id: string; name: string; slug: string; owner_id: string | null }
}

function parseParams(rawYear: string, rawWeek: string): { year: number; week: number } {
  const year = Number(rawYear)
  const week = Number(rawWeek)
  if (!Number.isInteger(year) || year < 1990 || year > 2100) notFound()
  if (!Number.isInteger(week) || week < 1 || week > 18) notFound()
  return { year, week }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; year: string; week: string }>
}): Promise<Metadata> {
  const { slug, year: y, week: w } = await params
  const { year, week } = parseParams(y, w)
  const league = await loadLeague(slug)
  const db = createAdminClient()
  const { data } = await db
    .from('weekly_recaps')
    .select('intro')
    .eq('league_id', league.id)
    .eq('season_year', year)
    .eq('week', week)
    .maybeSingle()
  const title = `Week ${week} recap · ${league.name}`
  const description =
    (data?.intro as string | undefined) ?? `Final scores, the history behind them, every team's week, and what's next, from week ${week} of ${year}.`
  return {
    title,
    description,
    alternates: { canonical: recapPageUrl(slug, year, week) },
    openGraph: { type: 'article', title, description, siteName: 'The Sunday Chronicle', url: recapPageUrl(slug, year, week) },
    twitter: { card: 'summary', title, description },
  }
}

// ── Small pieces ──────────────────────────────────────────────────────────

const winnerOf = (g: RecapGame) => (g.winner === 'a' ? g.a : g.b)
const loserOf = (g: RecapGame) => (g.winner === 'a' ? g.b : g.a)

// Platform avatars are third-party URLs (Sleeper, ESPN, NFL.com), so a plain
// img: next/image would need every CDN allow-listed. A missing one falls back
// to the initial on a disc.
function Avatar({ src, name, size = 'md' }: { src: string | null; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const cls = `${styles.avatar} ${size === 'sm' ? styles.avatarSm : size === 'lg' ? styles.avatarLg : ''}`
  if (!src) {
    return (
      <span className={cls} aria-hidden>
        {name.charAt(0).toUpperCase()}
      </span>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={cls} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
}

function BandHead({ kicker, title, link }: { kicker: string; title: React.ReactNode; link?: { href: string; label: string } | null }) {
  return (
    <header className={styles.bandHead}>
      <div>
        <div className={styles.bandKicker}>{kicker}</div>
        <h2 className={styles.bandTitle}>{title}</h2>
      </div>
      {link ? (
        <a className={styles.bandLink} href={link.href}>
          {link.label}
        </a>
      ) : null}
    </header>
  )
}

const POS_COLOR: Record<string, string> = {
  QB: '#8aaccc',
  RB: '#6dc28c',
  WR: '#e29278',
  TE: '#c4a3e8',
  K: '#d4a574',
  DEF: '#8a9a8e',
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

function teamLine(t: RecapTeamCard, total: number): string {
  const rank = t.weekRank === 1 ? 'Best score of the week' : t.weekRank === total ? 'Lowest score of the week' : `${ordinal(t.weekRank)} of ${total} this week`
  return `${rank}. Beat ${t.allPlay.w} of ${total - 1} teams on points.`
}

function nextLine(t: RecapTeamCard): string | null {
  if (!t.next) return null
  const series = t.next.series ? seriesLine(t.name, t.next.opponent, t.next.series) : 'first meeting'
  const fav =
    t.next.favored != null && t.next.spread != null
      ? t.next.favored
        ? `, favored by ${pts(t.next.spread)}`
        : `, ${pts(t.next.spread)}-point underdog`
      : ''
  return `Next: ${t.next.opponent}${fav}. ${series.charAt(0).toUpperCase()}${series.slice(1)}.`
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function RecapPage({
  params,
}: {
  params: Promise<{ slug: string; year: string; week: string }>
}) {
  const { slug, year: y, week: w } = await params
  const { year, week } = parseParams(y, w)
  const league = await loadLeague(slug)
  const loaded = await loadRecap(league, year, week)
  const leagueHref = `/leagues/${slug}/`

  const topBar = (
    <div className={styles.topBar}>
      <a className={styles.topLeague} href={leagueHref}>
        {league.name}
      </a>
      <a className={styles.viewLeague} href={leagueHref}>
        View the league
      </a>
    </div>
  )

  if (loaded.status !== 'ok') {
    const message =
      loaded.status === 'not-final'
        ? `Week ${week} isn't over yet. The recap shows up the Tuesday after Monday night.`
        : loaded.status === 'held'
          ? `Week ${week} isn't fully scored on the platform yet. The recap will show up once it is.`
          : `There are no week ${week} games on the books for ${year}.`
    return (
      <div className={styles.page}>
        <section className={`${styles.band} ${styles.bandMast}`}>
          <div className={styles.bandInner}>
            {topBar}
            <h1 className={styles.mastTitle}>
              Week <em>{week}</em>
            </h1>
            <p className={styles.emptyNote}>{message}</p>
            {week > 1 ? (
              <a className={styles.bandLink} href={`/leagues/${slug}/recap/${year}/${week - 1}/`}>
                Week {week - 1} recap
              </a>
            ) : null}
          </div>
        </section>
      </div>
    )
  }

  const { facts: f, intro, tier } = loaded
  // The owner's plan today decides what shows, even on a recap that was
  // built when they were on a bigger one.
  const show = recapSections(tier)
  const shareUrl = recapPageUrl(slug, year, week, 'share')
  const rookiePrice = `$${(TIER_PRICES.tier1.yearly.amountCents / 100).toFixed(0)} a year`
  const total = f.teams.length
  const weekLabel = f.phase === 'playoffs' ? 'Playoffs, week' : 'Week'

  const yourTeams: YourWeekTeam[] = f.teams.map((t) => ({
    managerId: t.managerId,
    profileId: t.profileId,
    name: t.name,
    team: t.team,
    avatar: t.avatar,
    score: pts(t.score),
    result: t.result,
    line: `${t.result === 'W' ? 'Beat' : t.result === 'L' ? 'Lost to' : 'Played'} ${t.opponent ?? ''}${t.opponentScore != null ? `, ${pts(t.opponentScore)}` : ''}. ${teamLine(t, total)}`,
    note: t.note,
    next: nextLine(t),
  }))

  const jumps: { id: string; label: string }[] = [
    { id: 'scores', label: 'Scores' },
    { id: 'awards', label: 'Awards' },
    { id: 'teams', label: 'Every team' },
    ...(show.paid && f.lineups ? [{ id: 'lineups', label: 'Lineups' }] : []),
    ...(f.standings?.length ? [{ id: 'table', label: 'Table' }] : []),
    ...(f.next?.games.length ? [{ id: 'next', label: `Week ${f.next.week}` }] : []),
  ]

  const history = [...(show.paid ? f.records ?? [] : [])]

  return (
    <div className={styles.page}>
      {/* ── Masthead: the site's own navy ── */}
      <section className={`${styles.band} ${styles.bandMast}`}>
        <div className={styles.bandInner}>
          {topBar}
          <div className={styles.mastKicker}>
            The recap · {f.year} season
          </div>
          <h1 className={styles.mastTitle}>
            {weekLabel} <em>{week}</em>
          </h1>
          {f.hooks.length ? (
            <ul className={styles.hooks}>
              {f.hooks.slice(0, 3).map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          ) : null}
          <p className={styles.lede}>{intro}</p>
          <YourWeek slug={slug} teams={yourTeams} />
          <nav className={styles.jumps} aria-label="Sections">
            {jumps.map((j) => (
              <a key={j.id} href={`#${j.id}`}>
                {j.label}
              </a>
            ))}
          </nav>
        </div>
      </section>

      {/* ── Scoreboard ── */}
      <section id="scores" className={`${styles.band} ${styles.bandScores}`}>
        <div className={styles.bandInner}>
          <BandHead kicker="The scoreboard" title="Final scores" />
          <div className={styles.games}>
            {f.games.map((g, i) => {
              const decided = g.winner === 'a' || g.winner === 'b'
              const first = decided ? winnerOf(g) : g.a
              const second = decided ? loserOf(g) : g.b
              const tag =
                g.kind === 'championship' ? 'Championship' : g.kind === 'playoff' ? 'Playoffs' : g.kind === 'consolation' ? 'Consolation' : null
              let legNote: string | null = null
              if (g.leg?.n === 1) legNote = 'First leg of two. Decided next week.'
              else if (g.leg?.n === 2 && g.leg.totalA != null && g.leg.totalB != null) {
                const [wt, lt] = g.winner === 'a' ? [g.leg.totalA, g.leg.totalB] : [g.leg.totalB, g.leg.totalA]
                legNote = `Two-week total ${pts(wt)} to ${pts(lt)}.`
              } else if (g.winner === 'tie') legNote = 'Tie.'
              const hot = !!g.seriesNote && / snaps | has now won |First meeting/.test(g.seriesNote)
              return (
                <article key={i} className={styles.game}>
                  {tag ? <div className={styles.gameTag}>{tag}</div> : null}
                  {[first, second].map((s, j) => (
                    <div key={s.managerId} className={`${styles.gameSide} ${decided && j === 0 ? styles.won : ''}`}>
                      <Avatar src={s.avatar} name={s.name} size="sm" />
                      <span className={styles.gameName}>
                        {s.name}
                        {s.team && s.team !== s.name ? <small>{s.team}</small> : null}
                      </span>
                      <span className={styles.gameScore}>{pts(s.score)}</span>
                    </div>
                  ))}
                  <footer className={styles.gameFoot}>
                    {decided ? <span className={styles.margin}>By {pts(g.margin)}</span> : null}
                    {legNote ? <span>{legNote}</span> : null}
                    {g.series ? <span>{seriesLine(g.a.name, g.b.name, g.series)}</span> : null}
                  </footer>
                  {hot ? <p className={styles.gameNote}>{g.seriesNote}</p> : null}
                </article>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Awards: the awards sheet's buff stock ── */}
      {f.awards.length ? (
        <section id="awards" className={`${styles.band} ${styles.bandAwards}`}>
          <div className={styles.bandInner}>
            <BandHead kicker="Decided by the numbers" title={<>The week&apos;s <em>awards</em></>} />
            <div className={styles.awards}>
              {f.awards.map((a, i) => (
                <div key={a.key} className={`${styles.award} ${i === 0 ? styles.awardLead : ''}`}>
                  <div className={styles.awardTitle}>{a.title}</div>
                  <div className={styles.awardValue}>{a.value}</div>
                  <div className={styles.awardWho}>{a.who}</div>
                  <div className={styles.awardDetail}>{a.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Record book: records watch ── */}
      {history.length || (show.paid && f.milestones?.length) ? (
        <section className={`${styles.band} ${styles.bandRecords}`}>
          <div className={styles.bandInner}>
            <BandHead
              kicker="From the record book"
              title={<>League <em>history</em></>}
              link={{ href: `/leagues/${slug}/live/records-watch/`, label: 'Records watch' }}
            />
            {history.length ? (
              <ul className={styles.recordList}>
                {history.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : null}
            {show.paid && f.milestones?.length ? (
              <div className={styles.milestones}>
                {f.milestones.map((m) => (
                  <div key={`${m.name}-${m.text}`} className={styles.milestone}>
                    <span className={styles.milestoneKicker}>Milestone</span>
                    <b>{m.name}</b> {m.text}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ── Every team: the Manager DNA lab ── */}
      <section id="teams" className={`${styles.band} ${styles.bandTeams}`}>
        <div className={styles.bandInner}>
          <BandHead kicker="Find yourself" title={<>Every <em>team</em></>} />
          <div className={styles.teams}>
            {f.teams.map((t) => (
              <article key={t.managerId} id={`team-${t.managerId}`} className={styles.team}>
                <header className={styles.teamHead}>
                  <Avatar src={t.avatar} name={t.name} />
                  <div className={styles.teamWho}>
                    <span className={styles.teamName}>{t.name}</span>
                    {t.team && t.team !== t.name ? <span className={styles.teamTeam}>{t.team}</span> : null}
                    {show.veteran && t.archetype ? <span className={styles.archetype}>{t.archetype}</span> : null}
                  </div>
                  <div className={styles.teamScore} data-result={t.result ?? undefined}>
                    {pts(t.score)}
                    {t.result ? <em>{t.result}</em> : null}
                  </div>
                </header>
                <p className={styles.teamLine}>
                  {t.result === 'W' ? 'Beat' : t.result === 'L' ? 'Lost to' : 'Played'} {t.opponent}
                  {t.opponentScore != null ? `, ${pts(t.opponentScore)}` : ''}. {teamLine(t, total)}
                </p>
                {t.note ? <p className={styles.teamNote}>{t.note}</p> : null}
                <dl className={styles.teamStats}>
                  {t.record ? (
                    <div>
                      <dt>Record</dt>
                      <dd>
                        {t.record}
                        {t.place ? <small> · {ordinal(t.place)}</small> : null}
                      </dd>
                    </div>
                  ) : null}
                  {t.streak ? (
                    <div>
                      <dt>Streak</dt>
                      <dd>
                        {t.streak.kind}
                        {t.streak.length}
                      </dd>
                    </div>
                  ) : null}
                  {show.paid && t.power ? (
                    <div>
                      <dt>Power</dt>
                      <dd>
                        {ordinal(t.power.rank)}
                        {t.power.delta ? <small className={t.power.delta > 0 ? styles.up : styles.down}> {signed(t.power.delta)}</small> : null}
                      </dd>
                    </div>
                  ) : null}
                  {show.paid && t.odds ? (
                    <div>
                      <dt>Playoffs</dt>
                      <dd>{Math.round(t.odds.now)}%</dd>
                    </div>
                  ) : null}
                </dl>
                {t.series && t.opponent ? (
                  <p className={styles.teamSeries}>{seriesLine(t.name, t.opponent, t.series)}.</p>
                ) : null}
                {nextLine(t) ? <p className={styles.teamNext}>{nextLine(t)}</p> : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Lineup desk: the Best Coach chalkboard ── */}
      {show.paid && f.lineups ? (
        <section id="lineups" className={`${styles.band} ${styles.bandLineups}`}>
          <div className={styles.bandInner}>
            <BandHead
              kicker="The lineup desk"
              title={<>Who started <em>who</em></>}
              link={show.veteran ? { href: `/leagues/${slug}/live/best-coach/`, label: 'Coach standings' } : null}
            />
            {f.lineups.mvps.length ? (
              <div className={styles.mvps}>
                {f.lineups.mvps.map((m) => (
                  <div key={m.pos} className={styles.mvp} style={{ ['--pos' as string]: POS_COLOR[m.pos] ?? '#ece4cc' }}>
                    <span className={styles.mvpPos}>{m.pos}</span>
                    <span className={styles.mvpPlayer}>{m.player}</span>
                    <span className={styles.mvpPts}>{pts(m.points)}</span>
                    <span className={styles.mvpMgr}>{m.manager}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className={styles.desk}>
              {f.lineups.efficiency ? (
                <>
                  <div className={styles.deskItem}>
                    <span className={styles.deskLabel}>Best lineup</span>
                    <span className={styles.deskValue}>{f.lineups.efficiency.best.pct}%</span>
                    <span className={styles.deskWho}>
                      {f.lineups.efficiency.best.name}
                      {f.lineups.efficiency.best.left === 0 ? ', a perfect week' : `, ${pts(f.lineups.efficiency.best.left)} off perfect`}
                    </span>
                  </div>
                  <div className={styles.deskItem}>
                    <span className={styles.deskLabel}>Most left on the bench</span>
                    <span className={styles.deskValue}>{pts(f.lineups.efficiency.worst.left)}</span>
                    <span className={styles.deskWho}>
                      {f.lineups.efficiency.worst.name}, started {f.lineups.efficiency.worst.pct}% of the best
                    </span>
                  </div>
                </>
              ) : null}
              {f.lineups.benchBest ? (
                <div className={styles.deskItem}>
                  <span className={styles.deskLabel}>Best player on a bench</span>
                  <span className={styles.deskValue}>{pts(f.lineups.benchBest.points)}</span>
                  <span className={styles.deskWho}>
                    {f.lineups.benchBest.player}
                    {f.lineups.benchBest.pos ? ` (${f.lineups.benchBest.pos})` : ''}, sat by {f.lineups.benchBest.manager}
                  </span>
                </div>
              ) : null}
              {f.lineups.projections ? (
                <>
                  <div className={styles.deskItem}>
                    <span className={styles.deskLabel}>Beat the projection</span>
                    <span className={styles.deskValue}>{signed(Number(pts(f.lineups.projections.over.actual - f.lineups.projections.over.projected)))}</span>
                    <span className={styles.deskWho}>
                      {f.lineups.projections.over.name}, {pts(f.lineups.projections.over.actual)} on a {pts(f.lineups.projections.over.projected)} projection
                    </span>
                  </div>
                  <div className={styles.deskItem}>
                    <span className={styles.deskLabel}>Missed the projection</span>
                    <span className={styles.deskValue}>{pts(f.lineups.projections.under.actual - f.lineups.projections.under.projected)}</span>
                    <span className={styles.deskWho}>
                      {f.lineups.projections.under.name}, {pts(f.lineups.projections.under.actual)} on a {pts(f.lineups.projections.under.projected)} projection
                    </span>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* ── The table: the power rankings' paper ── */}
      {f.standings?.length ? (
        <section id="table" className={`${styles.band} ${styles.bandTable}`}>
          <div className={styles.bandInner}>
            <BandHead
              kicker="Where it stands"
              title={<>The <em>table</em></>}
              link={show.paid && f.power?.length ? { href: `/leagues/${slug}/live/powerrank/`, label: 'Power rankings' } : { href: `/leagues/${slug}/standings`, label: 'Standings' }}
            />
            <div className={styles.tableGrid}>
              <div>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th />
                      <th className={styles.left}>Team</th>
                      <th>Record</th>
                      <th>PF</th>
                      {show.paid && f.standings.some((s) => s.odds != null) ? <th>Playoffs</th> : null}
                      <th>Move</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.standings.map((s, i) => (
                      <tr key={s.managerId} className={show.paid && f.playoffTeams && i === f.playoffTeams - 1 ? styles.cutLine : undefined}>
                        <td className={styles.rank}>{s.rank}</td>
                        <td className={styles.left}>
                          <span className={styles.tableTeam}>
                            <Avatar src={s.avatar} name={s.name} size="sm" />
                            {s.name}
                          </span>
                        </td>
                        <td>{recordStr(s.wins, s.losses, s.ties)}</td>
                        <td>{pts(s.pf)}</td>
                        {show.paid && f.standings!.some((x) => x.odds != null) ? (
                          <td>{s.odds != null ? `${Math.round(s.odds)}%` : ''}</td>
                        ) : null}
                        <td className={s.change && s.change > 0 ? styles.up : s.change && s.change < 0 ? styles.down : styles.flat}>
                          {s.change == null || s.change === 0 ? '·' : signed(s.change)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className={styles.fine}>
                  By record, then points for{show.paid && f.playoffTeams ? `. The rule marks the ${f.playoffTeams}-team playoff line` : ''}.
                </p>
              </div>
              {show.paid && f.power?.length ? (
                <div className={styles.powerCol}>
                  <div className={styles.podium}>
                    {f.power.slice(0, 3).map((p) => (
                      <div key={p.name} className={styles.podiumStep} data-rank={p.rank}>
                        <Avatar src={p.avatar} name={p.name} size="lg" />
                        <span className={styles.podiumRank}>{p.rank}</span>
                        <span className={styles.podiumName}>{p.name}</span>
                        <span className={styles.podiumRec}>{p.record}</span>
                      </div>
                    ))}
                  </div>
                  <ol className={styles.powerList} start={4}>
                    {f.power.slice(3).map((p) => (
                      <li key={p.name}>
                        <span>{p.name}</span>
                        <span className={p.delta > 0 ? styles.up : p.delta < 0 ? styles.down : styles.flat}>
                          {p.delta === 0 ? '·' : signed(p.delta)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
            {f.streaks.length ? (
              <p className={styles.streakLine}>
                {f.streaks.map((s) => `${s.name} has ${s.kind === 'W' ? 'won' : 'lost'} ${s.length} straight`).join('. ')}.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ── Pick'ems ── */}
      {show.paid && f.pickems ? (
        <section className={`${styles.band} ${styles.bandPickems}`}>
          <div className={styles.bandInner}>
            <BandHead kicker="Pick'ems" title={<>Who called <em>it</em></>} link={{ href: `/leagues/${slug}/live/pickems/`, label: "Pick'ems" }} />
            <div className={styles.pickGrid}>
              <div className={styles.pickBest}>
                <span className={styles.pickLabel}>Best of week {week}</span>
                <span className={styles.pickNames}>{f.pickems.best.map((b) => b.name).join(', ')}</span>
                <span className={styles.pickRec}>
                  {f.pickems.best[0].right}-{f.pickems.best[0].wrong}
                </span>
              </div>
              <div className={styles.pickLeaders}>
                <span className={styles.pickLabel}>Season leaders</span>
                <ol>
                  {f.pickems.leaders.map((l) => (
                    <li key={l.name}>
                      <span>{l.name}</span>
                      <span>
                        {l.right}-{l.wrong}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            {f.pickems.crowd ? <p className={styles.pickCrowd}>{f.pickems.crowd}</p> : null}
          </div>
        </section>
      ) : null}

      {/* ── Trades: the trade desk ── */}
      {show.veteran && (f.trades?.length || f.verdicts?.length) ? (
        <section className={`${styles.band} ${styles.bandTrades}`}>
          <div className={styles.bandInner}>
            <BandHead kicker="The wire" title={<>Trades</>} link={{ href: `/leagues/${slug}/live/trades/`, label: 'Trade desk' }} />
            {f.trades?.map((t, i) => (
              <article key={i} className={styles.trade}>
                <h3>{t.headline}</h3>
                <ul>
                  {t.sides.map((s) => (
                    <li key={s.manager}>
                      <b>{s.manager}</b> gets {s.gets.join(', ') || 'nothing listed'}
                    </li>
                  ))}
                </ul>
                {t.summary ? <p>{t.summary}</p> : null}
              </article>
            ))}
            {f.verdicts?.length ? (
              <div className={styles.verdicts}>
                <span className={styles.pickLabel}>Four weeks later</span>
                {f.verdicts.map((v, i) => (
                  <p key={i}>
                    <b>{v.headline}.</b> {v.summary}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ── Next week: the matchup preview's departures board ── */}
      {f.next?.games.length ? (
        <section id="next" className={`${styles.band} ${styles.bandNext}`}>
          <div className={styles.bandInner}>
            <BandHead
              kicker="Now boarding"
              title={<>Week <em>{f.next.week}</em></>}
              link={show.paid ? { href: `/leagues/${slug}/live/matchup-preview/`, label: 'Matchup preview' } : null}
            />
            <div className={styles.board}>
              {f.next.games.map((g, i) => (
                <article key={i} className={`${styles.departure} ${g.gotw ? styles.gotw : ''}`}>
                  <div className={styles.depCode}>
                    {show.paid && g.code ? g.code : `${f.next!.week}.${String(i + 1).padStart(2, '0')}`}
                    {g.gotw && show.paid ? <span>Game of the week</span> : null}
                  </div>
                  <div className={styles.depTeams}>
                    {[g.a, g.b].map((s, j) => (
                      <div key={j} className={styles.depSide}>
                        <Avatar src={s.avatar} name={s.name} size="sm" />
                        <span className={styles.depName}>{s.name}</span>
                        {s.record ? <span className={styles.depRec}>{s.record}</span> : null}
                      </div>
                    ))}
                  </div>
                  <div className={styles.depFoot}>
                    {show.paid && g.spread != null && g.favorite ? (
                      <span className={styles.depLine}>
                        {(g.favorite === 'a' ? g.a : g.b).name} by {pts(g.spread)}
                      </span>
                    ) : null}
                    <span>{g.series ? seriesLine(g.a.name, g.b.name, g.series) : 'First meeting'}</span>
                  </div>
                </article>
              ))}
            </div>
            {show.paid && (f.next.milestones?.length || f.next.picksLockAt) ? (
              <div className={styles.nextNotes}>
                {f.next.milestones?.map((m) => (
                  <p key={m}>{m}</p>
                ))}
                {f.next.picksLockAt ? (
                  <a className={styles.bandLink} href={`/leagues/${slug}/live/pickems/`}>
                    Make your picks, they lock{' '}
                    {new Date(f.next.picksLockAt).toLocaleString('en-US', {
                      weekday: 'long',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZone: 'America/New_York',
                    })}{' '}
                    ET
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ── Free: what the full recap adds ── */}
      {!show.paid ? (
        <section className={`${styles.band} ${styles.bandUpsell}`}>
          <div className={styles.bandInner}>
            <p>
              This is the short version. The full recap adds league records, power rankings and playoff odds,
              pick&apos;ems, the lineup desk and next week&apos;s lines. Rookie is {rookiePrice} for the league.
            </p>
            <Link className={styles.viewLeague} href="/pricing/?utm_source=recap&utm_medium=page">
              See plans
            </Link>
          </div>
        </section>
      ) : null}

      {/* ── Footer: back to the league ── */}
      <section className={`${styles.band} ${styles.bandFoot}`}>
        <div className={styles.bandInner}>
          <div className={styles.footActions}>
            <a className={`${styles.viewLeague} ${styles.viewLeagueBig}`} href={leagueHref}>
              View the {league.name} almanac
            </a>
            <ShareButton className={styles.shareBtn} url={shareUrl} title={`Week ${week} recap · ${league.name}`} />
          </div>
          <nav className={styles.footNav}>
            {week > 1 ? <a href={`/leagues/${slug}/recap/${year}/${week - 1}/`}>Week {week - 1} recap</a> : <span />}
            <Link href="/?utm_source=recap&utm_medium=page&utm_campaign=new-league">Run another league? Start its book free</Link>
          </nav>
          <p className={styles.fine}>
            The Sunday Chronicle · scores as of{' '}
            {new Date(f.generatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/New_York' })}
          </p>
        </div>
      </section>
    </div>
  )
}
