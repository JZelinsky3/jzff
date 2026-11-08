// /games/pack-empire/league/season/<id>/team
//
// Your Season lineup: the eleven on the turf, the bench, subs, and a scouting
// report on your own team (SeasonTeam.tsx).

import type { Metadata, Viewport } from 'next'
import { notFound, redirect } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { seasonView } from '@/lib/packEmpire/season'
import { seasonViewer } from '@/lib/packEmpire/seasonWho'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../../../../mobile.module.css'
import { PeChrome, PeDock } from '../../../../chrome'
import { peFonts } from '../../../../fonts'
import { SeasonTeam } from '../../SeasonTeam'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = { title: 'Lineup · Pack Empire Season', robots: { index: false, follow: false } }

export default async function SeasonTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const view = await seasonView(id.toUpperCase(), await seasonViewer(user?.id ?? null))
  if (!view) notFound()
  if (!view.me || view.me.step !== 'season') redirect(`/games/pack-empire/league/season/${view.league.id}/`)
  const mobile = (await getViewMode()) === 'mobile'

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.root : ''}`.trim()}>
      <PeChrome
        active="league"
        mobile={mobile}
        signedIn={!!user}
        back={`/games/pack-empire/league/season/${view.league.id}/`}
        backLabel={view.league.name}
        kicker="Season"
        title={view.me.teamName}
      />
      <div className="pe-wrap pe-wrap--season" style={{ margin: '0 auto' }}>
        <div className="pe-table-head pe-sn-head-l">
          <div className="pe-kicker">{view.league.name} · Lineup</div>
          <h1 className="pe-table-title">{view.me.teamName}</h1>
        </div>
        <SeasonTeam initial={view} />
      </div>
      {mobile ? <PeDock signedIn={!!user} /> : <SiteFooter />}
    </main>
  )
}
