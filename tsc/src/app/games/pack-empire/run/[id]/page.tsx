import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { peMeta } from '@/lib/packEmpire/meta'
import { DIFFICULTY_LOOK } from '@/lib/packEmpire/rules'
import { loadRun } from '@/lib/packEmpire/share'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../../mobile.module.css'
import { LineupSheet } from '../../cards'
import { PeChrome, PeDock } from '../../chrome'
import { peFonts } from '../../fonts'
import { TierBadge } from '../../TierBadge'

// One offense off the board: where a shared Builder score lands. Everything on
// it was replayed by the server when it posted, so it's all public already; a
// blind run's cards were turned over by that same post.

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const run = await loadRun(id)
  if (!run) return { title: 'Empire Builder · Pack Empire', robots: { index: false, follow: false } }
  return peMeta({
    title: `${run.name}'s Offense: ${run.score.toLocaleString('en-US')} · Pack Empire`,
    description: `${run.tier.label} on ${DIFFICULTY_LOOK[run.difficulty].label}. Open eleven packs and beat it.`,
    card: { c: 'run', id: run.id },
    alt: `${run.name}'s offense`,
    robots: { index: false, follow: false },
  })
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await loadRun(id)
  if (!run) notFound()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const mobile = (await getViewMode()) === 'mobile'
  const label = DIFFICULTY_LOOK[run.difficulty].label

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.root : ''}`.trim()}>
      <PeChrome
        active="solo"
        mobile={mobile}
        signedIn={!!user}
        back="/games/pack-empire/"
        backLabel="Pack Empire"
        kicker="Empire Builder"
        title={`${run.name}'s Offense`}
      />
      <div className="pe-wrap pe-wrap--narrow" style={{ margin: '0 auto' }}>
        <div className="pe-table-head">
          <div className="pe-kicker">★ Empire Builder · {label} ★</div>
          <h1 className="pe-table-title">{run.name}&apos;s Offense</h1>
        </div>

        <div className="pe-recap landed" style={{ '--tc': run.tier.color } as React.CSSProperties}>
          <div className="pe-recap-score">{run.score.toLocaleString()}</div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
            <TierBadge score={run.score} />
          </div>
          <div className="pe-recap-actions">
            <Link href={run.difficulty === 'open' ? '/games/pack-empire/play/' : `/games/pack-empire/play/?diff=${run.difficulty}`} className="pe-btn">
              Build yours
            </Link>
            <Link href="/games/pack-empire/board/" className="pe-btn pe-btn--quiet">
              The board
            </Link>
          </div>
        </div>

        <LineupSheet name="The Eleven" lineup={run.lineup} captain={run.captain} />
      </div>
      {mobile ? <PeDock signedIn={!!user} /> : <SiteFooter />}
    </main>
  )
}
