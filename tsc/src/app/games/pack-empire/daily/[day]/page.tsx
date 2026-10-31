import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { dailyDay, dayKey, isDay } from '@/lib/packEmpire/daily'
import mobileStyles from '../../../mobile.module.css'
import { PeChrome, PeDock } from '../../chrome'
import { peFonts } from '../../fonts'
import { DailyTop, longDay } from '../parts'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = { title: 'A Past Daily · Pack Empire', robots: { index: false, follow: true } }

export default async function DailyDayPage({ params }: { params: Promise<{ day: string }> }) {
  const { day } = await params
  if (!isDay(day) || day > dayKey()) notFound()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const mobile = (await getViewMode()) === 'mobile'
  const data = await dailyDay(day, user?.id ?? null)

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.root : ''}`.trim()}>
      <PeChrome
        active="daily"
        mobile={mobile}
        signedIn={!!user}
        back="/games/pack-empire/daily/"
        backLabel="The Daily"
        kicker="The Daily"
        title={data.rule.title}
      />

      <div className="pe-wrap pe-wrap--narrow" style={{ margin: '0 auto' }}>
        <div className="pe-table-head">
          <div className="pe-kicker">★ {longDay(day)} ★</div>
          <h1 className="pe-table-title">
            <span className="pe-em">{data.rule.title}.</span>
          </h1>
          <p className="pe-table-sub">{data.rule.line}</p>
        </div>
        <div className="pe-twoup">
          {data.boards.map((b) => (
            <DailyTop key={b.version} board={b} empty="Nobody finished this one." />
          ))}
        </div>
      </div>

      {mobile ? <PeDock signedIn={!!user} /> : <SiteFooter />}
    </main>
  )
}
