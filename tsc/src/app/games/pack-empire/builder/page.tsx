// /games/pack-empire/builder
//
// Empire Builder's front page: both ways to open the packs, all four difficulties,
// where each board stands today and where you stand on it, as one picker
// (BoardPicker). The table itself is /play/, which this page sends you to
// already set up.

import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { runLeaders } from '@/lib/packEmpire/boardRuns'
import { loadBuilderHub, type HubBoard } from '@/lib/packEmpire/builderHub'
import { peMeta } from '@/lib/packEmpire/meta'
import { boardLabel, builderQuery, isDifficulty, type BuilderFormat, type Difficulty, type Player } from '@/lib/packEmpire/rules'
import mobileStyles from '../../mobile.module.css'
import { PeChrome, PeDock } from '../chrome'
import { peFonts } from '../fonts'
import { TierBadge } from '../TierBadge'
import { BoardPicker } from './BoardPicker'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  themeColor: '#141311',
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = peMeta({
  title: 'Empire Builder · Pack Empire',
  description:
    'Pick a captain, open eleven packs and keep one player from each. Classic or Mystery, four difficulties, eight boards.',
  card: { c: 'builder' },
  alt: 'Empire Builder',
  url: 'https://thesundaychronicle.app/games/pack-empire/builder/',
})

const here = (b: { diff: Difficulty; format: BuilderFormat }) => `/games/pack-empire/builder/${builderQuery(b.diff, b.format)}`

/** The best run anyone has posted today on any board, for the top of the page. */
function Leader({ boards }: { boards: HubBoard[] }) {
  const all = boards.flatMap((b) => b.today.slice(0, 1).map((r) => ({ b, r })))
  const lead = all.sort((x, y) => y.r.score - x.r.score)[0]
  if (!lead) return null
  return (
    <Link href={here(lead.b)} scroll={false} className="pe-bh-lead">
      <small>Best Today</small>
      <b>{lead.r.score.toLocaleString()}</b>
      <span>
        {lead.r.name} · {boardLabel(lead.b.diff, lead.b.format)}
      </span>
      <TierBadge score={lead.r.score} />
    </Link>
  )
}

export default async function BuilderHubPage({ searchParams }: { searchParams: Promise<{ diff?: string; f?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const viewerId = user?.id ?? null
  const mobile = (await getViewMode()) === 'mobile'

  const boards = await loadBuilderHub(viewerId).catch(() => [] as HubBoard[])
  // Classic Standard unless the link asks for another: it's the table to learn on.
  const start = { diff: isDifficulty(sp.diff) ? sp.diff : 'open', format: sp.f === 'mystery' ? 'mystery' : 'classic' } as const
  // Every board's top runs come with their best card, so the picker switches without a trip back here.
  const found = await runLeaders(boards.flatMap((b) => b.today)).catch(() => new Map<string, Player>())
  const leaders = Object.fromEntries(found) as Record<string, Player>

  return (
    <main className={`pe-theme ${peFonts}${mobile ? ` ${mobileStyles.root}` : ''}`}>
      <PeChrome
        active="solo"
        mobile={mobile}
        signedIn={!!user}
        back="/games/pack-empire/"
        backLabel="Pack Empire"
        kicker="Pack Empire"
        title="Empire"
        titleEm="Builder"
      />

      <div className="pe-wrap pe-bh">
        <header className="pe-bh-head">
          <div>
            {!mobile && <div className="pe-kicker">★ Solo · offense unit ★</div>}
            {!mobile && (
              <h1 className="pe-table-title">
                Empire <span className="pe-em">Builder.</span>
              </h1>
            )}
            <p className="pe-bh-lede">Pick a captain, open eleven packs and keep one player from each.</p>
          </div>
          <Leader boards={boards} />
        </header>

        <BoardPicker
          key={`${start.diff}-${start.format}`}
          boards={boards}
          leaders={leaders}
          start={start}
          signedIn={!!user}
          viewerId={viewerId}
        />
      </div>

      {mobile ? <PeDock signedIn={!!user} /> : <SiteFooter />}
    </main>
  )
}
