import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRecap, recapViewable } from '@/lib/recap/load'
import { ordinal, pts, recapSections, recordStr, type RecapGame } from '@/lib/recap/facts'
import { bookLine, poss, writeEdition } from '@/lib/recap/story'
import { recapPageUrl } from '@/lib/recap/links'
import { TIER_PRICES } from '@/lib/stripe'
import { ShareButton } from '../../ShareButton'
import { YourWeek, type YourWeekTeam } from '../../YourWeek'
import { SectionNav } from '../../SectionNav'
import styles from '../../recap.module.css'

export const dynamic = 'force-dynamic'

// The weekly recap as the league's paper, the morning after: a front page
// with the week's story and the scoreboard, a written story for every game,
// the record book, the standings, and next week's card. One newsprint house
// from top to bottom, so it reads as one paper rather than clippings from the
// site's other pages. All of the writing is in lib/recap/story.ts.
//
// No site nav and no hamburger: it is opened from a group chat. The way back
// is the "View the league" button, at the top and again at the bottom.

async function loadLeague(slug: string) {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound()
  const db = createAdminClient()
  const { data } = await db.from('leagues').select('id, name, slug, owner_id, published_at').eq('slug', slug).maybeSingle()
  // Same rule as the almanac: until the owner publishes, nothing about the
  // league is public, except to the owner. A 404 also keeps the name and
  // scores out of link previews for a league that hasn't gone live.
  if (!data || !(await recapViewable(data))) notFound()
  return data as { id: string; name: string; slug: string; owner_id: string | null; published_at: string | null }
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
    .select('intro, subject')
    .eq('league_id', league.id)
    .eq('season_year', year)
    .eq('week', week)
    .maybeSingle()
  const title = `Week ${week} recap · ${league.name}`
  const description =
    (data?.intro as string | undefined) ?? `The week ${week} paper for ${league.name}: every game, the history behind it, and what's next.`
  return {
    title,
    description,
    ...(league.published_at ? {} : { robots: { index: false, follow: false } }),
    alternates: { canonical: recapPageUrl(slug, year, week) },
    openGraph: { type: 'article', title, description, siteName: 'The Sunday Chronicle', url: recapPageUrl(slug, year, week) },
    twitter: { card: 'summary', title, description },
  }
}

// ── Small pieces ──────────────────────────────────────────────────────────

const winnerOf = (g: RecapGame) => (g.winner === 'b' ? g.b : g.a)
const loserOf = (g: RecapGame) => (g.winner === 'b' ? g.a : g.b)
const isDecided = (g: RecapGame) => g.winner === 'a' || g.winner === 'b'

// Platform avatars are third-party URLs (Sleeper, ESPN, NFL.com), so a plain
// img: next/image would need every CDN allow-listed. A missing one falls back
// to the initial on a disc.
function Avatar({ src, name, size = 'md' }: { src: string | null; name: string; size?: 'sm' | 'md' }) {
  const cls = `${styles.avatar} ${size === 'sm' ? styles.avatarSm : ''}`
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

// Every section opens on a flag (the small tag over the title) and its own
// stock, so the eye can tell where one topic stops and the next starts.
function SectionHead({
  id,
  tag,
  title,
  link,
}: {
  id?: string
  tag: string
  title: string
  link?: { href: string; label: string } | null
}) {
  return (
    <header className={styles.sectionHead} id={id}>
      <div>
        <div className={styles.sectionTag}>{tag}</div>
        <h2>{title}</h2>
      </div>
      {link ? (
        <a className={styles.sectionLink} href={link.href}>
          {link.label}
        </a>
      ) : null}
    </header>
  )
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

function editionDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  })
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
        The Sunday Chronicle
      </a>
      <a className={styles.viewLeague} href={leagueHref}>
        View the league
      </a>
    </div>
  )

  if (loaded.status !== 'ok') {
    const message =
      loaded.status === 'not-final'
        ? `Week ${week} isn't over yet. The paper comes out the Tuesday after Monday night.`
        : loaded.status === 'held'
          ? `Week ${week} isn't fully scored on the platform yet. The paper comes out once it is.`
          : `There are no week ${week} games on the books for ${year}.`
    return (
      <div className={styles.page}>
        <div className={styles.sheet}>
          {topBar}
          <header className={styles.mast}>
            <h1 className={styles.nameplate}>{league.name}</h1>
            <div className={styles.dateline}>
              <span>Week {week}</span>
              <span>{year} season</span>
            </div>
          </header>
          <p className={styles.emptyNote}>{message}</p>
          {week > 1 ? (
            <a className={styles.sectionLink} href={`/leagues/${slug}/recap/${year}/${week - 1}/`}>
              Week {week - 1} paper
            </a>
          ) : null}
        </div>
      </div>
    )
  }

  const { facts: f, tier } = loaded
  // The owner's plan today decides what shows, even on a recap that was
  // built when they were on a bigger one.
  const show = recapSections(tier)
  // A stored recap built on a bigger plan still carries the paid facts;
  // strip them before writing so the words match what the page shows.
  const facts = show.paid
    ? show.veteran
      ? f
      : { ...f, trades: undefined, verdicts: undefined }
    : { ...f, book: undefined, starts: undefined, yearAgo: undefined, weekRecord: undefined, star: undefined, power: undefined, pickems: undefined, milestones: undefined, trades: undefined, verdicts: undefined }
  const edition = writeEdition(facts)
  const { front } = edition
  const shareUrl = recapPageUrl(slug, year, week, 'share')
  const rookiePrice = `$${(TIER_PRICES.tier1.yearly.amountCents / 100).toFixed(0)} a year`
  const weekLabel = f.phase === 'playoffs' ? `Playoffs, week ${week}` : `Week ${week}`
  const cardOf = new Map(f.teams.map((t) => [t.managerId, t]))

  const yourTeams: YourWeekTeam[] = f.teams.map((t) => {
    const s = edition.stories.find((x) => x.game.a.managerId === t.managerId || x.game.b.managerId === t.managerId)
    const next = t.next
      ? `Next: ${t.next.opponent}${
          show.paid && t.next.favored != null && t.next.spread != null
            ? t.next.favored
              ? `, favored by ${pts(t.next.spread)}`
              : `, a ${pts(t.next.spread)}-point underdog`
            : ''
        }`
      : null
    return {
      managerId: t.managerId,
      profileId: t.profileId,
      name: t.name,
      avatar: t.avatar,
      score: pts(t.score),
      result: t.result,
      standing: [t.record, t.place ? `${ordinal(t.place)} place` : null].filter(Boolean).join(' · ') || null,
      anchor: s?.anchor ?? null,
      headline: s?.headline ?? null,
      next,
    }
  })

  const hasStandings = !!f.standings?.length
  const hasOdds = show.paid && !!f.standings?.some((s) => s.odds != null)
  const hasPower = show.paid && f.teams.some((t) => t.power)
  const book = show.paid ? (facts.book ?? []) : []
  const jumps: { id: string; label: string }[] = [
    { id: 'games', label: 'Results' },
    ...(book.length ? [{ id: 'book', label: 'Record book' }] : []),
    ...(hasStandings ? [{ id: 'standings', label: 'Standings' }] : []),
    ...(show.paid && facts.pickems ? [{ id: 'pickems', label: "Pick'ems" }] : []),
    ...(show.veteran && (facts.trades?.length || facts.verdicts?.length) ? [{ id: 'trades', label: 'Trades' }] : []),
    ...(edition.previews.length ? [{ id: 'next', label: `Week ${f.next!.week}` }] : []),
  ]

  return (
    <div className={styles.page}>
      <div className={styles.sheet}>
        {topBar}

        {/* ── Masthead ── */}
        <header className={styles.mast}>
          <div className={styles.mastKicker}>The {weekLabel.toLowerCase()} paper</div>
          <h1 className={styles.nameplate}>{f.league.name}</h1>
          <div className={styles.dateline}>
            <span>{editionDate(f.generatedAt)}</span>
            <span>{weekLabel}</span>
          </div>
        </header>

        {/* ── Front page ── */}
        <section className={styles.front}>
          <article className={styles.lead}>
            <h2 className={styles.headline}>{front.headline}</h2>
            {front.deck ? <p className={styles.deck}>{front.deck}</p> : null}
            {show.paid && facts.star ? (
              <div className={styles.starStrip}>
                <span className={styles.starLabel}>Player of the week</span>
                <span className={styles.starName}>{facts.star.player}</span>
                <span className={styles.starMeta}>
                  {facts.star.pos ? `${facts.star.pos} · ` : ''}
                  {pts(facts.star.points)} pts · {facts.star.manager}
                </span>
              </div>
            ) : null}
            <div className={styles.byline}>
              By the Chronicle staff <span>· Filed after Monday night</span>
            </div>
            <div className={styles.leadBody}>
              {front.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </article>

          <aside className={styles.rail}>
            <YourWeek slug={slug} teams={yourTeams} />
          </aside>
        </section>

        <SectionNav links={jumps} />

        {/* ── The games ── */}
        <section className={`${styles.section} ${styles.sGames}`}>
          <SectionHead id="games" tag="Results" title="The Games" />
          <div className={styles.stories}>
            {edition.stories.map((s) => {
              const g = s.game
              const decided = isDecided(g)
              const sides = decided ? [winnerOf(g), loserOf(g)] : [g.a, g.b]
              return (
                <article key={s.anchor} id={s.anchor} className={styles.story}>
                  <div className={`${styles.kicker} ${s.kicker ? '' : styles.kickerEmpty}`} aria-hidden={!s.kicker}>
                    {s.kicker}
                  </div>
                  <h3 className={styles.storyHead}>{s.headline}</h3>
                  <div className={styles.storyScore}>
                    {sides.map((side, j) => (
                      <span key={side.managerId} className={`${styles.storySide} ${decided && j === 0 ? styles.won : ''}`}>
                        <Avatar src={side.avatar} name={side.name} size="sm" />
                        <span className={styles.storyName}>
                          {side.name}
                          {cardOf.get(side.managerId)?.record && f.phase === 'regular' ? <small>{cardOf.get(side.managerId)!.record}</small> : null}
                        </span>
                        <span className={styles.storyNum}>{pts(side.score)}</span>
                      </span>
                    ))}
                  </div>
                  <p className={styles.storyBody}>{s.body}</p>
                </article>
              )
            })}
          </div>
        </section>

        {/* ── Record book ── */}
        {book.length || (show.paid && facts.weekRecord) || (show.paid && facts.milestones?.length) ? (
          <section className={`${styles.section} ${styles.sBook}`}>
            <SectionHead id="book" tag="History" title="The Record Book" link={{ href: `/leagues/${slug}/live/records-watch/`, label: 'Records watch' }} />
            <div className={styles.book}>
              {book.map((r) => (
                <div key={r.key} className={`${styles.bookRow} ${r.rank <= 10 ? styles.bookHot : ''}`}>
                  <span className={styles.bookLabel}>{r.label}</span>
                  <span className={styles.bookValue}>
                    {r.key === 'closest' || r.key === 'blowout' ? `by ${pts(r.value)}` : pts(r.value)}
                  </span>
                  <span className={styles.bookWho}>
                    {r.who}
                    {r.vs ? <> {r.key === 'heartbreak' ? 'vs' : 'over'} {r.vs}</> : null}
                  </span>
                  <span className={styles.bookLine}>
                    {bookLine(r, facts)}
                    {r.record && r.rank > 1 && r.rank <= 10 ? `. Record: ${r.record.who}, ${pts(r.record.value)} in ${r.record.year}` : ''}
                  </span>
                </div>
              ))}
              {show.paid && facts.weekRecord && !facts.weekRecord.isNew ? (
                <div className={`${styles.bookRow} ${styles.bookAllTime}`}>
                  <span className={styles.bookLabel}>All-time week {week} record</span>
                  <span className={styles.bookValue}>{pts(facts.weekRecord.value)}</span>
                  <span className={styles.bookWho}>{facts.weekRecord.who}</span>
                  <span className={styles.bookLine}>
                    Set in {facts.weekRecord.year} and still standing.{f.top ? ` This week's best was ${pts(f.top.score)}.` : ''}
                  </span>
                </div>
              ) : null}
            </div>
            {show.paid && facts.milestones?.length ? (
              <ul className={styles.milestones}>
                {facts.milestones.map((m) => (
                  <li key={`${m.name}-${m.text}`}>
                    <b>{m.name}</b> {m.text}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {/* ── Standings, with the power rankings folded in ── */}
        {hasStandings ? (
          <section className={`${styles.section} ${styles.sTable}`}>
            <SectionHead
              id="standings"
              tag="The table"
              title="The Standings"
              link={hasPower ? { href: `/leagues/${slug}/live/powerrank/`, label: 'Power rankings' } : { href: `/leagues/${slug}/standings`, label: 'Standings' }}
            />
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th />
                    <th className={styles.left}>Team</th>
                    <th>W-L</th>
                    <th>PF</th>
                    <th>Strk</th>
                    {hasPower ? <th>Power</th> : null}
                    {hasOdds ? <th className={styles.left}>Playoffs</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {f.standings!.map((s, i) => {
                    const card = cardOf.get(s.managerId)
                    const cut = show.paid && f.playoffTeams && i === f.playoffTeams - 1
                    return (
                      <tr key={s.managerId} className={cut ? styles.cutLine : undefined}>
                        <td className={styles.rank}>
                          {s.rank}
                          {s.change ? <small className={s.change > 0 ? styles.up : styles.down}>{s.change > 0 ? '▲' : '▼'}</small> : null}
                        </td>
                        <td className={styles.left}>
                          <span className={styles.tableTeam}>
                            <Avatar src={s.avatar} name={s.name} size="sm" />
                            <span className={styles.tableName}>{s.name}</span>
                          </span>
                        </td>
                        <td>{recordStr(s.wins, s.losses, s.ties)}</td>
                        <td>{pts(s.pf)}</td>
                        <td>{card?.streak ? `${card.streak.kind}${card.streak.length}` : <span className={styles.noStreak}>-</span>}</td>
                        {hasPower ? (
                          <td>
                            {card?.power ? (
                              <>
                                {card.power.rank}
                                {card.power.delta ? (
                                  <small className={card.power.delta > 0 ? styles.up : styles.down}> {signed(card.power.delta)}</small>
                                ) : null}
                              </>
                            ) : (
                              ''
                            )}
                          </td>
                        ) : null}
                        {hasOdds ? (
                          <td className={styles.left}>
                            {s.odds != null ? (
                              <span className={styles.odds}>
                                <span className={styles.oddsBar}>
                                  <span style={{ width: `${Math.max(2, Math.round(s.odds))}%` }} />
                                </span>
                                {Math.round(s.odds)}%
                              </span>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className={styles.fine}>
              Ranked by record, then points for. The arrow is the move since last week
              {hasPower ? '; Power is the power ranking, with its weekly move' : ''}
              {show.paid && f.playoffTeams ? `. The rule marks the ${f.playoffTeams}-team playoff line` : ''}.
            </p>
          </section>
        ) : null}

        {/* ── Pick'ems ── */}
        {show.paid && facts.pickems ? (
          <section className={`${styles.section} ${styles.sPicks}`}>
            <SectionHead id="pickems" tag="Pick'ems" title="Who Called It" link={{ href: `/leagues/${slug}/live/pickems/`, label: "Pick'ems board" }} />
            <div className={styles.picks}>
              <div className={styles.pickBest}>
                <span className={styles.pickLabel}>Best of week {week}</span>
                <span className={styles.pickRecord}>
                  {facts.pickems.best[0].right}-{facts.pickems.best[0].wrong}
                </span>
                <span className={styles.pickNames}>{andList(facts.pickems.best.map((b) => b.name))}</span>
                {facts.pickems.high || facts.pickems.low || facts.pickems.crowd ? (
                  <ul className={styles.pickNotes}>
                    {[
                      { k: 'High', c: facts.pickems.high },
                      { k: 'Low', c: facts.pickems.low },
                    ].map(({ k, c }) =>
                      c ? (
                        <li key={k}>
                          <span className={styles.pickTag}>{k}</span>
                          {c.right.length === 1 && c.right[0] === c.team
                            ? `${c.team} called their own ${k.toLowerCase()} score.`
                            : c.right.length
                              ? `${andList(c.right)} called ${c.team} for the ${k.toLowerCase()} score.`
                              : `Nobody called ${c.team} for the ${k.toLowerCase()} score.`}
                        </li>
                      ) : null,
                    )}
                    {facts.pickems.crowd ? (
                      <li>
                        <span className={styles.pickTag}>Missed</span>
                        {facts.pickems.crowd}
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
              <div>
                <span className={styles.pickLabel}>Season leaders</span>
                <ol className={styles.leaders}>
                  {facts.pickems.leaders.map((l) => (
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
          </section>
        ) : null}

        {/* ── The wire: trades, each side in its own box ── */}
        {show.veteran && (facts.trades?.length || facts.verdicts?.length) ? (
          <section className={`${styles.section} ${styles.sWire}`}>
            <SectionHead id="trades" tag="The wire" title="Trades" link={{ href: `/leagues/${slug}/live/trades/`, label: 'Trade desk' }} />
            <div className={styles.trades}>
              {facts.trades?.map((t, i) => (
                <article key={i} className={styles.trade}>
                  <div className={styles.tradeSides}>
                    {t.sides.map((side) => (
                      <div key={side.manager} className={styles.tradeSide}>
                        <div className={styles.tradeWho}>{side.manager} gets</div>
                        <ul>
                          {(side.assets ?? side.gets.map((label) => ({ label, pos: null, team: null }))).length ? (
                            (side.assets ?? side.gets.map((label) => ({ label, pos: null, team: null }))).map((a) => (
                              <li key={a.label}>
                                {a.pos ? <span className={styles.assetPos}>{a.pos}</span> : null}
                                {a.label}
                                {a.team ? <span className={styles.assetTeam}>{a.team}</span> : null}
                              </li>
                            ))
                          ) : (
                            <li>Nothing listed</li>
                          )}
                        </ul>
                      </div>
                    ))}
                  </div>
                  {t.summary ? <p className={styles.tradeNote}>{t.summary}</p> : null}
                </article>
              ))}
              {facts.verdicts?.map((v, i) => (
                <article key={`v${i}`} className={styles.trade}>
                  <div className={styles.tradeWho}>Four weeks later: {v.headline}</div>
                  <p className={styles.tradeNote}>{v.summary}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── Coming up ── */}
        {edition.previews.length ? (
          <section className={`${styles.section} ${styles.sNext}`}>
            <SectionHead
              id="next"
              tag="Next week"
              title={`Coming Up: Week ${f.next!.week}`}
              link={show.paid ? { href: `/leagues/${slug}/live/matchup-preview/`, label: 'Matchup preview' } : null}
            />
            <div className={styles.previews}>
              {edition.previews.map(({ game: g, note }, i) => (
                <article key={i} className={`${styles.preview} ${i === 0 ? styles.previewLead : ''}`}>
                  {i === 0 ? <div className={styles.kicker}>{g.gotw && show.paid ? 'Game of the week' : 'Headliner'}</div> : null}
                  <div className={styles.previewTeams}>
                    {[g.a, g.b].map((s, j) => (
                      <span key={j} className={styles.previewSide}>
                        <Avatar src={s.avatar} name={s.name} size="sm" />
                        <span className={styles.previewName}>
                          {s.name}
                          {s.record ? <small>{s.record}</small> : null}
                        </span>
                        {s.ppg != null ? (
                          <span className={styles.previewPpg}>
                            {s.ppg.toFixed(1)} <small>PPG</small>
                          </span>
                        ) : null}
                      </span>
                    ))}
                  </div>
                  <p className={styles.previewNote}>
                    {note}
                  </p>
                </article>
              ))}
            </div>
            {show.paid && (facts.next?.milestones?.length || facts.next?.picksLockAt) ? (
              <div className={styles.nextNotes}>
                {facts.next?.milestones?.map((m) => (
                  <p key={m}>{m}</p>
                ))}
                {facts.next?.picksLockAt ? (
                  <a className={styles.sectionLink} href={`/leagues/${slug}/live/pickems/`}>
                    Make your picks. They lock{' '}
                    {new Date(facts.next.picksLockAt).toLocaleString('en-US', {
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
          </section>
        ) : null}

        {/* ── Onward to The Weekly: the to-do side of the same week ── */}
        {show.paid && f.next ? (
          <a className={styles.weeklyCta} href={`/leagues/${slug}/live/weekly/`}>
            <span className={styles.weeklyKicker}>Before week {f.next.week} kicks off</span>
            <span className={styles.weeklyTitle}>
              The <em>Weekly</em>
            </span>
            <span className={styles.weeklyText}>
              Make your pick&apos;ems, check the board, the wire and the records in reach. Everything to do this week,
              on one page.
            </span>
            <span className={styles.weeklyBtn}>Open The Weekly</span>
          </a>
        ) : null}

        {/* ── Free: what the full paper adds ── */}
        {!show.paid ? (
          <section className={styles.upsell}>
            <p>
              This is the short edition. The full paper adds the record book (where every score ranks in league history),
              how teams with this start have finished, a year ago this week, the players behind each result, power
              rankings and playoff odds, pick&apos;ems and next week&apos;s lines. Rookie is {rookiePrice} for the league.
            </p>
            <Link className={styles.viewLeague} href="/pricing/?utm_source=recap&utm_medium=page">
              See plans
            </Link>
          </section>
        ) : null}

        {/* ── Footer: back to the league ── */}
        <footer className={styles.foot}>
          <div className={styles.footActions}>
            <a className={`${styles.viewLeague} ${styles.viewLeagueBig}`} href={leagueHref}>
              View the {league.name} almanac
            </a>
            <ShareButton className={styles.shareBtn} url={shareUrl} title={`Week ${week} recap · ${league.name}`} />
          </div>
          <nav className={styles.footNav}>
            {week > 1 ? <a href={`/leagues/${slug}/recap/${year}/${week - 1}/`}>Week {week - 1} paper</a> : <span />}
            <Link href="/?utm_source=recap&utm_medium=page&utm_campaign=new-league">Run another league? Start its book free</Link>
          </nav>
          <p className={styles.fine}>
            The Sunday Chronicle · {poss(f.league.name)} paper for {weekLabel.toLowerCase()}, {f.year} · scores as of{' '}
            {new Date(f.generatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/New_York' })}
          </p>
        </footer>
      </div>
    </div>
  )
}

// "CAT and Evan", "CAT, Evan, and Mason".
function andList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}
