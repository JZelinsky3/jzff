import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { dailyState, isDailyVersion } from '@/lib/packEmpire/daily'
import { DIFFICULTY_LOOK } from '@/lib/packEmpire/rules'
import mobileStyles from '../../../mobile.module.css'
import { PeChrome } from '../../chrome'
import { peFonts } from '../../fonts'
import { DailyDraft } from '../DailyDraft'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = { title: 'The Daily · Pack Empire', robots: { index: false, follow: true } }

export default async function DailyPlayPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams
  const version = isDailyVersion(v) ? v : 'range'
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const mobile = (await getViewMode()) === 'mobile'
  const otherVersion = version === 'range' ? 'season' : 'range'
  const [state, other] = user
    ? await Promise.all([dailyState(user.id, version), dailyState(user.id, otherVersion)])
    : [null, null]

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
        {state && other ? (
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
        ) : (
          <div className="pe-panel" style={{ textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
            <p className="pe-panel-text" style={{ marginBottom: '1rem' }}>
              The Daily is one try each, so it needs an account to keep to it. Empire Builder is still free to play
              with no account.
            </p>
            <Link href={`/login?next=${encodeURIComponent(`/games/pack-empire/daily/play/?v=${version}`)}`} className="pe-btn">
              Sign in to play
            </Link>
          </div>
        )}
      </div>

      {!mobile && <SiteFooter />}
    </main>
  )
}
