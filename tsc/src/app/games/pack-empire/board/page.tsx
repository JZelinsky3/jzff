// /games/pack-empire/board?kind=best|career
//
// One board for the whole site: everybody opens packs from the same pool, so
// there is no league to choose. One per difficulty, never merged: a blind 13,000
// isn't an open 13,000. The game's own room rather than the shared board page:
// its masthead, the three best runs stood behind the best card each one pulled,
// and every other run led by its own.

import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { loadBoard, type BestRow, type Board, type BoardKind, type CareerRow } from '@/lib/minigames/leaderboard'
import { runLeaders } from '@/lib/packEmpire/boardRuns'
import { peMeta } from '@/lib/packEmpire/meta'
import { DIFFICULTIES, DIFFICULTY_LOOK, RARITY_LOOK, isDifficulty, type Difficulty, type Player } from '@/lib/packEmpire/rules'
import { when } from '../../BoardTable'
import mobileStyles from '../../mobile.module.css'
import { RunRow, runScore } from '../BoardRows'
import { PackCard } from '../cards'
import { PeChrome, PeDock } from '../chrome'
import { peFonts } from '../fonts'
import { TierBadge } from '../TierBadge'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  themeColor: '#141311',
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = peMeta({
  title: 'The Board · Pack Empire',
  description: 'The best offenses anyone has opened, every pack re-dealt and checked.',
  card: { c: 'board' },
  alt: 'The Pack Empire board',
  robots: { index: false, follow: true },
})

const KINDS: { kind: BoardKind; label: string }[] = [
  { kind: 'best', label: 'Best Runs' },
  { kind: 'career', label: 'Career' },
]

function boardHref(diff: Difficulty, kind: BoardKind): string {
  const query = [diff === 'open' ? '' : `diff=${diff}`, kind === 'career' ? 'kind=career' : ''].filter(Boolean).join('&')
  return `/games/pack-empire/board/${query ? `?${query}` : ''}`
}

/** One of the top three, stood behind the best card it pulled. */
function Plate({ row, place, led, mine }: { row: BestRow; place: number; led?: Player; mine: boolean }) {
  return (
    <div
      className={`pe-brd-plate${mine ? ' mine' : ''}`}
      data-place={place}
      style={led ? ({ '--rc': RARITY_LOOK[led.rarity].color } as React.CSSProperties) : undefined}
    >
      <span className="pe-brd-place" aria-hidden>
        {place}
      </span>
      {led && <PackCard player={led} revealed />}
      <div className="pe-brd-name">{row.name}</div>
      <div className="pe-brd-score">{runScore(row).toLocaleString()}</div>
      <TierBadge score={row.score} />
      <div className="pe-top-date">{when(row.at)}</div>
    </div>
  )
}

function BestRuns({ board, leaders, viewerId }: { board: Extract<Board, { kind: 'best' | 'weekly' }>; leaders: Map<string, Player>; viewerId: string | null }) {
  const { rows, you, total } = board
  if (rows.length === 0) {
    return <p className="pe-empty pe-brd-none">Nothing on this board yet. The first finished run takes the top spot.</p>
  }
  // Below three there's no podium to build, so a short board stays a list.
  const podium = rows.length >= 3 ? rows.slice(0, 3) : []
  const rest = rows.slice(podium.length)
  const isMine = (r: BestRow) => viewerId != null && r.userId === viewerId
  const youShown = you != null && rows.some((r) => r.runId === you.runId)

  return (
    <>
      {podium.length > 0 && (
        <div className="pe-brd-podium">
          {podium.map((r, i) => (
            <Plate key={r.runId} row={r} place={i + 1} led={leaders.get(r.runId)} mine={isMine(r)} />
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <div className="pe-top pe-brd-rows">
          {rest.map((r) => (
            <RunRow key={r.runId} row={r} led={leaders.get(r.runId)} face dated mine={isMine(r)} />
          ))}
        </div>
      )}
      {you && !youShown && (
        <>
          <div className="pe-top pe-brd-rows pe-brd-pinned">
            <RunRow row={you} led={leaders.get(you.runId)} face dated mine />
          </div>
          <p className="pe-brd-note">Your best of {total.toLocaleString()} runs on this board.</p>
        </>
      )}
    </>
  )
}

function CareerLine({ row, mine, toGo }: { row: CareerRow; mine: boolean; toGo?: number }) {
  return (
    <div className={`pe-top-row${mine ? ' mine' : ''}`}>
      <span className="pe-top-rank">{row.rank ?? '·'}</span>
      <span className="pe-top-who">
        <span className="pe-top-name">{row.name}</span>
        <span className="pe-top-led">
          {row.runs} {row.runs === 1 ? 'run' : 'runs'}
          {toGo != null ? `, ${toGo} to go` : `, best ${Number(row.best).toLocaleString()}`}
        </span>
      </span>
      <span className="pe-top-run">
        <span className="pe-top-score">{Math.round(row.rate).toLocaleString()}</span>
        <TierBadge score={row.rate} />
      </span>
    </div>
  )
}

function Career({ board, viewerId }: { board: Extract<Board, { kind: 'career' }>; viewerId: string | null }) {
  const { rows, minRuns } = board
  if (rows.length === 0) {
    return <p className="pe-empty pe-brd-none">Nobody has {minRuns} runs in yet. This board needs a few sessions before it says anything.</p>
  }
  const qualified = rows.filter((r) => r.qualified)
  const waiting = rows.filter((r) => !r.qualified)
  const line = (r: CareerRow, toGo?: number) => <CareerLine key={r.userId} row={r} mine={viewerId != null && r.userId === viewerId} toGo={toGo} />
  return (
    <>
      <p className="pe-brd-note">Your average over every run, so playing more can&apos;t buy a place. {minRuns} runs to qualify.</p>
      {qualified.length > 0 && <div className="pe-top pe-brd-rows">{qualified.map((r) => line(r))}</div>}
      {waiting.length > 0 && (
        <>
          <div className="pe-brd-sub">Still Qualifying</div>
          <div className="pe-top pe-brd-rows">{waiting.map((r) => line(r, minRuns - r.runs))}</div>
        </>
      )}
    </>
  )
}

export default async function PackEmpireBoard({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; diff?: string }>
}) {
  const sp = await searchParams
  const kind: BoardKind = sp.kind === 'career' ? 'career' : 'best'
  const diff: Difficulty = isDifficulty(sp.diff) ? sp.diff : 'open'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const viewerId = user?.id ?? null
  const mobile = (await getViewMode()) === 'mobile'

  const board = await loadBoard(kind, { game: 'pack-empire', mode: DIFFICULTY_LOOK[diff].mode, poolId: 'site' }, viewerId)
  const best = board.kind === 'career' ? null : board
  const leaders = best
    ? await runLeaders(best.you ? [...best.rows, best.you] : best.rows).catch(() => new Map<string, Player>())
    : new Map<string, Player>()
  const play = `/games/pack-empire/play/${diff === 'open' ? '' : `?diff=${diff}`}`

  return (
    <main className={`pe-theme ${peFonts}${mobile ? ` ${mobileStyles.root}` : ''}`}>
      <PeChrome
        mobile={mobile}
        signedIn={!!user}
        back="/games/pack-empire/"
        backLabel="Pack Empire"
        kicker="Pack Empire"
        title="The"
        titleEm="Board"
        active="board"
      />

      <div className="pe-wrap pe-brd">
        <header className="pe-brd-head">
          {!mobile && (
            <div>
              <div className="pe-kicker">★ Every pack re-dealt and checked ★</div>
              <h1 className="pe-brd-title">
                The <span className="pe-em">Board.</span>
              </h1>
            </div>
          )}
          <div className="pe-brd-stand">
            {best?.you ? (
              <div className="pe-brd-you">
                <span>Your Best</span>
                <b>{runScore(best.you).toLocaleString()}</b>
                <span>
                  No. {best.you.rank} of {best.total.toLocaleString()}
                </span>
              </div>
            ) : (
              best && best.total > 0 && <div className="pe-brd-count">{best.total.toLocaleString()} runs on this board</div>
            )}
            <Link href={play} className="pe-btn pe-btn--sm">
              Build an offense
            </Link>
          </div>
        </header>

        <div className="pe-brd-bar">
          <nav className="pe-brd-diffs" aria-label="Difficulty">
            {DIFFICULTIES.map((d) => (
              <Link key={d} href={boardHref(d, kind)} aria-current={d === diff ? 'page' : undefined}>
                {DIFFICULTY_LOOK[d].label}
              </Link>
            ))}
          </nav>
          <nav className="pe-brd-kinds" aria-label="Ranking">
            {KINDS.map((k) => (
              <Link key={k.kind} href={boardHref(diff, k.kind)} aria-current={k.kind === kind ? 'page' : undefined}>
                {k.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="pe-brd-line">{DIFFICULTY_LOOK[diff].line}</p>

        {board.kind === 'career' ? <Career board={board} viewerId={viewerId} /> : <BestRuns board={board} leaders={leaders} viewerId={viewerId} />}
      </div>

      {mobile ? <PeDock signedIn={!!user} /> : <SiteFooter />}
    </main>
  )
}
