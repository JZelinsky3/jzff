import type { Metadata, Viewport } from 'next'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { dailyState, dayKey, isDailyVersion } from '@/lib/packEmpire/daily'
import { dailyViewer } from '@/lib/packEmpire/dailyWho'
import { peMeta } from '@/lib/packEmpire/meta'
import { DIFFICULTY_LOOK } from '@/lib/packEmpire/rules'
import mobileStyles from '../../../mobile.module.css'
import { PeChrome } from '../../chrome'
import { peFonts } from '../../fonts'
import { DailyDraft } from '../DailyDraft'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export async function generateMetadata(): Promise<Metadata> {
  return peMeta({
    title: 'The Daily · Pack Empire',
    description: 'One deal for everyone, one try. Blind cards, wild packs and a new rule every day.',
    card: { c: 'daily', d: dayKey() },
    alt: 'The Daily',
    robots: { index: false, follow: true },
  })
}

export default async function DailyPlayPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams
  const version = isDailyVersion(v) ? v : 'range'
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const mobile = (await getViewMode()) === 'mobile'
  const otherVersion = version === 'range' ? 'season' : 'range'
  const who = await dailyViewer(user?.id ?? null)
  const [state, other] = await Promise.all([dailyState(who, version), dailyState(who, otherVersion)])

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.boardRoot : ''}`.trim()}>
      <PeChrome
        active="daily"
        mobile={mobile}
        signedIn={!!user}
        back="/games/pack-empire/daily/"
        backLabel="The Daily"
        kicker={DIFFICULTY_LOOK[version].label}
        title="The"
        titleEm="Daily"
      />

      <div className="pe-wrap">
        {!mobile && (
          <div className="pe-table-head">
            <div className="pe-kicker">★ The Daily · {DIFFICULTY_LOOK[version].label} ★</div>
            <h1 className="pe-table-title">
              One deal, <span className="pe-em">one try.</span>
            </h1>
          </div>
        )}
        {mobile && <div style={{ height: '0.9rem' }} />}
        <div className="pe-table">
          <DailyDraft
            initial={state}
            other={{
              href: `/games/pack-empire/daily/play/?v=${otherVersion}`,
              label: DIFFICULTY_LOOK[otherVersion].label,
              done: other.done,
            }}
          />
        </div>
      </div>

      {!mobile && <SiteFooter />}
    </main>
  )
}
