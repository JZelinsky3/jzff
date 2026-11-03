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
import { runLeaders, runRarities } from '@/lib/packEmpire/boardRuns'
import { maskCard } from '@/lib/packEmpire/deal'
import { playerById } from '@/lib/packEmpire/pool'
import { loadBuilderHub, type HubBoard } from '@/lib/packEmpire/builderHub'
import { peMeta } from '@/lib/packEmpire/meta'
import {
  RARITIES,
  RARITY_LOOK,
  boardLabel,
  builderQuery,
  isDifficulty,
  type BuilderFormat,
  type Difficulty,
  type Player,
  type Rarity,
} from '@/lib/packEmpire/rules'
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

type Lead = { b: HubBoard; r: HubBoard['today'][number] }

/** The best run anyone has posted today on any board. */
function bestToday(boards: HubBoard[]): Lead | null {
  return boards.flatMap((b) => b.today.slice(0, 1).map((r) => ({ b, r }))).sort((x, y) => y.r.score - x.r.score)[0] ?? null
}

/** The best run today, for the top of the page: who, on which board, the card that
    led it, and the eleven by rarity, a pip a card, best first. */
function Leader({ lead, led, makeup }: { lead: Lead | null; led: Player | undefined; makeup: Partial<Record<Rarity, number>> }) {
  if (!lead) return null
  const pips = [...RARITIES].reverse().flatMap((r) => Array.from({ length: makeup[r] ?? 0 }, () => r))
  return (
    <Link href={here(lead.b)} scroll={false} className="pe-bh-lead">
      <span className="pe-bh-lead-top">
        <span className="pe-bh-lead-score">
          <small>Best Today</small>
          <b>{lead.r.score.toLocaleString()}</b>
        </span>
        <TierBadge score={lead.r.score} />
      </span>
      <span className="pe-bh-lead-who">
        {lead.r.name} · {boardLabel(lead.b.diff, lead.b.format)}
        {led && (
          <>
            {' · '}led by <em style={{ color: RARITY_LOOK[led.rarity].color }}>{led.name}</em> {led.year}
          </>
        )}
      </span>
      {pips.length > 0 && (
        <span className="pe-bh-lead-mix">
          <span className="pe-bh-pips" aria-hidden>
            {pips.map((r, i) => (
              <i key={i} style={{ background: RARITY_LOOK[r].color }} />
            ))}
          </span>
          <span className="pe-bh-mix">
            {[...RARITIES]
              .reverse()
              .filter((r) => makeup[r])
              .map((r) => (
                <span key={r} style={{ color: RARITY_LOOK[r].color }}>
                  {makeup[r]} {RARITY_LOOK[r].label}
                </span>
              ))}
          </span>
        </span>
      )}
    </Link>
  )
}

/** One card dealt the way each difficulty shows it, for the picker's art: that's
    the difference between the four, so it's what the art shows. */
const SAMPLE = 'wr-justin-jefferson-2022'

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
  const lead = bestToday(boards)
  const makeup = lead ? await runRarities(lead.r.runId).catch(() => ({})) : {}
  const sample = playerById(SAMPLE) as Player
  const faces = Object.fromEntries((['range', 'season', 'cap'] as const).map((d) => [d, maskCard(sample, d)])) as Partial<Record<Difficulty, Player>>

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
            {!mobile && <div className="pe-kicker">Solo · offense unit</div>}
            {!mobile && (
              <h1 className="pe-table-title">
                Empire <span className="pe-em">Builder.</span>
              </h1>
            )}
            <p className="pe-bh-lede">Pick a captain, open eleven packs and keep one player from each.</p>
          </div>
          <Leader lead={lead} led={lead ? leaders[lead.r.runId] : undefined} makeup={makeup} />
        </header>

        <BoardPicker
          key={`${start.diff}-${start.format}`}
          boards={boards}
          leaders={leaders}
          faces={faces}
          mobile={mobile}
          start={start}
          signedIn={!!user}
          viewerId={viewerId}
        />
      </div>

      {mobile ? <PeDock signedIn={!!user} /> : <SiteFooter />}
    </main>
  )
}
