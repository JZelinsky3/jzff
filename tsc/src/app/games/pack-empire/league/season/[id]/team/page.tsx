// /games/pack-empire/league/season/<id>/team
//
// Your Season team: starters with their archetypes, the bench, subs.

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

export const metadata: Metadata = { title: 'Your Team · Pack Empire Season', robots: { index: false, follow: false } }

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
      <div className="pe-wrap pe-wrap--narrow" style={{ margin: '0 auto' }}>
        <div className="pe-table-head">
          <div className="pe-kicker">Your team</div>
          <h1 className="pe-table-title">{view.me.teamName}</h1>
          <p className="pe-table-sub">
            Every card&apos;s value goes into the lanes it plays. Better players carry more of every lane, and a front built to stop one kind of player hurts a common one most.
          </p>
        </div>
        <SeasonTeam leagueId={view.league.id} initial={view.me} />
      </div>
      {mobile ? <PeDock signedIn={!!user} /> : <SiteFooter />}
    </main>
  )
}
