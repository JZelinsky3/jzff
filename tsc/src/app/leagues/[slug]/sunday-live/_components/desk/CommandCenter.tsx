'use client'

// The command center: the desk's format, graduated from the lab bench.
// The wire running down the LEFT, the featured game big in the middle with
// both box scores under it, and the monitor wall down the RIGHT (click any
// set to pin that game on the main monitor). The center column sets the
// room's height (full box scores, no clipping); the rails match it and
// scroll inside. The main monitor carries the full stage kit: records,
// power banners, the series, the form plates, pin.
//
// Rotation lives with the caller: the production desk feeds the 45s
// storyline-boosted rotation from SundayLiveApp (hover pauses it via
// onHover), the lab feeds its own simple 12s surf. Watching/pinning is one
// gesture here: clicking a set or a bulletin pins that game until unpinned.

import type { SlLeague, SlMatchup, SlPlayer, SlSide, Storyline, StorylineCategory } from '@/lib/sundayLive/types'
import type { SlWeekContext, SlWeekMatchupContext } from '@/lib/sundayLive/seasonContext'
import { Avatar } from './Scorebug'
import { PlayerPips } from './PlayerPips'
import { WpMeter } from './WpMeter'
import { StarterTable } from './StarterTable'
import { FeaturedSide, voteCounts, pickedSide, standingsRanks } from './FeaturedSide'
import { GameNotes, buildGameNotes } from './GameNotes'
import { SeriesBlock, seriesLines, ScoreBoard } from './Stage'
import { fmtPts } from '../../_lib/format'

// One clearly-separated hue per category in EVERY world: blue, brass, red,
// berry, green. (glow and cream both collapse into the navy family in the
// day world, which made three near-identical blues — Joey's complaint.)
const CATEGORY_COLOR: Record<StorylineCategory, string> = {
  game: 'var(--sl-navy)',
  player: 'var(--sl-gold)',
  revenge: 'var(--sl-live)',
  history: 'var(--sl-pick)',
  league: 'var(--sl-up)',
}

// Column heights: the center column (monitor plus both full box scores)
// sets the room's height naturally, so every starter is always visible with
// no scrolling. The wire and the wall are absolutely-positioned rails inside
// their grid cells, so they stretch to exactly that height and scroll inside.

/* ── Right: the monitor wall ────────────────────────────────── */

// Long names shrink to fit the set instead of truncating mid-word. Character
// count alone misjudges width badly (caps run much wider than lowercase in
// the serif), so estimate the rendered width in ems and size against the
// pixels actually left beside the avatar, score, and record chip.
function nameEm(name: string): number {
  let em = 0
  for (const ch of name) {
    if (ch === ' ') em += 0.28
    else if (ch === 'M' || ch === 'W') em += 0.95
    else if (ch >= 'A' && ch <= 'Z') em += 0.68
    else if ("ilftj.'-".includes(ch)) em += 0.3
    else em += 0.5
  }
  return Math.max(em, 0.5)
}

function wallNameSize(name: string, hasRecord: boolean): number {
  const budget = hasRecord ? 118 : 146
  return Math.max(8, Math.min(13, budget / nameEm(name)))
}

function WallRow({
  side,
  winning,
  record,
}: {
  side: SlSide
  winning: boolean
  record: string | null
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar side={side} px={30} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span
            className={`sl-display sl-thick min-w-0 truncate leading-tight ${winning ? '' : 'text-sl-text'}`}
            style={{
              fontSize: wallNameSize(side.teamName, record != null),
              color: winning ? 'var(--sl-glow)' : undefined,
            }}
          >
            {side.teamName}
          </span>
          {record && <span className="sl-num shrink-0 text-[9.5px] text-sl-dim">{record}</span>}
        </span>
        <PlayerPips
          total={side.players.filter((p) => p.isStarter).length}
          left={side.playersRemaining}
        />
      </span>
      <span className={`sl-num text-[17px] leading-none ${winning ? 'sl-phosphor' : 'text-sl-text'}`}>
        {fmtPts(side.score)}
      </span>
    </div>
  )
}

function WallSet({
  m,
  wc,
  channel,
  active,
  onWatch,
}: {
  m: SlMatchup
  wc: SlWeekMatchupContext | null
  channel: number
  active: boolean
  onWatch: () => void
}) {
  const live = m.status === 'live'
  return (
    <button
      type="button"
      onClick={onWatch}
      className={`sl-crt block h-full w-full text-left ${live ? 'sl-crt-live' : ''} ${
        active ? 'outline outline-2 outline-offset-2 outline-sl-gold/70' : ''
      }`}
      title="Put this game on the main monitor"
    >
      <div className="relative z-10 flex h-full flex-col justify-between gap-1.5 p-3">
        <div className="flex items-center justify-between">
          <span className="sl-num text-[9px] tracking-[0.2em]" style={{ color: 'var(--sl-text)', opacity: 0.85 }}>
            CH {String(channel).padStart(2, '0')}
          </span>
          {live ? (
            <span className="sl-live-dot" style={{ width: 5, height: 5 }} />
          ) : (
            <span className="sl-num text-[9px] text-sl-dim">{m.status === 'final' ? 'FINAL' : 'PRE'}</span>
          )}
        </div>
        <WallRow side={m.a} winning={m.a.score >= m.b.score} record={wc?.recordA ?? null} />
        <WallRow side={m.b} winning={m.b.score > m.a.score} record={wc?.recordB ?? null} />
      </div>
    </button>
  )
}

/* ── Center: the main monitor ───────────────────────────────── */

// Keyed on the score so a change remounts the span and replays the bump
// flash; only a finished game dims its loser.
function MonitorScore({
  side,
  dim,
  scoreDelta,
}: {
  side: SlSide
  dim: boolean
  scoreDelta?: Map<number, number>
}) {
  const bumped = (scoreDelta?.get(side.rosterId) ?? 0) > 0
  return (
    <span
      key={side.score}
      className={`sl-num text-[44px] leading-none ${dim ? 'text-sl-dim' : ''} ${bumped ? 'sl-bump' : ''}`}
      style={dim ? undefined : { color: 'var(--sl-heading, var(--sl-text))' }}
    >
      {fmtPts(side.score)}
    </span>
  )
}

function MainMonitor({
  m,
  frame,
  weekContext,
  pinned,
  onTogglePin,
  gameHref,
  scoreDelta,
}: {
  m: SlMatchup
  frame: SlLeague
  weekContext: SlWeekContext | null
  pinned: boolean
  onTogglePin: () => void
  gameHref?: (matchupId: number) => string
  scoreDelta?: Map<number, number>
}) {
  const final = m.status === 'final'
  const aWinning = m.a.score >= m.b.score
  const wc = weekContext?.matchups[m.matchupId] ?? null
  const series = seriesLines(m, wc)
  const notes = buildGameNotes(m, frame.storylines, frame.wpBounds?.[String(m.matchupId)], wc)
  const votes = voteCounts(m)
  const fav = pickedSide(m)
  const ranks = standingsRanks(frame, weekContext)
  return (
    <div className="sl-hoverable sl-panel-raised space-y-4 p-5">
      <div className="flex items-center justify-between">
        {m.status === 'live' ? (
          <span className="sl-chip border-sl-live/40 text-sl-live!">
            <span className="sl-live-dot" style={{ width: 5, height: 5 }} /> LIVE
          </span>
        ) : (
          <span className="sl-kicker">{final ? 'FINAL' : 'UP NEXT'}</span>
        )}
        <div className="flex items-center gap-2">
          {gameHref && (
            <a
              href={gameHref(m.matchupId)}
              className="sl-tip relative sl-chip transition-colors hover:text-sl-text"
              data-tip="Open this game's own page"
            >
              FULL GAME
            </a>
          )}
          <button
            type="button"
            onClick={onTogglePin}
            className={`sl-tip relative sl-chip transition-colors hover:text-sl-text ${pinned ? 'border-sl-gold/60 text-sl-gold!' : ''}`}
            data-tip={pinned ? 'Unpin and follow the sweatiest game' : 'Keep this game on the monitor'}
          >
            {pinned ? 'PINNED' : 'PIN'}
          </button>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <FeaturedSide
          side={m.a}
          dim={final && !aWinning}
          record={wc?.recordA ?? null}
          power={wc?.powerA ?? null}
          votes={votes?.a ?? null}
          picked={fav === 'A'}
          form={wc?.formA ?? null}
          standing={ranks.get(m.a.rosterId) ?? null}
          avatarPx={76}
          namePx={21}
        />
        <div className="justify-self-center">
          <ScoreBoard
            a={<MonitorScore side={m.a} dim={final && !aWinning} scoreDelta={scoreDelta} />}
            vs={<span className="sl-display pb-1.5 text-[15px] italic text-sl-dim">vs</span>}
            b={<MonitorScore side={m.b} dim={final && aWinning} scoreDelta={scoreDelta} />}
            projA={m.a.projected}
            projB={m.b.projected}
          />
        </div>
        <FeaturedSide
          side={m.b}
          dim={final && aWinning}
          record={wc?.recordB ?? null}
          power={wc?.powerB ?? null}
          votes={votes?.b ?? null}
          picked={fav === 'B'}
          form={wc?.formB ?? null}
          standing={ranks.get(m.b.rosterId) ?? null}
          avatarPx={76}
          namePx={21}
          right
        />
      </div>

      <div className="mx-auto w-full max-w-[420px]">
        <WpMeter matchup={m} />
        {/* Reserved even when there is no series yet, so switching sets on
            the wall never resizes the monitor. */}
        <div className="min-h-[50px]">{series && <SeriesBlock series={series} />}</div>
      </div>

      <GameNotes notes={notes} fixed />
    </div>
  )
}

/* ── Left: the wire ─────────────────────────────────────────── */

// "Who is this about": owners when the line names rosters, else the game.
function pertainsLookup(frame: SlLeague): (s: Storyline) => string | null {
  const owners = new Map<number, string>()
  const games = new Map<number, string>()
  for (const m of frame.matchups) {
    owners.set(m.a.rosterId, m.a.ownerName)
    owners.set(m.b.rosterId, m.b.ownerName)
    games.set(m.matchupId, `${m.a.ownerName} vs ${m.b.ownerName}`)
  }
  return (s) => {
    const names = (s.refs.rosterIds ?? [])
      .map((r) => owners.get(r))
      .filter((n): n is string => Boolean(n))
    if (names.length > 0) return names.join(' · ')
    if (s.refs.matchupId != null) return games.get(s.refs.matchupId) ?? null
    return null
  }
}

function Wire({ frame, onWatch }: { frame: SlLeague; onWatch: (matchupId: number) => void }) {
  const pertains = pertainsLookup(frame)
  // Newest bulletin on top, like a real wire.
  const bulletins = [...frame.storylines].sort(
    (a, b) => Date.parse(b.firstSeenAt) - Date.parse(a.firstSeenAt),
  )
  return (
    <div className="sl-panel flex h-full min-h-0 flex-col overflow-hidden">
      <div className="sl-slate">
        <span className="sl-kicker text-sl-cream!">THE WIRE</span>
      </div>
      <div className="sl-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {bulletins.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-sl-dim">Holding for bulletins.</p>
        ) : (
          bulletins.map((s) => {
            const who = pertains(s)
            const color = CATEGORY_COLOR[s.category]
            const Tag = s.refs.matchupId != null ? 'button' : 'div'
            return (
              <Tag
                key={s.id}
                type={Tag === 'button' ? 'button' : undefined}
                onClick={
                  s.refs.matchupId != null ? () => onWatch(s.refs.matchupId as number) : undefined
                }
                title={s.refs.matchupId != null ? 'Put this game on the monitor' : undefined}
                className={`block w-full rounded-[3px] px-3 py-2 pl-3.5 text-left ${
                  s.refs.matchupId != null ? 'cursor-pointer transition-opacity hover:opacity-85' : ''
                }`}
                style={{
                  boxShadow: `inset 4px 0 0 ${color}`,
                  // The card WEARS its category color (the same hue as its
                  // chip), light enough that the type still leads; the rail's
                  // own surface shows through the gaps on every side.
                  background: `color-mix(in srgb, ${color} 10%, var(--sl-panel))`,
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="sl-num shrink-0 rounded-sm px-1.5 py-0.5 text-[8.5px] font-bold tracking-[0.14em]"
                    style={{
                      color,
                      background: `color-mix(in srgb, ${color} 16%, transparent)`,
                    }}
                  >
                    {s.kind.replace(/-/g, ' ').toUpperCase()}
                  </span>
                  {who && (
                    <span className="sl-num min-w-0 truncate text-right text-[8.5px] text-sl-mute">{who}</span>
                  )}
                </div>
                <p className="sl-display sl-thick mt-1 text-[13px] leading-snug text-sl-text">{s.headline}</p>
                {s.subline && <p className="mt-0.5 text-[11px] leading-snug text-sl-mute">{s.subline}</p>}
              </Tag>
            )
          })
        )}
      </div>
    </div>
  )
}

/* ── Below the room: the leaders, one table, every position ──── */

const LEADER_POSITIONS = [
  { pos: 'QB', label: 'QUARTERBACKS' },
  { pos: 'RB', label: 'RUNNING BACKS' },
  { pos: 'WR', label: 'WIDE RECEIVERS' },
  { pos: 'TE', label: 'TIGHT ENDS' },
]

function leadersByPosition(frame: SlLeague, n: number): Record<string, Array<{ p: SlPlayer; ownerName: string }>> {
  const byPos: Record<string, Array<{ p: SlPlayer; ownerName: string }>> = {}
  for (const m of frame.matchups)
    for (const side of [m.a, m.b])
      for (const p of side.players)
        if (p.isStarter && p.position) (byPos[p.position] ??= []).push({ p, ownerName: side.ownerName })
  for (const pos of Object.keys(byPos))
    byPos[pos] = byPos[pos].sort((x, y) => y.p.points - x.p.points).slice(0, n)
  return byPos
}

function LeadersTable({ frame, href, onOpen }: { frame: SlLeague; href?: string; onOpen?: () => void }) {
  const byPos = leadersByPosition(frame, 5)
  if (LEADER_POSITIONS.every(({ pos }) => (byPos[pos] ?? []).length === 0)) return null
  return (
    <div className="sl-panel overflow-hidden">
      <div className="sl-slate flex items-center justify-between">
        <span className="sl-kicker text-sl-cream!">THE LEADERS</span>
        {onOpen ? (
          <button type="button" onClick={onOpen} className="sl-chip transition-colors hover:text-sl-text">
            FULL BOARD
          </button>
        ) : href ? (
          <a href={href} className="sl-chip transition-colors hover:text-sl-text">
            FULL BOARD
          </a>
        ) : null}
      </div>
      <div className="grid grid-cols-1 divide-y divide-sl-line/50 sm:grid-cols-2 sm:divide-x md:divide-y-0 xl:grid-cols-4">
        {LEADER_POSITIONS.map(({ pos, label }) => (
          <div key={pos} className="px-4 py-3">
            <div className="flex items-baseline justify-between">
              <span className="sl-kicker text-[10px]!">{label}</span>
              <span className="sl-kicker text-[10px]!">PTS</span>
            </div>
            <div className="mt-2">
              {(byPos[pos] ?? []).map((row, i) => (
                <div
                  key={row.p.playerId}
                  className={`flex items-baseline gap-2 rounded-[2px] px-1.5 py-[3px] ${
                    i % 2 === 1 ? 'bg-sl-panel-2/40' : ''
                  }`}
                >
                  <span className="sl-num w-3 shrink-0 text-[11px] text-sl-dim">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="sl-display sl-thick text-[13.5px] text-sl-text">{row.p.name}</span>
                    <span className="sl-num ml-1.5 text-[10px] text-sl-dim">{row.ownerName}</span>
                  </span>
                  <span className="sl-num shrink-0 text-[13px] text-sl-glow">{fmtPts(row.p.points)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── The room ───────────────────────────────────────────────── */

export function CommandCenter({
  frame,
  weekContext,
  featured,
  pinned,
  onWatch,
  onTogglePin,
  onHover,
  playerDelta,
  scoreDelta,
  leadersHref,
  onLeaders,
  gameHref,
}: {
  frame: SlLeague
  weekContext: SlWeekContext | null
  // Which game holds the monitor; the caller owns rotation and pinning.
  featured: number | null
  pinned: boolean
  onWatch: (matchupId: number) => void
  onTogglePin: () => void
  // Production pauses the stage rotation while the monitor is hovered.
  onHover?: (hovering: boolean) => void
  playerDelta?: Map<string, number>
  scoreDelta?: Map<number, number>
  leadersHref?: string
  onLeaders?: () => void
  gameHref?: (matchupId: number) => string
}) {
  const ordered = [...frame.matchups].sort((a, b) => a.matchupId - b.matchupId)
  const shown = frame.matchups.find((m) => m.matchupId === featured) ?? ordered[0]
  if (!shown) return null

  const channelById = new Map<number, number>()
  ordered.forEach((m, i) => channelById.set(m.matchupId, i + 1))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[276px_minmax(0,1fr)_276px]">
        <div className="relative order-2 xl:order-1">
          <div className="xl:absolute xl:inset-0">
            <Wire frame={frame} onWatch={onWatch} />
          </div>
        </div>
        <div
          className="order-1 xl:order-2"
          onMouseEnter={onHover ? () => onHover(true) : undefined}
          onMouseLeave={onHover ? () => onHover(false) : undefined}
        >
          {/* Key on the matchup: rotation replays the entrance */}
          <div key={shown.matchupId} className="sl-stage-enter flex flex-col gap-3">
            <MainMonitor
              m={shown}
              frame={frame}
              weekContext={weekContext}
              pinned={pinned}
              onTogglePin={onTogglePin}
              gameHref={gameHref}
              scoreDelta={scoreDelta}
            />
            {/* Full box scores, never clipped: every starter stays on screen. */}
            <div className="grid grid-cols-1 content-start gap-3 lg:grid-cols-2">
              <StarterTable side={shown.a} playerDelta={playerDelta} />
              <StarterTable side={shown.b} playerDelta={playerDelta} />
            </div>
          </div>
        </div>
        <div className="relative order-3">
          <div className="flex flex-col xl:absolute xl:inset-0">
            <span className="sl-kicker mb-1 block shrink-0">THE WALL</span>
            {/* Padding inside the scroll clip so hover lift and the gold
                active outline are never cut off at the edges. */}
            <div className="sl-scroll sl-wall-grid min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
              {frame.matchups.map((m) => (
                <WallSet
                  key={m.matchupId}
                  m={m}
                  wc={weekContext?.matchups[m.matchupId] ?? null}
                  channel={channelById.get(m.matchupId) ?? 0}
                  active={m.matchupId === shown.matchupId}
                  onWatch={() => onWatch(m.matchupId)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      {(onLeaders || leadersHref) && <LeadersTable frame={frame} href={leadersHref} onOpen={onLeaders} />}
    </div>
  )
}
