import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { recapViewable } from '@/lib/recap/load'
import { SITE_URL } from '@/lib/recap/links'
import { loadCup } from '@/lib/cup/load'
import { loadCupExtras } from '@/lib/cup/extras'
import { cupNotes, type CupBracket } from '@/lib/cup/bracket'
import { trophy } from '@/lib/cup/trophy'
import { ShareButton } from '../recap/ShareButton'
import { CupApp } from './CupApp'
import styles from './cup.module.css'

export const dynamic = 'force-dynamic'

// The Cup: a knockout side tournament inside the regular season, drawn as a
// painted tournament board (bottle green, ivory lettering, brass). Its own
// house on purpose, not the recap's newsprint: this is the thing people
// check on, not read through.
//
// Built for the phone it's opened on from the group chat: a short masthead,
// then CupApp's four tabs (games with odds and history, the bracket sized
// to fit, the Cup odds, the league's bracket challenge). No site nav; "View
// the league" in the footer is the way in.

async function loadLeague(slug: string) {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound()
  const db = createAdminClient()
  const { data } = await db.from('leagues').select('id, name, slug, owner_id, published_at').eq('slug', slug).maybeSingle()
  // Same rule as the almanac: an unpublished league is the owner's alone.
  if (!data || !(await recapViewable(data))) notFound()
  return data as { id: string; name: string; slug: string; owner_id: string | null; published_at: string | null }
}

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
function count(n: number): string {
  return NUMBER_WORDS[n] ?? String(n)
}

// One sentence under the title: where the Cup stands right now.
function statusLine(b: CupBracket): string {
  if (b.status === 'done' && b.champion) {
    const ru = b.runnerUp ? `, beating ${b.runnerUp.name} in the week ${b.finalWeek} final` : ''
    return `${b.champion.name} won it as the ${ordinal(b.champion.seed)} seed${ru}.`
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
  const extras = await loadCupExtras(league.id, view)
  const yearQuery = askedYear ? `year=${askedYear}` : ''
  const pageUrl = `${SITE_URL}/leagues/${slug}/cup/${yearQuery ? `?${yearQuery}` : ''}`
  const imageUrl = `/api/og/cup/${slug}/?format=post${yearQuery ? `&${yearQuery}` : ''}`

  return (
    <main className={styles.page}>
      <header className={styles.mast}>
        <div className={styles.mastInner}>
          <div className={styles.mastText}>
            <p className={styles.kicker}>
              {league.name} · {cup.season_year}
            </p>
            <h1 className={styles.title}>{cup.name}</h1>
            <p className={styles.status}>{statusLine(bracket)}</p>
            <p className={styles.meta}>
              {bracket.field} teams · Weeks {bracket.startWeek} to {bracket.finalWeek}
              {bracket.champion ? '' : extras.board.length ? ` · ${extras.board.length} in the bracket challenge` : ' · Picks open'}
            </p>
          </div>
          <div className={styles.mastCup} aria-hidden>
            {trophy({ width: 120, brass: '#c8a35b', light: '#e6cb8e', dark: '#7d6230', plate: '#0c271f' })}
            {bracket.champion ? <span className={styles.mastChamp}>{bracket.champion.name}</span> : null}
          </div>
        </div>
      </header>

      <CupApp slug={slug} bracket={bracket} notes={cupNotes(bracket)} extras={extras} imageUrl={imageUrl} seededThrough={cup.seeded_through} />

      <footer className={styles.foot}>
        <div className={styles.footActions}>
          <ShareButton className={styles.btnPrimary} url={pageUrl} title={`${cup.name} · ${league.name}`} />
          <Link className={styles.btn} href={`/leagues/${slug}/`}>
            View the league
          </Link>
        </div>
        <Link href="/" className={styles.footLink}>
          The Sunday Chronicle
        </Link>
      </footer>
    </main>
  )
}
