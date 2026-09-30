import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { latestRecapWeek } from '@/lib/recap/load'
import styles from './recap.module.css'

export const dynamic = 'force-dynamic'

// /leagues/<slug>/recap/ is the link that never goes stale: it always opens
// the latest finished week.
export default async function LatestRecap({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound()
  const db = createAdminClient()
  const { data: league } = await db.from('leagues').select('id, name, published_at').eq('slug', slug).maybeSingle()
  // Unpublished almanacs are private; see the week page.
  if (!league || !league.published_at) notFound()

  const latest = await latestRecapWeek(league.id as string)
  if (latest) redirect(`/leagues/${slug}/recap/${latest.year}/${latest.week}/`)

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.head}>
          <a className={styles.kicker} href={`/leagues/${slug}/`}>{league.name as string}</a>
          <h1>The <em>recap</em></h1>
        </header>
        <p className={styles.empty}>
          No week has finished yet this season. The first recap shows up here the Tuesday after week 1.
        </p>
      </div>
    </div>
  )
}
