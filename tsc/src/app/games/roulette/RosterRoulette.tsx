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

const POS_ORDER: Record<PoolPosition, number> = { QB: 0, RB: 1, WR: 2, TE: 3 }

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

  // Keep the address bar on the seed being played, so a refresh (or a copied
  // URL) replays this exact wheel rather than dealing a stranger's.
  useEffect(() => {
    if (!deal) return
    const url = new URL(window.location.href)
    url.searchParams.set('pool', deal.pool.id)
    url.searchParams.set('seed', deal.seed)
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

  // Roster order: everyone you can still use first, in position order and
  // best-first inside each; then everyone you can't, in the same order. So a
  // locked position sinks to the bottom without scrambling the reading order.
  const orderedPlayers = useMemo(() => {
    if (!current) return []
    const rank = (p: SquadPlayer) =>
      (eligiblePositions.has(p.pos) ? 0 : 1000) + POS_ORDER[p.pos]
    return current.players
      .slice()
      .sort((a, b) => rank(a) - rank(b) || b.ppg - a.ppg)
  }, [current, eligiblePositions])

  const firstLockedIdx = useMemo(
    () => orderedPlayers.findIndex((p) => !eligiblePositions.has(p.pos)),
    [orderedPlayers, eligiblePositions]
  )

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
      const target =
        slots.find((s) => !lineup[s.id] && s.accepts.length === 1 && s.accepts.includes(player.pos)) ??
        slots.find((s) => !lineup[s.id] && s.accepts.includes(player.pos))
      if (!target) return

      const legal = current.players.filter((p) =>
        slots.some((s) => !lineup[s.id] && s.accepts.includes(p.pos))
      )
      const bestAvailable = legal.length ? Math.max(...legal.map((p) => p.ppg)) : 0

      setLineup((prev) => ({ ...prev, [target.id]: { player, squad: current, bestAvailable } }))
      advance()
    },
    [current, revealed, slots, lineup, advance]
  )

  const reroll = useCallback(() => {
    if (rerollsLeft <= 0 || !revealed) return
    setRerollsLeft((r) => r - 1)
    advance()
  }, [rerollsLeft, revealed, advance])

  const shareRun = useCallback(async () => {
    if (!deal) return
    const url = new URL(window.location.href)
    url.searchParams.set('pool', deal.pool.id)
    url.searchParams.set('seed', deal.seed)
    const rec = deal.benchmark ? `${wins}-${GAMES - wins}` : `${round1(ppg)} PPG`
    const text =
      `${rec} on Roster Roulette — ${round1(ppg)} PPG (${deal.pool.label}, seed ${deal.seed}). ` +
      `Same nine squads, beat it: ${url}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      /* clipboard blocked — the seed is on screen either way */
    }
  }, [deal, ppg, wins])

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
  const nextOpen = openSlots[0]

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
            : s.id === nextOpen && revealed
              ? styles.stripCellNext
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
                <button type="button" className={styles.btn} onClick={() => void load(poolId, null)}>
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
                <span>Take one · {orderedPlayers.length} on the roster</span>
                <span>Spin {spinIndex + 1} of {deal.spins.length}</span>
              </div>

              <div className={styles.roster} ref={rosterRef}>
                {orderedPlayers.map((p, i) => {
                  const usable = eligiblePositions.has(p.pos)
                  return (
                    <div key={`${p.name}-${p.pos}-${i}`}>
                      {i === firstLockedIdx && firstLockedIdx > 0 && (
                        <div className={styles.lockDivider}>No slot open</div>
                      )}
                      <PlayerCard player={p} disabled={!usable} onTake={() => take(p)} />
                    </div>
                  )
                })}
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
              const isNext = !filled && revealed && current != null && nextOpen === s.id
              return (
                <div
                  key={s.id}
                  className={`${styles.slot} ${!filled ? styles.slotOpen : ''} ${isNext ? styles.slotNext : ''}`}
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
}: {
  player: SquadPlayer
  disabled: boolean
  onTake: () => void
}) {
  const [imgOk, setImgOk] = useState(true)
  const src = headshot(player.playerId)
  return (
    <button
      type="button"
      className={styles.pick}
      style={{ ['--pos' as string]: `var(--pos-${player.pos})` }}
      disabled={disabled}
      onClick={onTake}
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
