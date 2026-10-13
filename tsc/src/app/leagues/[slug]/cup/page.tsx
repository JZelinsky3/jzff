import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { recapViewable } from '@/lib/recap/load'
import { SITE_URL } from '@/lib/recap/links'
import { loadCup } from '@/lib/cup/load'
import { cupNotes, type CupBracket, type CupMatch, type CupRound, type CupSide } from '@/lib/cup/bracket'
import { trophy } from '@/lib/cup/trophy'
import { ShareButton } from '../recap/ShareButton'
import styles from './cup.module.css'

export const dynamic = 'force-dynamic'

// The Cup: a knockout side tournament inside the regular season, drawn as a
// painted tournament board (bottle green, ivory lettering, brass). Its own
// house on purpose, not the recap's newsprint: this is the thing people
// check on, not read through.
//
// Desktop gets the whole bracket left to right; phones get the rounds
// stacked, since a bracket can't be read at 375px. No site nav: like the
// recap it is opened from a group chat, and "View the league" is the way in.

async function loadLeague(slug: string) {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound()
  const db = createAdminClient()
  const { data } = await db.from('leagues').select('id, name, slug, owner_id, published_at').eq('slug', slug).maybeSingle()
  // Same rule as the almanac: an unpublished league is the owner's alone.
  if (!data || !(await recapViewable(data))) notFound()
  return data as { id: string; name: string; slug: string; owner_id: string | null; published_at: string | null }
}

function pts(n: number): string {
  return n.toFixed(2)
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
function count(n: number): string {
  return NUMBER_WORDS[n] ?? String(n)
}

// One sentence under the title: where the Cup stands right now.
function statusLine(b: CupBracket): string {
  if (b.status === 'done' && b.champion) {
    const ru = b.runnerUp ? ` over ${b.runnerUp.name}` : ''
    return `${b.champion.name} won it, the ${ordinal(b.champion.seed)} seed${ru} in the week ${b.finalWeek} final.`
  }
  const r = b.currentRound == null ? null : b.rounds[b.currentRound]
  if (!r) return 'The draw is set.'
  const games = r.matches.length
  const decide = `decided by week ${r.week} scores`
  if (b.status === 'before') return `The draw is set. The ${r.name.toLowerCase()} is week ${r.week}.`
  if (r.matches.some((m) => m.state === 'waiting')) return `Waiting on final week ${r.week} scores to settle the ${r.name.toLowerCase()}.`
  if (r.matches.some((m) => m.state === 'live')) {
    return r.name === 'Final'
      ? `The final is this week, ${decide}.`
      : `The ${r.name.toLowerCase()} is this week: ${count(games)} ${games === 1 ? 'game' : 'games'}, ${decide}.`
  }
  return `Next up, the ${r.name.toLowerCase()} in week ${r.week}.`
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ year?: string }> }

// ?year= opens a past season's Cup; the newest one otherwise.
async function yearOf(searchParams: Props['searchParams']): Promise<number | null> {
  const y = Number((await searchParams).year)
  return Number.isInteger(y) && y > 1990 && y < 2100 ? y : null
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const year = await yearOf(searchParams)
  const league = await loadLeague(slug)
  const view = await loadCup(league.id, year)
  if (!view) return { title: `The Cup · ${league.name}`, robots: { index: false, follow: false } }
  const title = `${view.cup.name} · ${league.name}`
  const description = statusLine(view.bracket)
  // Cache-bust by round: the card changes every week the Cup moves.
  const v = `${view.bracket.currentRound ?? 'done'}-${view.bracket.rounds.filter((r) => r.matches.every((m) => m.state === 'final')).length}`
  const image = { url: `${SITE_URL}/api/og/cup/${slug}/?v=${v}${year ? `&year=${year}` : ''}`, width: 1200, height: 630, alt: title }
  return {
    title,
    description,
    ...(league.published_at ? {} : { robots: { index: false, follow: false } }),
    alternates: { canonical: `${SITE_URL}/leagues/${slug}/cup/` },
    openGraph: { title, description, images: [image], type: 'article' },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  }
}

export default async function CupPage({ params, searchParams }: Props) {
  const { slug } = await params
  const askedYear = await yearOf(searchParams)
  const league = await loadLeague(slug)
  const view = await loadCup(league.id, askedYear)
  if (!view) notFound()
  const { cup, bracket } = view
  const yearQuery = askedYear ? `year=${askedYear}` : ''
  const pageUrl = `${SITE_URL}/leagues/${slug}/cup/${yearQuery ? `?${yearQuery}` : ''}`
  const notes = cupNotes(bracket)
  const byes = bracket.rounds[0]?.byes ?? []
  const year = cup.season_year

  return (
    <main className={styles.page}>
      <header className={styles.mast}>
        <div className={styles.mastInner}>
          <div className={styles.mastText}>
            <p className={styles.kicker}>
              {league.name} · {year}
            </p>
            <h1 className={styles.title}>{cup.name}</h1>
            <p className={styles.status}>{statusLine(bracket)}</p>
            <p className={styles.meta}>
              {bracket.field} teams · {bracket.rounds.length} rounds · Weeks {bracket.startWeek} to {bracket.finalWeek}
            </p>
            <div className={styles.actions}>
              <ShareButton className={styles.btnPrimary} url={pageUrl} title={`${cup.name} · ${league.name}`} />
              <a className={styles.btn} href={`/api/og/cup/${slug}/?format=post${yearQuery ? `&${yearQuery}` : ''}`} download={`${slug}-cup-bracket.png`}>
                Save the bracket image
              </a>
              <Link className={styles.btn} href={`/leagues/${slug}/`}>
                View the league
              </Link>
            </div>
          </div>
          <div className={styles.mastCup}>
            {trophy({ width: 150, brass: '#c8a35b', light: '#e6cb8e', dark: '#7d6230', plate: '#0c271f' })}
            <div className={styles.plaque}>
              <span className={styles.plaqueLabel}>Champion</span>
              <span className={styles.plaqueName}>{bracket.champion ? bracket.champion.name : `Week ${bracket.finalWeek}`}</span>
            </div>
          </div>
        </div>
      </header>

      <section className={styles.board} aria-label="The bracket">
        <div className={styles.bracketScroll}>
          <div className={styles.bracket} style={{ ['--slots' as string]: bracket.size / 2 }}>
            {bracket.rounds.map((r, ri) => (
              <div className={styles.col} key={r.round}>
                <div className={styles.colHead}>
                  <span className={styles.colName}>{r.name}</span>
                  <span className={styles.colWeek}>
                    Week {r.week}
                    {isLive(r) ? <span className={styles.now}>This week</span> : null}
                  </span>
                </div>
                <div className={styles.colBody}>
                  {pairsOf(r, ri > 0 ? bracket.rounds[ri - 1] : null).map((pair, pi) => (
                    <div className={`${styles.pair} ${pair.joinClass ? styles[pair.joinClass] : ''}`} key={pi}>
                      {pair.cells.map((cell, ci) =>
                        cell.match ? (
                          <div className={styles.cell} key={ci}>
                            {boardCard(cell.match, cell.fed)}
                          </div>
                        ) : (
                          <div className={styles.cell} key={ci} />
                        ),
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className={`${styles.col} ${styles.champCol}`}>
              <div className={styles.colHead}>
                <span className={styles.colName}>Champion</span>
                <span className={styles.colWeek}>After week {bracket.finalWeek}</span>
              </div>
              <div className={styles.colBody}>
                <div className={styles.champ}>
                  {trophy({ width: 92, brass: '#c8a35b', light: '#e6cb8e', dark: '#7d6230', plate: '#10322a' })}
                  <span className={styles.champName}>{bracket.champion ? bracket.champion.name : 'To be decided'}</span>
                  {bracket.champion ? (
                    <span className={styles.champSub}>
                      {ordinal(bracket.champion.seed)} seed · {bracket.champion.team ?? bracket.champion.record}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.stack} aria-label="The rounds">
        {bracket.rounds.map((r) => (
          <section className={styles.round} key={r.round} id={`round-${r.round + 1}`}>
            <header className={styles.roundHead}>
              <h2 className={styles.roundName}>{r.name}</h2>
              <span className={styles.colWeek}>
                Week {r.week}
                {isLive(r) ? <span className={styles.now}>This week</span> : null}
              </span>
            </header>
            {r.byes.length ? (
              <p className={styles.byes}>
                {listNames(r.byes.map((e) => e.name))} {r.byes.length === 1 ? 'goes' : 'go'} straight to the{' '}
                {bracket.rounds[r.round + 1]?.name.toLowerCase() ?? 'next round'}.
              </p>
            ) : null}
            <div className={styles.games}>{r.matches.map((m) => stackCard(m))}</div>
          </section>
        ))}
      </section>

      <section className={styles.lower}>
        {notes.top || notes.closest || notes.upset ? (
          <div className={styles.notes}>
            <h2 className={styles.lowerHead}>Cup notes</h2>
            <div className={styles.noteGrid}>
              {notes.top ? (
                <div className={styles.note}>
                  <span className={styles.noteLabel}>Top Cup score</span>
                  <span className={styles.noteBig}>{pts(notes.top.score)}</span>
                  <span className={styles.noteLine}>
                    {notes.top.name}, {notes.top.round.toLowerCase()}
                  </span>
                </div>
              ) : null}
              {notes.closest ? (
                <div className={styles.note}>
                  <span className={styles.noteLabel}>Closest game</span>
                  <span className={styles.noteBig}>{notes.closest.margin === 0 ? 'Level' : pts(notes.closest.margin)}</span>
                  <span className={styles.noteLine}>
                    {notes.closest.winner} over {notes.closest.loser}
                    {notes.closest.margin === 0 ? ', on seed' : ''}
                  </span>
                </div>
              ) : null}
              {notes.upset ? (
                <div className={styles.note}>
                  <span className={styles.noteLabel}>Biggest upset</span>
                  <span className={styles.noteBig}>{notes.upset.by} seeds</span>
                  <span className={styles.noteLine}>
                    {notes.upset.winner} {pts(notes.upset.ws)}, {notes.upset.loser} {pts(notes.upset.ls)}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className={styles.rules}>
          <h2 className={styles.lowerHead}>How it works</h2>
          <ol className={styles.ruleList}>
            <li>
              Seeded by the standings after week {cup.seeded_through}.
              {byes.length ? ` The top ${count(byes.length)} skip the first round.` : ''}
            </li>
            <li>One round a week. Your real score that week is your Cup score, whoever you play in the league.</li>
            <li>A tie goes to the higher seed.</li>
            <li>Nothing to sign up for. Every team is in.</li>
          </ol>
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

function isLive(r: CupRound): boolean {
  return r.matches.some((m) => m.state === 'live')
}

type Cell = { match: CupMatch | null; fed: boolean }
type Pair = { cells: Cell[]; joinClass: 'joinBoth' | 'joinTop' | 'joinBottom' | null }

// A round's slots in pairs, each pair feeding one game in the next round,
// so the CSS can draw the bracket line that joins them. Empty slots are byes.
function pairsOf(r: CupRound, prev: CupRound | null): Pair[] {
  const at = new Map(r.matches.map((m) => [m.slot, m]))
  const fedBy = (slot: number) => !!prev && prev.matches.some((m) => m.slot === slot * 2 || m.slot === slot * 2 + 1)
  const cells: Cell[] = Array.from({ length: r.slots }, (_, s) => ({ match: at.get(s) ?? null, fed: fedBy(s) }))
  if (r.slots === 1) return [{ cells, joinClass: null }]
  const out: Pair[] = []
  for (let i = 0; i < cells.length; i += 2) {
    const top = !!cells[i].match
    const bottom = !!cells[i + 1]?.match
    out.push({
      cells: cells.slice(i, i + 2),
      joinClass: top && bottom ? 'joinBoth' : top ? 'joinTop' : bottom ? 'joinBottom' : null,
    })
  }
  return out
}

function sideClass(m: CupMatch, which: 'a' | 'b'): string {
  if (!m.winner) return styles.row
  return `${styles.row} ${m.winner === which ? styles.won : styles.lost}`
}

function sideRow(m: CupMatch, which: 'a' | 'b', withTeam: boolean) {
  const s: CupSide = m[which]
  if (s.kind === 'tbd') {
    return (
      <div className={`${styles.row} ${styles.tbdRow}`}>
        <span className={styles.seed} />
        <span className={styles.tbd}>{s.options.length ? `${s.options[0]} or ${s.options[1]}` : 'To be decided'}</span>
      </div>
    )
  }
  return (
    <div className={sideClass(m, which)}>
      <span className={styles.seed}>{s.entrant.seed}</span>
      <span className={styles.who}>
        <span className={styles.name}>{s.entrant.name}</span>
        {withTeam && s.entrant.team && s.entrant.team !== s.entrant.name ? (
          <span className={styles.team}>{s.entrant.team}</span>
        ) : null}
      </span>
      <span className={styles.score}>{s.score != null ? pts(s.score) : m.state === 'upcoming' ? '' : '-'}</span>
    </div>
  )
}

function noteFor(m: CupMatch): string | null {
  if (m.tiebreak) return 'Level on points, settled on seed'
  const w = m.winner ? m[m.winner] : null
  if (w?.kind === 'team' && m.upsetBy >= 3) return `Upset: the ${ordinal(w.entrant.seed)} seed goes through`
  if (m.sameGame) return 'Also their league game'
  return null
}

// Every game feeds the column to its right (the final feeds the champion).
function boardCard(m: CupMatch, fed: boolean) {
  const note = noteFor(m)
  return (
    <div
      className={`${styles.card} ${styles.feeds} ${fed ? styles.fed : ''} ${m.state === 'live' ? styles.cardLive : ''}`}
      title={titleFor(m)}
    >
      {sideRow(m, 'a', false)}
      {sideRow(m, 'b', false)}
      {note ? <span className={styles.cardNote}>{note}</span> : null}
    </div>
  )
}

function stackCard(m: CupMatch) {
  const note = noteFor(m)
  return (
    <div className={`${styles.gameCard} ${m.state === 'live' ? styles.cardLive : ''}`} key={m.id}>
      {sideRow(m, 'a', true)}
      {sideRow(m, 'b', true)}
      {note ? <span className={styles.gameNote}>{note}</span> : null}
    </div>
  )
}

function titleFor(m: CupMatch): string {
  const label = (s: CupSide) => (s.kind === 'team' ? `${s.entrant.seed} ${s.entrant.name}${s.entrant.team ? ` (${s.entrant.team})` : ''}` : 'TBD')
  return `${label(m.a)} v ${label(m.b)}, week ${m.week}`
}
