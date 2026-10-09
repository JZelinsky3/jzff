import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { latestRecapWeek, recapViewable } from '@/lib/recap/load'
import { DEMO_RECAP, isDemoRecap } from '@/lib/recap/demo'
import styles from './recap.module.css'

export const dynamic = 'force-dynamic'

// /leagues/<slug>/recap/ is the link that never goes stale: it always opens
// the latest finished week, so a commissioner can pin it in the group chat
// once.
export default async function LatestRecap({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound()
  if (isDemoRecap(slug)) redirect(`/leagues/${slug}/recap/${DEMO_RECAP.year}/${DEMO_RECAP.week}/`)
  const db = createAdminClient()
  const { data: league } = await db.from('leagues').select('id, name, owner_id, published_at').eq('slug', slug).maybeSingle()
  // Unpublished almanacs are private to their owner; see the week page.
  if (!league || !(await recapViewable(league))) notFound()

  const latest = await latestRecapWeek(league.id as string)
  if (latest) redirect(`/leagues/${slug}/recap/${latest.year}/${latest.week}/`)

  const leagueHref = `/leagues/${slug}/`
  return (
    <div className={styles.page}>
      <div className={styles.sheet}>
        <div className={styles.topBar}>
          <a className={styles.topLeague} href={leagueHref}>
            The Sunday Chronicle
          </a>
          <a className={styles.viewLeague} href={leagueHref}>
            View the league
          </a>
        </div>
        <header className={styles.mast}>
          <h1 className={styles.nameplate}>{league.name as string}</h1>
        </header>
        <p className={styles.emptyNote}>
          No week has finished yet this season. The first recap shows up here once week 1 is final.
        </p>
      </div>
    </div>
  )
}
