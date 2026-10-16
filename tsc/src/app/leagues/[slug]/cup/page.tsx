import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { recapViewable } from '@/lib/recap/load'
import { SITE_URL } from '@/lib/recap/links'
import { loadCup } from '@/lib/cup/load'
import { loadCupExtras } from '@/lib/cup/extras'
import { loadLeagueCups } from '@/lib/cup/history'
import { cupNotes, CUP_MAX_FIELD, type CupBracket } from '@/lib/cup/bracket'
import { loadCupPreview, type CupPreview } from '@/lib/cup/preview'
import { CUP_LAUNCH, drawDayText } from '@/lib/cup/launch'
import { DEMO_ALMANAC, DEMO_CUP_LEAGUE, demoCupExtras, demoCupPreview, demoCupView, demoLeagueCups, isDemoCup } from '@/lib/cup/demo'
import { ShareButton } from '../recap/ShareButton'
import { CupApp } from './CupApp'
import { CupPreviewPage } from './CupPreview'
import { DemoLaunch } from './DemoLaunch'
import styles from './cup.module.css'

export const dynamic = 'force-dynamic'

// The Cup: a knockout side tournament inside the regular season. The board
// (bottle green, ivory lettering, brass) carries the masthead, bracket and
// odds; every game is a cream ticket on it. Its own house on purpose, not
// the recap's newsprint: this is the thing people check on and play, not
// read through.
//
// Built for the phone it's opened on from the group chat. CupApp draws the
// masthead (with "How it works" up top) and the four tabs (games with odds,
// history and the pick; the bracket sized to fit; the Cup odds; the
// bracket challenge). No site nav; "View the league" in the footer is the
// way in.

async function loadLeague(slug: string) {
  // The demo league has no row; its Cups come from lib/cup/demo.ts.
  if (isDemoCup(slug)) return DEMO_CUP_LEAGUE
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
  // "The semifinals are", "the first round is".
  const is = /s$/.test(r.name) ? 'are' : 'is'
  if (b.status === 'before') return `The draw is set. The ${r.name.toLowerCase()} ${is} week ${r.week}.`
  if (r.matches.some((m) => m.state === 'waiting')) return `Waiting on final week ${r.week} scores to settle the ${r.name.toLowerCase()}.`
  if (r.matches.some((m) => m.state === 'live')) {
    return r.name === 'Final'
      ? `The final is this week, ${decide}.`
      : `The ${r.name.toLowerCase()} ${is} this week: ${count(games)} ${games === 1 ? 'game' : 'games'}, ${decide}.`
  }
  return `Next up, the ${r.name.toLowerCase()} in week ${r.week}.`
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ year?: string; preview?: string; reveal?: string; tab?: string }> }

// ?year= opens a past season's Cup; the newest one otherwise.
async function yearOf(searchParams: Props['searchParams']): Promise<number | null> {
  const y = Number((await searchParams).year)
  return Number.isInteger(y) && y > 1990 && y < 2100 ? y : null
}

// A league with a live season this year and no Cup yet gets the launch
// preview (countdown to the draw, the bracket as today's standings would
// draw it) instead of a 404. A Cup from an earlier year doesn't count.
// ?preview=1 shows it on any league, Cup or not (how pams sees it).
// The demo's own Cup is running, so it shows the preview only when asked.
async function previewFor(leagueId: string, askedYear: number | null, view: Awaited<ReturnType<typeof loadCup>>, force: boolean): Promise<CupPreview | null> {
  if (askedYear || (!force && view && view.cup.season_year >= CUP_LAUNCH.year)) return null
  if (isDemoCup(leagueId)) return force ? demoCupPreview() : null
  return loadCupPreview(leagueId)
}

function cupOf(leagueId: string, year: number | null) {
  return isDemoCup(leagueId) ? Promise.resolve(demoCupView(year)) : loadCup(leagueId, year)
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const year = await yearOf(searchParams)
  const league = await loadLeague(slug)
  const view = await cupOf(league.id, year)
  const preview = await previewFor(league.id, year, view, (await searchParams).preview === '1')
  if (preview) {
    const title = `${CUP_LAUNCH.name} · ${league.name}`
    const description = `A knockout bracket inside the season. The draw is ${drawDayText()}; the top ${Math.min(preview.teams.length, CUP_MAX_FIELD)} after week ${CUP_LAUNCH.seededThrough} are in.`
    const image = { url: `${SITE_URL}/api/og/cup/${slug}/?v=preview-${preview.throughWeek}`, width: 1200, height: 630, alt: title }
    return {
      title,
      description,
      ...(league.published_at ? {} : { robots: { index: false, follow: false } }),
      alternates: { canonical: `${SITE_URL}/leagues/${slug}/cup/` },
      openGraph: { title, description, images: [image], type: 'article' },
      twitter: { card: 'summary_large_image', title, description, images: [image.url] },
    }
  }
  if (!view) return { title: `The Cup · ${league.name}`, robots: { index: false, follow: false } }
  // The demo's link is shared with people who have no league here yet: it
  // pitches the Cup, not the week the demo is frozen in.
  if (isDemoCup(slug) && !year) {
    const title = `${CUP_LAUNCH.name} · Try the Demo`
    const description = 'A knockout bracket inside your fantasy season. Pick every game, follow the title odds and collect stamps. Free for Sleeper and ESPN leagues.'
    const image = { url: `${SITE_URL}/api/og/cup/${slug}/?v=demo-1`, width: 1200, height: 630, alt: title }
    return {
      title,
      description,
      alternates: { canonical: `${SITE_URL}/leagues/${slug}/cup/` },
      openGraph: { title, description, images: [image], type: 'website' },
      twitter: { card: 'summary_large_image', title, description, images: [image.url] },
    }
  }
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
  const demo = isDemoCup(slug)
  const view = await cupOf(league.id, askedYear)
  const preview = await previewFor(league.id, askedYear, view, (await searchParams).preview === '1')
  const leagueHref = demo ? DEMO_ALMANAC : `/leagues/${slug}/`
  if (preview) return <CupPreviewPage league={league} preview={preview} pageUrl={`${SITE_URL}/leagues/${slug}/cup/${demo ? '?preview=1' : ''}`} leagueHref={leagueHref} />
  if (!view) notFound()
  const { cup, bracket } = view
  const extras = demo ? demoCupExtras(view) : await loadCupExtras(league.id, view)
  // Stamps are all-time (a stamp book spans every Cup), so this reads the
  // league's other Cups too; the one already loaded isn't loaded again.
  const { stamps } = demo ? demoLeagueCups({ current: view }) : await loadLeagueCups(league.id, { view, picks: extras.picks })
  const yearQuery = askedYear ? `year=${askedYear}` : ''
  const pageUrl = `${SITE_URL}/leagues/${slug}/cup/${yearQuery ? `?${yearQuery}` : ''}`
  const imageUrl = `/api/og/cup/${slug}/?format=post${yearQuery ? `&${yearQuery}` : ''}`

  return (
    <main className={styles.page}>
      <CupApp
        slug={slug}
        cupId={cup.id}
        cupName={cup.name}
        leagueName={league.name}
        year={cup.season_year}
        status={statusLine(bracket)}
        bracket={bracket}
        notes={cupNotes(bracket)}
        extras={extras}
        stamps={stamps}
        imageUrl={imageUrl}
        seededThrough={cup.seeded_through}
        currentWeek={view.currentWeek}
        // ?reveal=1 replays the latest round's results reveal (how to see it
        // again, or check it before anyone else does).
        forceReveal={(await searchParams).reveal === '1'}
        demo={demo}
        hallHref={`/leagues/${slug}/cup/hall/`}
        leagueHref={leagueHref}
        initialTab={(await searchParams).tab}
        rated={cup.seeds.some((x) => x.rating != null)}
        // The demo is mid-Cup; this says when a real league's starts.
        banner={demo && cup.season_year >= CUP_LAUNCH.year ? <DemoLaunch previewHref={`/leagues/${slug}/cup/?preview=1`} /> : null}
      />

      {/* "Send to the group chat" read as the way to hand picks in, and most
          of the league pressed it thinking they had. Picks save on the tap;
          this only passes the link on, and says so. */}
      <footer className={styles.foot}>
        <p className={styles.footNote}>Picks save on their own. This just shares the page.</p>
        <div className={styles.footActions}>
          <ShareButton className={styles.btnGhost} url={pageUrl} title={`${cup.name} · ${league.name}`} label="Share the Cup link" />
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
