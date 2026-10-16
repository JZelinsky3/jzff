import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { recapViewable } from '@/lib/recap/load'
import { SITE_URL } from '@/lib/recap/links'
import { loadLeagueCups } from '@/lib/cup/history'
import { buildCupHall } from '@/lib/cup/hall'
import { CUP_LAUNCH, drawDayText } from '@/lib/cup/launch'
import { DEMO_ALMANAC, DEMO_CUP_LEAGUE, demoLeagueCups, isDemoCup } from '@/lib/cup/demo'
import { trophy } from '@/lib/cup/trophy'
import { BackLink } from '../BackLink'
import { HallApp } from './HallApp'
import styles from '../cup.module.css'
import h from './hall.module.css'

export const dynamic = 'force-dynamic'

// The Cup Hall of Fame: every Cup the league has played, in one place. The
// champions engraved on the trophy's bands (the Stanley Cup's way: a band
// per year, the year being played left blank), each manager's Cup career,
// the Cup's own records and the bracket challenge all-time. Its own room in
// the Cup's house (bottle green, brass, cream), not the Record Book's: the
// Record Book is the league's; this is the Cup's.

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ room?: string }> }

async function loadLeague(slug: string) {
  if (isDemoCup(slug)) return DEMO_CUP_LEAGUE
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound()
  const db = createAdminClient()
  const { data } = await db.from('leagues').select('id, name, slug, owner_id, published_at').eq('slug', slug).maybeSingle()
  if (!data || !(await recapViewable(data))) notFound()
  return data as { id: string; name: string; slug: string; owner_id: string | null; published_at: string | null }
}

async function hallOf(slug: string, leagueId: string) {
  const lc = isDemoCup(slug) ? demoLeagueCups() : await loadLeagueCups(leagueId)
  return lc.cups.length ? buildCupHall(lc, `/leagues/${slug}/cup/`) : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const league = await loadLeague(slug)
  const hall = await hallOf(slug, league.id)
  const name = hall?.name ?? CUP_LAUNCH.name
  const title = `${name} Hall of Fame · ${league.name}`
  const champs = hall ? hall.bands.filter((b) => b.champion).length : 0
  const description = champs
    ? `Every ${name} champion in ${league.name}, every manager's Cup record, the Cup's records and the bracket challenge all-time.`
    : `${league.name}'s Cup history starts here: the champions, the Cup records and the bracket challenge, kept every year.`
  const image = { url: `${SITE_URL}/api/og/cup/${slug}/?v=hall`, width: 1200, height: 630, alt: title }
  return {
    title,
    description,
    ...(league.published_at ? {} : { robots: { index: false, follow: false } }),
    alternates: { canonical: `${SITE_URL}/leagues/${slug}/cup/hall/` },
    openGraph: { title, description, images: [image], type: 'article' },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  }
}

export default async function CupHallPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { room } = await searchParams
  const league = await loadLeague(slug)
  const hall = await hallOf(slug, league.id)
  const cupHref = `/leagues/${slug}/cup/`
  const leagueHref = isDemoCup(slug) ? DEMO_ALMANAC : `/leagues/${slug}/`

  return (
    <main className={styles.page}>
      {hall ? (
        <HallApp hall={hall} leagueName={league.name} cupHref={cupHref} leagueHref={leagueHref} room={room} />
      ) : (
        // No Cup yet: the empty trophy, and the way to the countdown.
        <header className={h.mast}>
          <div className={h.mastInner}>
            <BackLink href={leagueHref} top={-18} />
            <div className={h.mastText}>
              <p className={h.kicker}>{league.name}</p>
              <h1 className={h.title}>
                {CUP_LAUNCH.name} <em>Hall of Fame</em>
              </h1>
              <p className={h.lede}>
                The Hall opens with the league&apos;s first Cup. The draw is {drawDayText()}, and the first name goes on the trophy the week the final is played.
              </p>
              <Link className={styles.btnGold} href={cupHref}>
                See the Cup
              </Link>
            </div>
            <div className={h.monument} aria-hidden>
              {trophy({ width: 120, brass: '#c8a35b', light: '#e6cb8e', dark: '#7d6230', plate: '#0d2a21' })}
              <div className={h.barrel}>
                {[0, 1, 2].map((i) => (
                  <span key={i} className={`${h.band} ${h.bandBlank}`}>
                    <b>{CUP_LAUNCH.year + i}</b>
                    <span>&nbsp;</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </header>
      )}

      <footer className={styles.foot}>
        <div className={styles.footActions}>
          <Link className={styles.btnGhost} href={cupHref}>
            Back to the Cup
          </Link>
          <Link className={styles.btnGhost} href={leagueHref}>
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
