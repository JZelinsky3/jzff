import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { loadReportCached } from '@/lib/report/cached'
import { REPORT_WEEKS } from '@/lib/report/build'
import { reportLeague } from './ReportPage'
import styles from './report.module.css'

export const dynamic = 'force-dynamic'

function listWeeks(w: number[]): string {
  return w.length > 1 ? `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}` : String(w[0] ?? '')
}

// /leagues/<slug>/report/ always opens the newest edition. Before the first
// one is out it says when it will be, rather than 404ing a link that will
// work in a week or two.
export default async function LatestReport({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const league = await reportLeague(slug)
  const r = await loadReportCached(league, null)
  if (r.status === 'ok') redirect(`/leagues/${slug}/report/${r.view.week}/`)
  if (r.status === 'none') notFound()
  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <div className={styles.headInner}>
          <p className={styles.school}>
            {league.name} · {r.year} season
          </p>
          <h1 className={styles.title}>Progress Report</h1>
          <p className={styles.pending}>
            {r.firstWeek
              ? `The first report comes out after week ${r.firstWeek}: playoff odds and a report card for every manager, after weeks ${listWeeks(REPORT_WEEKS)}.`
              : 'This season is too short for a report.'}
          </p>
          <div className={styles.actions}>
            <Link className={styles.btn} href={`/leagues/${slug}/`}>
              View the league
            </Link>
          </div>
        </div>
      </header>
    </main>
  )
}
