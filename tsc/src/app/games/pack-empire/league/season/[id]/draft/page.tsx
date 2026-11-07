// /games/pack-empire/league/season/<id>/draft
//
// Draft Day for your Season team. Only your own team: anyone else is sent to
// the league's home.

import type { Metadata, Viewport } from 'next'
import { notFound, redirect } from 'next/navigation'
import { seasonView } from '@/lib/packEmpire/season'
import { seasonViewer } from '@/lib/packEmpire/seasonWho'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../../../../mobile.module.css'
import { PeChrome } from '../../../../chrome'
import { peFonts } from '../../../../fonts'
import { SeasonDraft } from '../../SeasonDraft'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = { title: 'Draft Day · Pack Empire Season', robots: { index: false, follow: false } }

export default async function SeasonDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const view = await seasonView(id.toUpperCase(), await seasonViewer(user?.id ?? null))
  if (!view) notFound()
  if (!view.me || view.league.phase === 'pregame') redirect(`/games/pack-empire/league/season/${view.league.id}/`)
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
        title="Draft"
        titleEm="Day"
      />
      <div className="pe-draft">
        <SeasonDraft leagueId={view.league.id} initial={view.me} />
      </div>
    </main>
  )
}
