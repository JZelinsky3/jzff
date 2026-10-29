import type { Metadata, Viewport } from 'next'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../mobile.module.css'
import { PeChrome } from '../chrome'
import { peFonts } from '../fonts'
import { EmpireBuilder } from './EmpireBuilder'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  themeColor: '#141311',
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  title: 'Empire Builder · Pack Empire',
  description:
    'Pick a captain, open eleven packs and keep one player from each. The best offenses anyone has built go on the board.',
  alternates: { canonical: 'https://thesundaychronicle.app/games/pack-empire/play/' },
}

export default async function EmpireBuilderPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const mobile = (await getViewMode()) === 'mobile'

  return (
    // A board on a phone: the bar's back button and nothing else. The draft
    // owns the bottom of the screen, so there's no dock under it.
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.boardRoot : ''}`.trim()}>
      <PeChrome
        mobile={mobile}
        signedIn={!!user}
        back="/games/pack-empire/"
        backLabel="Pack Empire"
        kicker="Pack Empire"
        title="Empire"
        titleEm="Builder"
      />

      <div className="pe-wrap">
        {!mobile && (
          <div className="pe-table-head">
            <div className="pe-kicker">★ Solo · offense unit ★</div>
            <h1 className="pe-table-title">
              Your ultimate <span className="pe-em">offense.</span>
            </h1>
          </div>
        )}
        {mobile && <div style={{ height: '0.9rem' }} />}
        <EmpireBuilder signedIn={!!user} />
      </div>

      {!mobile && <SiteFooter />}
    </main>
  )
}
