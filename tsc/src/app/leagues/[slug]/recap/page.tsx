import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { latestRecapWeek } from '@/lib/recap/load'
import styles from './recap.module.css'

export const dynamic = 'force-dynamic'

// /leagues/<slug>/recap/ is the link that never goes stale: it always opens
// the latest finished week, so a commissioner can pin it in the group chat
// once.
export default async function LatestRecap({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound()
  const db = createAdminClient()
  const { data: league } = await db.from('leagues').select('id, name, published_at').eq('slug', slug).maybeSingle()
  // Unpublished almanacs are private; see the week page.
  if (!league || !league.published_at) notFound()

  const latest = await latestRecapWeek(league.id as string)
  if (latest) redirect(`/leagues/${slug}/recap/${latest.year}/${latest.week}/`)

  const leagueHref = `/leagues/${slug}/`
  return (
    <div className={styles.page}>
      <section className={`${styles.band} ${styles.bandMast}`}>
        <div className={styles.bandInner}>
          <div className={styles.topBar}>
            <a className={styles.topLeague} href={leagueHref}>
              {league.name as string}
            </a>
            <a className={styles.viewLeague} href={leagueHref}>
              View the league
            </a>
          </div>
          <h1 className={styles.mastTitle}>
            The <em>recap</em>
          </h1>
          <p className={styles.emptyNote}>
            No week has finished yet this season. The first recap shows up here the Tuesday after week 1.
          </p>
        </div>
      </section>
    </div>
  )
}
