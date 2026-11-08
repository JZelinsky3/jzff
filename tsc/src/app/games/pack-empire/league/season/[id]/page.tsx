// /games/pack-empire/league/season/<id>
//
// A Season league's home: League Mode's Season variation (lib/packEmpire/season.ts).
// Anyone with the link can look; a team's own controls only show to that team,
// and the commissioner's to the commissioner. A solo season played signed out
// belongs to this browser's guest cookie (seasonWho.ts).

import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { peMeta } from '@/lib/packEmpire/meta'
import { seasonView } from '@/lib/packEmpire/season'
import { seasonViewer } from '@/lib/packEmpire/seasonWho'
import { roundName } from '@/lib/packEmpire/seasonRules'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../../../mobile.module.css'
import { PeChrome, PeDock } from '../../../chrome'
import { peFonts } from '../../../fonts'
import { SeasonHub } from '../SeasonHub'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const v = await seasonView(id.toUpperCase(), null)
  const champ = v?.table.find((r) => r.champion)
  return peMeta({
    title: v ? `${v.league.name} · Pack Empire Season` : 'League Mode · Pack Empire',
    description: champ ? `${champ.teamName} won it all.` : 'Draft once, then eight games against eight defenses, at your own pace.',
    card: { c: 'league' },
    alt: 'A Pack Empire Season',
    robots: { index: false, follow: false },
  })
}

export default async function SeasonHome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const view = await seasonView(id.toUpperCase(), await seasonViewer(user?.id ?? null))
  if (!view) notFound()
  const mobile = (await getViewMode()) === 'mobile'
  const l = view.league

  const where =
    l.phase === 'pregame'
      ? `${view.table.length} of ${l.maxPlayers} teams`
      : l.phase === 'regular'
        ? view.me
          ? `Game ${Math.min(8, (view.me.games.filter((g) => g.phase === 'regular').length ?? 0) + 1)} of 8`
          : 'Regular season'
        : l.phase === 'playoffs'
          ? roundName(l.round, l.rounds)
          : 'Final'

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.root : ''}`.trim()}>
      <PeChrome
        active="league"
        mobile={mobile}
        signedIn={!!user}
        back="/games/pack-empire/league/"
        backLabel="League Mode"
        kicker="Season"
        title={l.name}
      />
      <div className="pe-wrap pe-wrap--season" style={{ margin: '0 auto' }}>
        <div className="pe-table-head pe-sn-head-l">
          <div className="pe-kicker">
            {l.kind === 'solo' ? 'Solo' : 'League'} · Season {l.seasonNumber} · {where}
          </div>
          <h1 className="pe-table-title">{l.name}</h1>
          {view.me && <p className="pe-table-sub">{view.me.teamName}</p>}
        </div>
        <SeasonHub initial={view} />
      </div>
      {mobile ? <PeDock signedIn={!!user} /> : <SiteFooter />}
    </main>
  )
}
