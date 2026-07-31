'use client'

// Roster Roulette — the table.
//
// The whole game is dealt in one call to /api/games/roulette and played
// entirely in the browser from there: nine manager-seasons, revealed one at
// a time. Take a player off the squad in front of you, set him in a slot he
// fits, and live with it. Two rerolls if the wheel is unkind.
//
// Scored on points per game, not season totals — a lineup is a week, and a
// week is what you play the seventeen games with. Season totals ride along
// on every card because they're the number people remember, but they never
// decide anything.
//
// The deal is seeded, so a run is a link. Anyone opening ?seed=XXXX plays
// the identical nine squads in the identical order and can be beaten
// honestly.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DealtGame } from '@/lib/minigames/deal'
import type { SquadPlayer, PoolPosition, Squad } from '@/lib/minigames/pool'
import type { SlotDef, SlotId } from '@/lib/minigames/roulette'
import { parForDeal } from '@/lib/minigames/roulette'
import { recordFor, recordHeadline, GAMES } from '@/lib/minigames/record'
import styles from '../games.module.css'

type Deal = DealtGame
type PoolChoice = { id: string; label: string }

type Filled = {
  player: SquadPlayer
  squad: Squad
  /** Best PPG this squad could have given the slots that were open. */
  bestAvailable: number
}

const POS_LIST: PoolPosition[] = ['QB', 'RB', 'WR', 'TE']

/** Full cards per position before the rest of the group collapses. */
const FULL_CARDS_PER_POS = 4

function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')
}

function squadLabel(s: Squad): string {
  return s.teamName?.trim() || s.managerName
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Sleeper serves headshots for retired players too, so 2012 gets faces. */
function headshot(playerId: string | null): string | null {
  return playerId ? `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg` : null
}

export function RosterRoulette({
  initialDeal,
  initialError,
  pools,
}: {
  /** Opening wheel, dealt during SSR so the board is up on first paint. */
  initialDeal: Deal | null
  initialError: string | null
  pools: PoolChoice[]
}) {
  const [poolId, setPoolId] = useState(initialDeal?.pool.id ?? 'site')
  const [deal, setDeal] = useState<Deal | null>(initialDeal)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)

  const [spinIndex, setSpinIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [rerollsLeft, setRerollsLeft] = useState(initialDeal?.rerolls ?? 0)
  const [lineup, setLineup] = useState<Partial<Record<SlotId, Filled>>>({})
  const [teaser, setTeaser] = useState<Squad | null>(null)
  const [copied, setCopied] = useState(false)
  // The player under the cursor, so the sheet can show where he'd land.
  const [hoverPlayer, setHoverPlayer] = useState<SquadPlayer | null>(null)
  // Next wheel, fetched while this one is being played so "New wheel" is
  // instant instead of a second of staring at a spinner.
  const [nextDeal, setNextDeal] = useState<Deal | null>(null)

  const spinTimer = useRef<number | null>(null)
  const flickerTimer = useRef<number | null>(null)
  const rosterRef = useRef<HTMLDivElement | null>(null)

  // ── Loading a deal ──────────────────────────────────────────

  const load = useCallback(async (pool: string, seed: string | null) => {
    setLoading(true)
    setError(null)
    setDeal(null)
    try {
      const qs = new URLSearchParams({ pool })
      if (seed) qs.set('seed', seed)
      const res = await fetch(`/api/games/roulette/?${qs}`, { cache: 'no-store' })
      const body = await res.json()
      if (!res.ok || !body?.ok) {
        setError(body?.error ?? 'Could not deal a game. Try again in a moment.')
        return
      }
      setDeal(body as Deal)
      setSpinIndex(0)
      setRevealed(false)
      setSpinning(false)
      setRerollsLeft(body.rerolls)
      setLineup({})
      setTeaser(null)
      setCopied(false)
      setHoverPlayer(null)
    } catch {
      setError('Could not reach the wheel. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(
    () => () => {
      if (spinTimer.current) window.clearTimeout(spinTimer.current)
      if (flickerTimer.current) window.clearInterval(flickerTimer.current)
    },
    []
  )

  // Fetch the follow-up wheel in the background while this one is being
  // played, so pressing "New wheel" swaps it in with no wait. Deliberately
  // held until the first pick: someone who opens the page and leaves
  // shouldn't cost a second deal.
  const picksMade = Object.keys(lineup).length
  useEffect(() => {
    if (picksMade !== 1 || nextDeal) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/games/roulette/?pool=${encodeURIComponent(poolId)}`, {
          cache: 'no-store',
        })
        const body = await res.json()
        if (!cancelled && res.ok && body?.ok) setNextDeal(body as Deal)
      } catch {
        /* the button falls back to fetching on demand */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [picksMade, nextDeal, poolId])

  // Swap in the prefetched wheel, or fetch one if it isn't ready yet.
  const newWheel = useCallback(() => {
    if (nextDeal && nextDeal.pool.id === poolId) {
      setDeal(nextDeal)
      setNextDeal(null)
      setSpinIndex(0)
      setRevealed(false)
      setSpinning(false)
      setRerollsLeft(nextDeal.rerolls)
      setLineup({})
      setTeaser(null)
      setCopied(false)
      setHoverPlayer(null)
      return
    }
    void load(poolId, null)
  }, [nextDeal, poolId, load])

  // Keep the address bar on the seed being played, so a refresh (or a copied
  // URL) replays this exact wheel rather than dealing a stranger's.
  useEffect(() => {
    if (!deal) return
    const url = new URL(window.location.href)
    url.searchParams.set('pool', deal.pool.id)
    url.searchParams.set('seed', deal.seed)
    // Someone arriving from a shared result carries the sharer's score in
    // the URL. It has already done its job (the link preview), and leaving
    // it would attach their record to this player's run.
    url.searchParams.delete('w')
    url.searchParams.delete('ppg')
    window.history.replaceState(null, '', url)
  }, [deal])

  // ── Derived state ───────────────────────────────────────────

  const slots = useMemo<SlotDef[]>(() => deal?.slots ?? [], [deal])
  const openSlots = useMemo(
    () => slots.filter((s) => !lineup[s.id]).map((s) => s.id),
    [slots, lineup]
  )
  const done = deal != null && openSlots.length === 0
  const current = deal && spinIndex < deal.spins.length ? deal.spins[spinIndex] : null

  const ppg = useMemo(
    () => Object.values(lineup).reduce((sum, f) => sum + (f?.player.ppg ?? 0), 0),
    [lineup]
  )
  const totalPts = useMemo(
    () => Object.values(lineup).reduce((sum, f) => sum + (f?.player.fpts ?? 0), 0),
    [lineup]
  )

  // Ceiling for these exact nine squads, in PPG. Held back until the run is
  // over — showing it mid-game would just be the answer key.
  const par = useMemo(() => (deal ? parForDeal(deal.spins, deal.slots) : 0), [deal])
  const wins = useMemo(
    () => (deal ? recordFor(ppg, deal.benchmark) : 0),
    [ppg, deal]
  )

  const eligiblePositions = useMemo(() => {
    const set = new Set<PoolPosition>()
    for (const id of openSlots) {
      const def = slots.find((s) => s.id === id)
      def?.accepts.forEach((p) => set.add(p))
    }
    return set
  }, [openSlots, slots])

  // Roster, grouped by position. Groups you can still use come first in
  // QB-RB-WR-TE order; groups with no open slot sink to the bottom keeping
  // that same order, so nothing moves around unpredictably as slots fill.
  //
  // Inside a group the top few get full cards and the rest collapse to one
  // line each. Some managers churn thirty running backs through a season and
  // a board of thirty full cards is unreadable — but they all stay on it,
  // because seeing everyone you once rostered is half the appeal.
  const groups = useMemo(() => {
    if (!current) return []
    const byPos = new Map<PoolPosition, SquadPlayer[]>()
    for (const p of current.players) {
      const bucket = byPos.get(p.pos)
      if (bucket) bucket.push(p)
      else byPos.set(p.pos, [p])
    }
    return POS_LIST.filter((pos) => byPos.has(pos))
      .map((pos) => {
        const players = (byPos.get(pos) ?? []).slice().sort((a, b) => b.ppg - a.ppg)
        const usable = eligiblePositions.has(pos)
        return {
          pos,
          usable,
          // A locked group is reference material, so it goes fully compact.
          fullCount: usable ? FULL_CARDS_PER_POS : 0,
          players,
        }
      })
      .sort((a, b) => Number(a.usable ? 0 : 1) - Number(b.usable ? 0 : 1))
  }, [current, eligiblePositions])

  const firstLockedPos = useMemo(
    () => groups.find((g) => !g.usable)?.pos ?? null,
    [groups]
  )

  // Which slot a given player would land in — the single source of truth for
  // both taking him and previewing where he'd go on hover.
  const slotFor = useCallback(
    (pos: PoolPosition): SlotId | null => {
      const target =
        slots.find((s) => !lineup[s.id] && s.accepts.length === 1 && s.accepts.includes(pos)) ??
        slots.find((s) => !lineup[s.id] && s.accepts.includes(pos))
      return target?.id ?? null
    },
    [slots, lineup]
  )

  const hoverSlot = hoverPlayer ? slotFor(hoverPlayer.pos) : null

  // ── The spin ────────────────────────────────────────────────

  const spin = useCallback(() => {
    if (!deal || spinning || revealed || done) return
    setSpinning(true)
    setCopied(false)

    // The wheel is theatre, not chance — the squad was decided by the seed
    // before the page loaded. The flicker cycles other squads so it reads as
    // a wheel slowing down rather than a spinner.
    const others = deal.spins.filter((_, i) => i !== spinIndex)
    let tick = 0
    flickerTimer.current = window.setInterval(() => {
      setTeaser(others[tick % others.length] ?? null)
      tick++
    }, 90)

    spinTimer.current = window.setTimeout(() => {
      if (flickerTimer.current) window.clearInterval(flickerTimer.current)
      flickerTimer.current = null
      setTeaser(null)
      setSpinning(false)
      setRevealed(true)
    }, 1100)
  }, [deal, spinning, revealed, done, spinIndex])

  const advance = useCallback(() => {
    setRevealed(false)
    setSpinIndex((i) => i + 1)
    // Next squad starts at the top of its roster, not wherever the last
    // scroll left off.
    if (rosterRef.current) rosterRef.current.scrollTop = 0
  }, [])

  const take = useCallback(
    (player: SquadPlayer) => {
      if (!current || !revealed) return
      // Dedicated slot before FLEX, always. Putting a running back in RB2
      // rather than FLEX can never cost points and always leaves the more
      // permissive slot open, so there's no decision worth handing over.
      const targetId = slotFor(player.pos)
      if (!targetId) return

      const legal = current.players.filter((p) =>
        slots.some((s) => !lineup[s.id] && s.accepts.includes(p.pos))
      )
      const bestAvailable = legal.length ? Math.max(...legal.map((p) => p.ppg)) : 0

      setHoverPlayer(null)
      setLineup((prev) => ({ ...prev, [targetId]: { player, squad: current, bestAvailable } }))
      advance()
    },
    [current, revealed, slots, lineup, advance, slotFor]
  )

  const reroll = useCallback(() => {
    if (rerollsLeft <= 0 || !revealed) return
    setRerollsLeft((r) => r - 1)
    advance()
  }, [rerollsLeft, revealed, advance])

  // The share link carries the finished run, so the preview a friend sees is
  // a scoreboard with the record on it rather than a generic card — and the
  // seed means they play the identical nine squads, in the identical order.
  const shareUrl = useCallback(() => {
    if (!deal) return ''
    const url = new URL(window.location.href)
    url.search = ''
    url.searchParams.set('pool', deal.pool.id)
    url.searchParams.set('seed', deal.seed)
    if (deal.benchmark) url.searchParams.set('w', String(wins))
    url.searchParams.set('ppg', String(round1(ppg)))
    return url.toString()
  }, [deal, wins, ppg])

  const shareRun = useCallback(async () => {
    if (!deal) return
    const url = shareUrl()
    const rec = deal.benchmark ? `${wins}-${GAMES - wins}` : `${round1(ppg)} PPG`
    const text =
      `${rec} on Roster Roulette — ${round1(ppg)} PPG${deal.benchmark ? `, 17-0 needs ${deal.benchmark.target}` : ''}. ` +
      `Same nine squads: ${url}`
    // Native share sheet on phones (where most of this gets sent), clipboard
    // everywhere else.
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Roster Roulette', text, url })
        return
      }
    } catch {
      // Cancelled or unavailable — fall through to the clipboard.
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      /* clipboard blocked — the seed is on screen either way */
    }
  }, [deal, ppg, wins, shareUrl])

  // ── Render ──────────────────────────────────────────────────

  if (loading) return <div className={styles.err}>Dealing…</div>

  if (error || !deal) {
    return (
      <div className={styles.err}>
        <p>{error ?? 'Something went wrong.'}</p>
        <p style={{ marginTop: '1rem' }}>
          <a href="/games/">Back to the Games Page</a>
        </p>
      </div>
    )
  }

  const shown = spinning ? teaser : null
  const spinsLeft = deal.spins.length - spinIndex

  return (
    <>
      {pools.length > 1 && (
        <div className={styles.pools}>
          {pools.map((p) => (
            <button
              key={p.id}
              type="button"
              className={p.id === poolId ? styles.poolChipOn : styles.poolChip}
              onClick={() => {
                if (p.id === poolId) return
                setPoolId(p.id)
                setNextDeal(null)
                void load(p.id, null)
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Phones get the lineup as a sticky strip; the full sheet is hidden
          at this width because it would push the board off screen. */}
      <div className={styles.strip}>
        {slots.map((s) => {
          const f = lineup[s.id]
          const cls = f
            ? styles.stripCellFilled
            : hoverSlot === s.id
              ? styles.stripCellHover
              : styles.stripCell
          return (
            <div
              key={s.id}
              className={cls}
              style={f ? ({ ['--pos' as string]: `var(--pos-${f.player.pos})` }) : undefined}
            >
              <span className={styles.stripId}>{s.label}</span>
              {f ? (
                <span className={styles.stripVal}>{round1(f.player.ppg)}</span>
              ) : (
                <span className={styles.stripEmpty}>—</span>
              )}
            </div>
          )
        })}
      </div>

      <div className={styles.board}>
        <div className={styles.stage}>
          {done ? (
            <div className={styles.recap}>
              <div className={styles.recordLabel}>Final record</div>
              <div className={wins === GAMES ? styles.recordPerfect : styles.recordBig}>
                {deal.benchmark ? `${wins}-${GAMES - wins}` : round1(ppg)}
              </div>
              <div className={styles.grade}>
                {deal.benchmark ? recordHeadline(wins) : 'Points per game'}
              </div>
              <div className={styles.recapNums}>
                <div className={styles.recapNum}>
                  <span className={styles.recapNumVal}>{round1(ppg)}</span>
                  <span className={styles.recapNumLbl}>PPG</span>
                </div>
                <div className={styles.recapNum}>
                  <span className={styles.recapNumVal}>{Math.round(totalPts)}</span>
                  <span className={styles.recapNumLbl}>Season pts</span>
                </div>
                <div className={styles.recapNum}>
                  <span className={styles.recapNumVal}>
                    {par > 0 ? `${Math.round((ppg / par) * 100)}%` : '—'}
                  </span>
                  <span className={styles.recapNumLbl}>Of this wheel</span>
                </div>
              </div>
              <Runback lineup={lineup} slots={slots} par={par} />
              <div className={styles.btnRow}>
                <button type="button" className={styles.btn} onClick={newWheel}>
                  New wheel
                </button>
                <button type="button" className={styles.btnGhost} onClick={() => void shareRun()}>
                  {copied ? 'Copied' : 'Copy challenge'}
                </button>
              </div>
              <div className={styles.seedLine}>
                Seed <b>{deal.seed}</b>
              </div>
            </div>
          ) : !revealed ? (
            <div className={`${styles.wheel} ${spinning ? styles.spinning : ''}`}>
              <div className={styles.wheelWindow}>
                <div className={styles.wheelYear}>{shown ? shown.year : '· · · ·'}</div>
                <div className={styles.wheelName}>
                  {shown ? squadLabel(shown) : spinIndex === 0 ? 'Spin the wheel' : 'Spin again'}
                </div>
                <div className={styles.wheelSub}>
                  {spinning
                    ? 'Spinning'
                    : `${deal.pool.squadCount.toLocaleString()} squads in the drum`}
                </div>
              </div>
              <button type="button" className={styles.btn} onClick={spin} disabled={spinning || !current}>
                {spinning ? 'Spinning' : 'Spin'}
              </button>
              <div className={styles.seedLine}>
                {openSlots.length} slot{openSlots.length === 1 ? '' : 's'} open · {rerollsLeft} reroll
                {rerollsLeft === 1 ? '' : 's'} left
              </div>
            </div>
          ) : current ? (
            <>
              <div className={styles.plate}>
                <div className={styles.plateYear}>{current.year}</div>
                <div className={styles.plateBody}>
                  <div className={styles.plateTeam}>{squadLabel(current)}</div>
                  <div className={styles.plateCred}>
                    <span className={styles.monogram}>{initials(current.managerName)}</span>
                    <span className={styles.plateOwner}>
                      <span className={styles.plateOwnerTag}>Owner</span>
                      {current.managerName}
                    </span>
                  </div>
                </div>
                <div className={styles.plateStats}>
                  <span className={styles.plateRec}>
                    {current.wins}-{current.losses}
                    {current.ties ? `-${current.ties}` : ''}
                  </span>
                  <span className={styles.plateFinish}>
                    {current.isChampion ? (
                      <span className={styles.plateRing}>★ Champion</span>
                    ) : current.finalRank ? (
                      `${ordinal(current.finalRank)} place`
                    ) : (
                      ''
                    )}
                  </span>
                  <a
                    className={styles.plateLeague}
                    href={`/leagues/${current.leagueSlug}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {current.leagueName}
                  </a>
                </div>
              </div>

              <div className={styles.rosterBar}>
                <span>Take one · {current.players.length} rostered</span>
                <span>Spin {spinIndex + 1} of {deal.spins.length}</span>
              </div>

              <div className={styles.roster} ref={rosterRef}>
                {groups.map((g) => (
                  <div key={g.pos} className={styles.posGroup}>
                    {g.pos === firstLockedPos && (
                      <div className={styles.lockDivider}>No slot open</div>
                    )}
                    <div
                      className={g.usable ? styles.posHead : styles.posHeadLocked}
                      style={g.usable ? ({ ['--posc' as string]: `var(--pos-${g.pos})` }) : undefined}
                    >
                      {g.pos}
                      <span className={styles.posHeadCount}>{g.players.length}</span>
                    </div>
                    {g.players.map((p, i) =>
                      i < g.fullCount ? (
                        <PlayerCard
                          key={`${p.name}-${i}`}
                          player={p}
                          disabled={!g.usable}
                          onTake={() => take(p)}
                          onHover={setHoverPlayer}
                        />
                      ) : (
                        <CompactPlayer
                          key={`${p.name}-${i}`}
                          player={p}
                          disabled={!g.usable}
                          onTake={() => take(p)}
                          onHover={setHoverPlayer}
                        />
                      )
                    )}
                  </div>
                ))}
              </div>

              <div className={styles.stageFoot}>
                <span className={styles.footNote}>
                  {openSlots.length} slot{openSlots.length === 1 ? '' : 's'} left
                </span>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={reroll}
                  disabled={rerollsLeft <= 0 || spinsLeft <= openSlots.length}
                >
                  Reroll ({rerollsLeft})
                </button>
              </div>
            </>
          ) : (
            <div className={styles.err}>The wheel ran out of squads. Deal a new one.</div>
          )}
        </div>

        <div className={styles.sheet}>
          <div className={styles.sheetHead}>
            <span className={styles.sheetTitle}>
              {deal.benchmark && Object.keys(lineup).length > 0 ? `${wins}-${GAMES - wins}` : 'Your lineup'}
            </span>
            <span className={styles.sheetTotals}>
              <span className={styles.sheetPpg}>
                {round1(ppg)}
                <span className={styles.sheetPpgUnit}>PPG</span>
              </span>
              <span className={styles.sheetSub}>{Math.round(totalPts)} season pts</span>
            </span>
          </div>
          <div className={styles.slots}>
            {slots.map((s) => {
              const filled = lineup[s.id]
              const isHover = !filled && hoverSlot === s.id
              return (
                <div
                  key={s.id}
                  className={`${styles.slot} ${!filled ? styles.slotOpen : ''} ${isHover ? styles.slotHover : ''}`}
                >
                  <span className={styles.slotId}>{s.label}</span>
                  {filled ? (
                    <>
                      <span className={styles.slotName}>
                        {filled.player.name}
                        <span className={styles.slotFrom}>
                          {filled.squad.year} {squadLabel(filled.squad)}
                        </span>
                      </span>
                      <span className={styles.slotPts}>{round1(filled.player.ppg)}</span>
                    </>
                  ) : isHover && hoverPlayer ? (
                    <>
                      <span className={styles.slotName} style={{ color: 'var(--gp-gold)' }}>
                        {hoverPlayer.name}
                        <span className={styles.slotFrom}>Would go here</span>
                      </span>
                      <span className={styles.slotGhost}>{round1(hoverPlayer.ppg)}</span>
                    </>
                  ) : (
                    <>
                      <span className={styles.slotName} style={{ color: 'var(--gp-mute)' }}>
                        Open
                      </span>
                      <span className={styles.slotDash}>—</span>
                    </>
                  )}
                </div>
              )
            })}
          </div>
          {deal.benchmark && (
            <div className={styles.targetRow}>
              <span>17-0 needs</span>
              <span className={styles.targetVal}>{deal.benchmark.target} PPG</span>
            </div>
          )}
          <div className={styles.sheetFoot}>
            <div className={styles.tally}>
              <span>Pool</span>
              <span className={styles.tallyVal}>{deal.pool.label}</span>
            </div>
            <div className={styles.tally}>
              <span>Scoring</span>
              <span className={styles.tallyVal}>{profileLabel(deal.pool.profile)}</span>
            </div>
            <div className={styles.tally}>
              <span>Rerolls</span>
              <span className={styles.tallyVal}>{rerollsLeft} left</span>
            </div>
            <div className={styles.tally}>
              <span>Seed</span>
              <span className={styles.tallyVal}>{deal.seed}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// One man on the board. Headshot, position stripe, the season he had.
function PlayerCard({
  player,
  disabled,
  onTake,
  onHover,
}: {
  player: SquadPlayer
  disabled: boolean
  onTake: () => void
  onHover: (p: SquadPlayer | null) => void
}) {
  const [imgOk, setImgOk] = useState(true)
  const src = headshot(player.playerId)
  // Focus mirrors hover so the slot preview works from the keyboard too.
  const hoverProps = disabled
    ? {}
    : {
        onMouseEnter: () => onHover(player),
        onMouseLeave: () => onHover(null),
        onFocus: () => onHover(player),
        onBlur: () => onHover(null),
      }
  return (
    <button
      type="button"
      className={styles.pick}
      style={{ ['--pos' as string]: `var(--pos-${player.pos})` }}
      disabled={disabled}
      onClick={onTake}
      {...hoverProps}
    >
      <span className={styles.shot}>
        {src && imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={styles.shotImg}
            src={src}
            alt=""
            loading="lazy"
            onError={() => setImgOk(false)}
          />
        ) : (
          <span className={styles.shotFallback}>{initials(player.name)}</span>
        )}
      </span>
      <span className={styles.pickMain}>
        <span className={styles.pickName}>{player.name}</span>
        <span className={styles.pickMeta}>
          <span className={styles.posTag}>
            {player.pos}
            {player.posRank}
          </span>
          {player.nflTeam && <span className={styles.teamTag}>{player.nflTeam}</span>}
          <span className={styles.metaDim}>
            {player.gp} G
            {player.source === 'draft' && player.draftRound ? ` · Rd ${player.draftRound}` : ''}
            {player.source === 'pickup' ? ' · Added in-season' : ''}
          </span>
        </span>
      </span>
      <span className={styles.pickNums}>
        <span className={styles.pickPpg}>
          {round1(player.ppg)}
          <span className={styles.pickPpgUnit}>PPG</span>
        </span>
        <span className={styles.pickTotal}>{Math.round(player.fpts)} pts</span>
      </span>
    </button>
  )
}

// The deep bench. One line, no headshot — still takeable, just not
// competing for attention with the players anyone would actually start.
function CompactPlayer({
  player,
  disabled,
  onTake,
  onHover,
}: {
  player: SquadPlayer
  disabled: boolean
  onTake: () => void
  onHover: (p: SquadPlayer | null) => void
}) {
  const hoverProps = disabled
    ? {}
    : {
        onMouseEnter: () => onHover(player),
        onMouseLeave: () => onHover(null),
        onFocus: () => onHover(player),
        onBlur: () => onHover(null),
      }
  return (
    <button
      type="button"
      className={styles.compact}
      style={{ ['--pos' as string]: `var(--pos-${player.pos})` }}
      disabled={disabled}
      onClick={onTake}
      {...hoverProps}
    >
      <span className={styles.compactPos}>
        {player.pos}
        {player.posRank}
      </span>
      <span className={styles.compactName}>
        {player.name}
        {player.nflTeam && <span className={styles.compactTeam}>{player.nflTeam}</span>}
      </span>
      <span className={styles.compactPpg}>{round1(player.ppg)}</span>
    </button>
  )
}

// What the run cost: how much of the wheel's ceiling you captured, and the
// PPG you walked past on squads you did take from.
function Runback({
  lineup,
  slots,
  par,
}: {
  lineup: Partial<Record<SlotId, Filled>>
  slots: SlotDef[]
  par: number
}) {
  const filled = slots.map((s) => lineup[s.id]).filter((f): f is Filled => f != null)
  const left = filled.reduce((sum, f) => sum + (f.bestAvailable - f.player.ppg), 0)
  if (par <= 0) return null
  if (left < 0.1) {
    return (
      <p className={styles.missed}>
        You took the best man available on every single spin. The best this wheel
        could ever have paid was <b>{round1(par)}</b> PPG.
      </p>
    )
  }
  return (
    <p className={styles.missed}>
      The best possible lineup out of those nine squads was worth <b>{round1(par)}</b> PPG.
      You walked past <b>{round1(left)}</b> PPG that was sitting on squads you took from.
    </p>
  )
}

function profileLabel(profile: string): string {
  const ppr = profile.startsWith('ppr') ? 'PPR' : profile.startsWith('half') ? 'Half PPR' : 'Standard'
  const pass = profile.endsWith('6pt') ? '6 pt pass TD' : '4 pt pass TD'
  return `${ppr} · ${pass}`
}
