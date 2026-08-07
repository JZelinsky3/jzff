import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadSeasonAwards } from '@/lib/seasonAwards'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'
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
  return {
    title,
    description,
    openGraph: { type: 'article', title, description, siteName: 'The Sunday Chronicle' },
    twitter: { card: 'summary_large_image' as const, title, description },
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
        <header className={styles.head}>
          <BackButton fallbackHref={`/leagues/${slug}/`} />
          <div className={styles.kicker}>{league.name}</div>
          <h1>
            The {year} <em>awards</em>
          </h1>
          <p className={styles.lede}>
            Nobody voted on any of this. Every trophy below falls straight out of
            the weekly scores and the weekly lineups, regular season only, which
            means the only thing left to argue about is whether it should count.
          </p>
        </header>

        {!result || !result.awards.length ? (
          <p className={styles.empty}>
            There is no {year} season on the books yet.
          </p>
        ) : (
          <>
            <div className={styles.grid}>
              {result.awards.map((award) => (
                <section className={styles.award} key={award.key}>
                  <div className={styles.awardTop}>
                    <h2 className={styles.awardTitle}>{award.title}</h2>
                    <span className={styles.awardKicker}>{award.kicker}</span>
                  </div>

                  <div className={styles.winnerRow}>
                    <span className={styles.winnerName}>{award.winner}</span>
                    <span className={styles.winnerValue}>{award.value}</span>
                  </div>

                  <p className={styles.detail}>{award.detail}</p>

                  {award.runners.length > 0 && (
                    <div className={styles.runners}>
                      <span className={styles.runnersLabel}>Next</span>
                      {award.runners.map((r) => (
                        <span className={styles.runner} key={r.name}>
                          <b>{r.name}</b>
                          <span>{r.value}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>

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
      <SiteFooter />
    </div>
  )
}
