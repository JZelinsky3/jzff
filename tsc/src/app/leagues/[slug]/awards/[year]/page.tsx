import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadSeasonAwards } from '@/lib/seasonAwards'
import { AwardsDeck } from '../AwardsDeck'
import styles from '../awards.module.css'

export const dynamic = 'force-dynamic'

async function loadLeague(slug: string) {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound()
  const db = createAdminClient()
  const { data } = await db.from('leagues').select('id, name, slug').eq('slug', slug).maybeSingle()
  if (!data) notFound()
  return data as { id: string; name: string; slug: string }
}

function parseYear(raw: string): number {
  const year = Number(raw)
  if (!Number.isInteger(year) || year < 1990 || year > 2100) notFound()
  return year
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; year: string }>
}): Promise<Metadata> {
  const { slug, year: rawYear } = await params
  const year = parseYear(rawYear)
  const league = await loadLeague(slug)
  const title = `${year} awards · ${league.name}`
  const description = `Every ${year} trophy that settles itself: bench points left sitting, schedule luck, the closest game of the year, and the worst score that still won.`
  const url = `https://thesundaychronicle.app/leagues/${slug}/awards/${year}/`
  // Rendered from the same loader the page uses, so the card can never sell a
  // winner the page does not show.
  const image = `/api/og/awards/${slug}/${year}`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title,
      description,
      siteName: 'The Sunday Chronicle',
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image' as const,
      title,
      description,
      images: [image],
    },
  }
}

/**
 * Season awards, decided entirely by the data. There is no ballot here on
 * purpose: the point of these is that they cannot be argued with, only
 * complained about.
 */
export default async function SeasonAwardsPage({
  params,
}: {
  params: Promise<{ slug: string; year: string }>
}) {
  const { slug, year: rawYear } = await params
  const year = parseYear(rawYear)
  const league = await loadLeague(slug)
  const result = await loadSeasonAwards(league.id, year)

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        {/* No site nav on purpose: this is a sheet somebody opens from a link
            in the group chat, reads, and closes. */}
        <header className={styles.head}>
          <div className={styles.kicker}>{league.name}</div>
          <h1>
            The {year} <em>awards</em>
          </h1>
          <p className={styles.lede}>
            Nobody voted on any of this. Every trophy falls straight out of the
            weekly scores and the weekly lineups, so the only thing left to
            argue about is whether it should count.
          </p>
        </header>

        {!result || !result.awards.length ? (
          <p className={styles.empty}>
            There is no {year} season on the books yet.
          </p>
        ) : (
          <>
            {/* One trophy at a time. The deck is a client island; everything
                around it stays server-rendered. */}
            <AwardsDeck awards={result.awards} />

            <p className={styles.note}>
              Weeks 1 to {result.regularWeeks}. Bench figures compare what each
              manager started against the best nine they could have started from
              the roster they had that week, injured reserve excluded. Schedule
              luck is the record each manager would have had playing the whole
              league every week instead of one opponent.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
