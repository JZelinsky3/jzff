import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRecap } from '@/lib/recap/load'
import { pts, recapSections, recordStr, type RecapGame } from '@/lib/recap/facts'
import { recapPageUrl } from '@/lib/recap/links'
import { TIER_PRICES } from '@/lib/stripe'
import { ShareButton } from '../../ShareButton'
import styles from '../../recap.module.css'

export const dynamic = 'force-dynamic'

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
    (data?.intro as string | undefined) ?? `Final scores, the week's headlines and the standings from week ${week} of ${year}.`
  return {
    title,
    description,
    alternates: { canonical: recapPageUrl(slug, year, week) },
    openGraph: { type: 'article', title, description, siteName: 'The Sunday Chronicle', url: recapPageUrl(slug, year, week) },
    twitter: { card: 'summary', title, description },
  }
}

const winnerOf = (g: RecapGame) => (g.winner === 'a' ? g.a : g.b)
const loserOf = (g: RecapGame) => (g.winner === 'a' ? g.b : g.a)

function GameRow({ g }: { g: RecapGame }) {
  const decided = g.winner === 'a' || g.winner === 'b'
  const first = decided ? winnerOf(g) : g.a
  const second = decided ? loserOf(g) : g.b
  const tag =
    g.kind === 'championship' ? 'Championship' : g.kind === 'playoff' ? 'Playoffs' : g.kind === 'consolation' ? 'Consolation' : null
  let note: string | null = null
  if (g.leg?.n === 1) note = 'First leg of two. Decided next week.'
  else if (g.leg?.n === 2 && g.leg.totalA != null && g.leg.totalB != null) {
    const [w, l] = g.winner === 'a' ? [g.leg.totalA, g.leg.totalB] : [g.leg.totalB, g.leg.totalA]
    note = `Two-week total ${pts(w)} to ${pts(l)}.`
  } else if (g.winner === 'tie') note = 'Tie.'

  return (
    <li className={styles.game}>
      {tag ? <div className={styles.gameTag}>{tag}</div> : null}
      <div className={`${styles.side} ${decided ? styles.won : ''}`}>
        <span className={styles.sideName}>
          {first.name}
          {first.team ? <span className={styles.team}>{first.team}</span> : null}
        </span>
        <span className={styles.score}>{pts(first.score)}</span>
      </div>
      <div className={styles.side}>
        <span className={styles.sideName}>
          {second.name}
          {second.team ? <span className={styles.team}>{second.team}</span> : null}
        </span>
        <span className={styles.score}>{pts(second.score)}</span>
      </div>
      <div className={styles.gameFoot}>
        {decided ? `By ${pts(g.margin)}` : null}
        {note ? <span>{note}</span> : null}
      </div>
    </li>
  )
}

export default async function RecapPage({
  params,
}: {
  params: Promise<{ slug: string; year: string; week: string }>
}) {
  const { slug, year: y, week: w } = await params
  const { year, week } = parseParams(y, w)
  const league = await loadLeague(slug)
  const loaded = await loadRecap(league, year, week)

  const head = (label: string) => (
    <header className={styles.head}>
      <a className={styles.kicker} href={`/leagues/${slug}/`}>{league.name}</a>
      <h1>
        {label} <em>{week}</em>
      </h1>
      <div className={styles.dateline}>{year} season · the recap</div>
    </header>
  )

  if (loaded.status !== 'ok') {
    const message =
      loaded.status === 'not-final'
        ? `Week ${week} isn't over yet. The recap shows up the Tuesday after Monday night.`
        : loaded.status === 'held'
          ? `Week ${week} isn't fully scored on the platform yet (${loaded.reason}). The recap will show up once it is.`
          : `There are no week ${week} games on the books for ${year}.`
    return (
      <div className={styles.page}>
        <div className={styles.shell}>
          {head('Week')}
          <p className={styles.empty}>{message}</p>
        </div>
      </div>
    )
  }

  const { facts: f, intro, tier } = loaded
  // The owner's plan today decides what shows, even on a recap that was
  // built when they were on a bigger one.
  const show = recapSections(tier)
  const shareUrl = recapPageUrl(slug, year, week, 'share')
  const rookiePrice = `$${(TIER_PRICES.tier1.yearly.amountCents / 100).toFixed(0)} a year`

  const headlines: { label: string; value: string; note?: string }[] = []
  if (f.top) headlines.push({ label: 'Top score', value: pts(f.top.score), note: `${f.top.name}, ${f.top.won ? 'beat' : 'lost to'} ${f.top.opponent}` })
  if (f.low) headlines.push({ label: 'Low score', value: pts(f.low.score), note: `${f.low.name}, ${f.low.won ? 'beat' : 'lost to'} ${f.low.opponent}` })
  if (f.closest) headlines.push({ label: 'Closest game', value: `by ${pts(f.closest.margin)}`, note: `${winnerOf(f.closest).name} over ${loserOf(f.closest).name}` })
  if (f.blowout) headlines.push({ label: 'Biggest win', value: `by ${pts(f.blowout.margin)}`, note: `${winnerOf(f.blowout).name} over ${loserOf(f.blowout).name}` })
  if (f.upset) {
    headlines.push({
      label: 'Upset',
      value: f.upset.winner,
      note: `${f.upset.winnerRecord} going in, beat ${f.upset.loser} (${f.upset.loserRecord})`,
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        {/* No site nav, like the awards sheet: this is opened from a link in
            the group chat, read, and closed. The kicker links home. */}
        {head(f.phase === 'playoffs' ? 'Playoffs, week' : 'Week')}

        <p className={styles.lede}>{intro}</p>

        <section className={styles.section}>
          <h2 className={styles.h2}>Final scores</h2>
          <ul className={styles.games}>
            {f.games.map((g, i) => (
              <GameRow key={i} g={g} />
            ))}
          </ul>
        </section>

        {headlines.length ? (
          <section className={styles.section}>
            <h2 className={styles.h2}>The week</h2>
            <div className={styles.cards}>
              {headlines.map((h) => (
                <div key={h.label} className={styles.card}>
                  <div className={styles.cardLabel}>{h.label}</div>
                  <div className={styles.cardValue}>{h.value}</div>
                  {h.note ? <div className={styles.cardNote}>{h.note}</div> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {show.paid && f.records?.length ? (
          <section className={styles.section}>
            <h2 className={styles.h2}>For the record book</h2>
            <ul className={styles.notes}>
              {f.records.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {f.standings?.length ? (
          <section className={styles.section}>
            <h2 className={styles.h2}>Standings</h2>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th />
                  <th className={styles.left}>Manager</th>
                  <th>Record</th>
                  <th>PF</th>
                  <th>Move</th>
                </tr>
              </thead>
              <tbody>
                {f.standings.map((s) => (
                  <tr key={s.managerId}>
                    <td className={styles.rank}>{s.rank}</td>
                    <td className={styles.left}>
                      {s.name}
                      {s.team ? <span className={styles.team}>{s.team}</span> : null}
                    </td>
                    <td>{recordStr(s.wins, s.losses, s.ties)}</td>
                    <td>{pts(s.pf)}</td>
                    <td className={s.change && s.change > 0 ? styles.up : s.change && s.change < 0 ? styles.down : styles.flat}>
                      {s.change == null || s.change === 0 ? '·' : s.change > 0 ? `+${s.change}` : s.change}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.fine}>Ordered by record, then points for. Your platform&apos;s tiebreakers may differ.</p>
            {f.streaks.length ? (
              <ul className={styles.notes}>
                {f.streaks.map((s) => (
                  <li key={s.name}>
                    {s.name} has {s.kind === 'W' ? 'won' : 'lost'} {s.length} straight.
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {show.paid && f.power?.length ? (
          <section className={styles.section}>
            <h2 className={styles.h2}>Power rankings</h2>
            <table className={styles.table}>
              <tbody>
                {f.power.map((p) => (
                  <tr key={p.name}>
                    <td className={styles.rank}>{p.rank}</td>
                    <td className={styles.left}>
                      {p.name}
                      {p.team ? <span className={styles.team}>{p.team}</span> : null}
                    </td>
                    <td>{p.record}</td>
                    <td className={p.delta > 0 ? styles.up : p.delta < 0 ? styles.down : styles.flat}>
                      {p.delta === 0 ? '·' : p.delta > 0 ? `+${p.delta}` : p.delta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.fine}>
              <a href={`/leagues/${slug}/live/powerrank/`}>The full power rankings</a>
            </p>
          </section>
        ) : null}

        {show.paid && f.pickems ? (
          <section className={styles.section}>
            <h2 className={styles.h2}>Pick&apos;ems</h2>
            <ul className={styles.notes}>
              <li>
                Best of week {week}: {f.pickems.best.map((b) => b.name).join(', ')}, {f.pickems.best[0].right}-
                {f.pickems.best[0].wrong}. {f.pickems.pickers} {f.pickems.pickers === 1 ? 'person' : 'people'} picked.
              </li>
              {f.pickems.leader ? (
                <li>
                  Season leader: {f.pickems.leader.name}, {f.pickems.leader.right}-{f.pickems.leader.wrong}.
                </li>
              ) : null}
            </ul>
          </section>
        ) : null}

        {show.paid && f.milestones?.length ? (
          <section className={styles.section}>
            <h2 className={styles.h2}>Milestones</h2>
            <ul className={styles.notes}>
              {f.milestones.map((m) => (
                <li key={`${m.name}-${m.text}`}>
                  <b>{m.name}:</b> {m.text}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {show.veteran && f.bench && (f.bench.worst || f.bench.sharpest) ? (
          <section className={styles.section}>
            <h2 className={styles.h2}>The bench</h2>
            <ul className={styles.notes}>
              {f.bench.worst ? (
                <li>
                  {f.bench.worst.name} started {pts(f.bench.worst.started)} and could have started{' '}
                  {pts(f.bench.worst.optimal)}: {pts(f.bench.worst.left)} points left on the bench, the most in the league.
                </li>
              ) : null}
              {f.bench.sharpest ? (
                <li>
                  {f.bench.sharpest.name} set the best lineup,{' '}
                  {f.bench.sharpest.left === 0 ? 'a perfect one' : `${pts(f.bench.sharpest.left)} points off perfect`}.
                </li>
              ) : null}
            </ul>
          </section>
        ) : null}

        {show.veteran && f.trades?.length ? (
          <section className={styles.section}>
            <h2 className={styles.h2}>{f.trades.length === 1 ? 'The trade' : 'Trades'}</h2>
            {f.trades.map((t, i) => (
              <div key={i} className={styles.trade}>
                <div className={styles.tradeHead}>{t.headline}</div>
                <ul className={styles.notes}>
                  {t.sides.map((s) => (
                    <li key={s.manager}>
                      {s.manager} gets {s.gets.join(', ') || 'nothing listed'}.
                    </li>
                  ))}
                </ul>
                {t.summary ? <p className={styles.tradeSummary}>{t.summary}</p> : null}
              </div>
            ))}
          </section>
        ) : null}

        {!show.paid ? (
          <section className={styles.upsell}>
            <p>
              This is the short version. The full recap adds power rankings, pick&apos;ems, league records and
              milestones, and keeps every page of the league up to date all season. Rookie is {rookiePrice} for the
              league.
            </p>
            <Link className={styles.button} href="/pricing/?utm_source=recap&utm_medium=page">
              See plans
            </Link>
          </section>
        ) : !show.veteran ? (
          <p className={styles.fine}>Bench mistakes and trades show up here on the Veteran plan.</p>
        ) : null}

        <div className={styles.share}>
          <ShareButton className={styles.button} url={shareUrl} title={`Week ${week} recap · ${league.name}`} />
        </div>

        <footer className={styles.foot}>
          <a href={`/leagues/${slug}/`}>The full {league.name} almanac</a>
          <Link href="/?utm_source=recap&utm_medium=page&utm_campaign=new-league">Run another league? Start its book free</Link>
          {week > 1 ? <a href={`/leagues/${slug}/recap/${year}/${week - 1}/`}>Week {week - 1} recap</a> : null}
        </footer>
        <p className={styles.fine}>
          Scores as of{' '}
          {new Date(f.generatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/New_York' })}.
        </p>
      </div>
    </div>
  )
}
