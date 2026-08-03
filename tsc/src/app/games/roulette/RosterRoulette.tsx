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
import { recordFor, recordHeadline, GAMES } from '@/lib/minigames/record'
import { OwnLeagueCta } from '../OwnLeagueCta'
import { bankRun, claimBank, postRun } from '../runBank'
import { ClaimPrompt } from '../ClaimPrompt'
import styles from '../games.module.css'

type Deal = DealtGame

/**
 * Where a finished run stands with the leaderboard.
 *
 * `banked` is not a failure: the run is verified and waiting in localStorage
 * for an account to hang it on. `refused` is, and always carries a reason in
 * words the recap can print unedited.
 */
type PostState =
  | { state: 'idle' }
  | { state: 'sending' }
  | { state: 'posted'; rank: number | null; total: number }
  | { state: 'banked' }
  | { state: 'refused'; why: string }

type Filled = {
  player: SquadPlayer
  squad: Squad
  /** Best PPG this squad could have given the slots that were open. */
  bestAvailable: number
  /** Which spin he came off, and where he sat on that squad's roster.
      Both are what the leaderboard posts: the server re-deals the seed and
      replays these, so it derives the score rather than being told it. An
      INDEX rather than a name or an id because `playerId` is null for
      anyone Sleeper has no record of, and names repeat. */
  spin: number
  playerIdx: number
}

const POS_LIST: PoolPosition[] = ['QB', 'RB', 'WR', 'TE']

/** Full cards per position before the rest of the group collapses. */
const FULL_CARDS_PER_POS = 6

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

/**
 * Takes the seed back out of the address bar.
 *
 * The seed used to be written to the URL on every deal, which quietly made
 * a mess of two things: refreshing re-dealt the wheel you had just finished
 * instead of giving you a new one, and the back arrow walked you through
 * every wheel you had played rather than leaving the game. The seed is only
 * a URL concern when a run is being SHARED — the share link builds its own —
 * so the address bar is left holding nothing but the pool.
 */
function clearSeedFromUrl() {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('seed')) return
    for (const key of ['seed', 'w', 'ppg', 'l']) url.searchParams.delete(key)
    window.history.replaceState(null, '', url)
  } catch {
    /* no history access — harmless */
  }
}

export function RosterRoulette({
  initialDeal,
  initialError,
  signedIn,
  initialShared = false,
}: {
  /** Opening wheel, dealt during SSR so the board is up on first paint. */
  initialDeal: Deal | null
  initialError: string | null
  /** Read on the server, so the recap's CTA can skip the signup step for
      someone who already has an account. */
  signedIn: boolean
  /** Whether the opening wheel came from a `?seed=` link. Those replay a
      deal somebody else has already played, so they never post to a board.
      Only the OPENING wheel can be one: every wheel dealt after it is
      fresh, which is why this clears on the first new wheel. */
  initialShared?: boolean
}) {
  // Fixed for the life of the page: changing league means going back to the
  // Games Page, so every wheel dealt here stays in the same pool.
  const poolId = initialDeal?.pool.id ?? 'site'
  // The borrowed pools. A run on either means the player has just watched the
  // game work on strangers, which is the whole argument for connecting their
  // own league; a run on their OWN league has no such pitch to make.
  const borrowedPool = poolId === 'site' || poolId === 'demo'
  const [deal, setDeal] = useState<Deal | null>(initialDeal)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)
  // Cleared by the first new wheel: only the deal the link arrived with is
  // a replay, and everything after it is dealt fresh and posts normally.
  const [shared, setShared] = useState(initialShared)
  // Where the finished run stands with the leaderboard. Declared up here
  // with the rest of the state because `load` and `newWheel` both reset it.
  const [post, setPost] = useState<PostState>({ state: 'idle' })

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
  // Roster filter. Null shows every position; otherwise just the one.
  // Deep-churn rosters run past thirty players and scrolling for the one
  // receiver you want is the slowest part of a spin.
  const [posFilter, setPosFilter] = useState<PoolPosition | null>(null)
  // Mobile lineup bar: collapsed to a single line by default so it takes
  // the least room while picking, expanded on demand.
  const [hudOpen, setHudOpen] = useState(false)
  // Whether the page masthead and site nav are slimmed. Driven by the game
  // rather than by scrolling: the board is sized to fit one screen, so
  // there is barely any page to scroll and a scroll-driven header would
  // never actually collapse. See MANUAL_PATHS in MobileHeaderCollapse.
  const [hdrSlim, setHdrSlim] = useState(false)

  // True only while the collapse is running its own scroll, so the scroll
  // listener can tell our writes from the user's.
  const settling = useRef(false)

  // Mirrors hdrSlim onto <body>, which is where the CSS looks, and puts the
  // page where the collapse was meant to leave it.
  //
  // Pressing Spin folds the masthead to make room for the board, so the
  // board is what should be on screen afterwards: the slimmed league title
  // parked directly under the sticky nav, the whole draft area below it.
  // That is a deliberate destination, not a nudge — an earlier version tried
  // to hold the board wherever it happened to be sitting, which meant a spin
  // from halfway down the page left you halfway down a page that had just
  // got shorter.
  //
  // The target is recomputed every frame because the nav is still shrinking
  // underneath it; the scroll eases into it over the same beat as the fold,
  // so the two read as one movement instead of a fold followed by a jump.
  //
  // Only the fold moves the page, never the unfold. The header comes back
  // because the user scrolled up, and scrolling them somewhere else mid
  // gesture is exactly the thing being fixed here.
  useEffect(() => {
    const cls = 'tsc-hdr-collapsed'
    if (hdrSlim) document.body.classList.add(cls)
    else document.body.classList.remove(cls)

    const head = document.querySelector<HTMLElement>('[data-rr-head]')
    // Nothing collapses above this width, so nothing should move either.
    const narrow = window.matchMedia('(max-width: 940px)').matches
    if (!hdrSlim || !head || !narrow) return () => document.body.classList.remove(cls)

    // Either masthead: the desktop `.nav` grid, or the mobile app bar that
    // replaces it below 940px. Both are sticky, so whichever is on the page
    // is the thing the parked title has to clear — querying only for
    // `nav.nav` left navH at 0 on a phone and parked the title underneath
    // the bar.
    const nav = document.querySelector<HTMLElement>('nav.nav, [data-game-bar]')
    const start = window.scrollY
    const t0 = performance.now()
    const dur = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260

    // Held for the whole scroll and a beat past its last write, because the
    // listener below would otherwise read our own movement as the user
    // scrolling up and hand the header straight back.
    settling.current = true
    let raf = 0
    let tail = 0

    // The bar is still shrinking when the ease ends — its padding transition
    // runs 0.25s, the head's 0.18s — so the position that was correct on the
    // last frame is a few pixels off by the time everything has settled, and
    // the title comes to rest lower than the bar it was meant to be tucked
    // under. Holding the recomputed target for a beat past the ease lands it
    // where it was aimed instead of where it was aimed a quarter-second ago.
    const HOLD = 300
    const step = (now: number) => {
      const navH = nav ? nav.getBoundingClientRect().height : 0
      const target = Math.max(0, window.scrollY + head.getBoundingClientRect().top - navH - 2)
      const t = dur > 0 ? Math.min(1, (now - t0) / dur) : 1
      const eased = 1 - Math.pow(1 - t, 3)
      if (t < 1) {
        window.scrollTo(0, start + (target - start) * eased)
        raf = requestAnimationFrame(step)
      } else if (now - t0 < dur + HOLD) {
        if (Math.abs(target - window.scrollY) > 0.5) window.scrollTo(0, target)
        raf = requestAnimationFrame(step)
      } else {
        tail = window.setTimeout(() => {
          settling.current = false
        }, 160)
      }
    }
    raf = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(tail)
      settling.current = false
      document.body.classList.remove(cls)
    }
  }, [hdrSlim])

  // Scrolling the PAGE brings the header back. Scrolling the roster does
  // not, because that is a container scroll and never reaches the window —
  // which is exactly the distinction wanted: reading down the board keeps
  // the header out of the way, deliberately leaving it does not.
  useEffect(() => {
    if (!hdrSlim) return
    let lastY = Math.max(0, window.scrollY)
    const onScroll = () => {
      const y = Math.max(0, window.scrollY)
      // The spin scroll drives the window itself, mostly upward. Reading
      // those frames as the user scrolling up is what made the header close,
      // reopen and close again on a spin from low down the page.
      if (settling.current) {
        lastY = y
        return
      }
      // Deliberately only a real upward drag. This used to also restore on
      // `y < 4`, which the spin scroll now trips on its way to parking the
      // title at the top — the header would reopen the moment it arrived.
      if (y < lastY - 8) setHdrSlim(false)
      lastY = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [hdrSlim])

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
      setHdrSlim(false)
      // A wheel asked for by seed is a replay and never posts; any other is
      // freshly dealt and does.
      setShared(!!seed)
      setPost({ state: 'idle' })
      clearSeedFromUrl()
    } catch {
      setError('Could not reach the wheel. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Clear any in-flight animation timers on unmount so a spin that's still
  // running can't call setState against a dead component.
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
    setHdrSlim(false)
    // Drop any shared seed from the address bar. Otherwise a refresh after
    // this would re-deal whichever wheel the link arrived with instead of
    // the one now on screen.
    clearSeedFromUrl()
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
      setShared(false)
      setPost({ state: 'idle' })
      return
    }
    void load(poolId, null)
  }, [nextDeal, poolId, load])

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
  const bestPick = useMemo(
    () => Object.values(lineup).reduce((top, f) => Math.max(top, f?.player.ppg ?? 0), 0),
    [lineup]
  )

  const wins = useMemo(
    () => (deal ? recordFor(ppg, deal.benchmark) : 0),
    [ppg, deal]
  )

  // ── The board ───────────────────────────────────────────────
  //
  // A finished run posts itself. There is no "submit" button, because the
  // only thing a button would add is a way to leave a bad run off the board,
  // and a board you can opt out of after seeing the number is not a board.
  useEffect(() => {
    if (!done || !deal) return
    if (post.state !== 'idle') return

    let cancelled = false
    // The whole body runs inside the async call rather than around it, so
    // none of these land as a synchronous setState in an effect body.
    void (async () => {
      // A shared wheel is a replay of a deal somebody has already played, so
      // it stays off the board by design. Said out loud rather than silently
      // skipped, or the recap just looks broken.
      if (shared) {
        if (!cancelled) {
          setPost({
            state: 'refused',
            why: 'A shared wheel is a replay, so it stays off the board.',
          })
        }
        return
      }

      const picks = slots
        .map((s) => {
          const f = lineup[s.id]
          return f ? { spin: f.spin, player: f.playerIdx, slot: s.id } : null
        })
        .filter((p): p is { spin: number; player: number; slot: SlotId } => p != null)

      const run = { game: 'roulette', mode: null, pool: poolId, seed: deal.seed, picks }

      if (!signedIn) {
        // Banked, not lost. The account is asked for at the first moment
        // skipping it costs the player something, which is a better ask
        // than the lobby's.
        bankRun({ ...run, at: Date.now() })
        if (!cancelled) setPost({ state: 'banked' })
        return
      }

      if (!cancelled) setPost({ state: 'sending' })
      const out = await postRun(run)
      if (cancelled) return
      if (out.ok) {
        setPost({ state: 'posted', rank: out.rank ?? null, total: out.total ?? 0 })
      } else if (out.needsAuth) {
        // The session lapsed between dealing and finishing. Bank it and ask.
        bankRun({ ...run, at: Date.now() })
        setPost({ state: 'banked' })
      } else {
        setPost({ state: 'refused', why: out.error ?? 'Could not reach the board.' })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [done, deal, post.state, shared, slots, lineup, poolId, signedIn])

  // Anything banked while signed out goes up the moment there's an account
  // to hang it on. Runs first, so a player who signs in from the recap sees
  // the board with their history already on it.
  useEffect(() => {
    if (!signedIn) return
    void claimBank()
  }, [signedIn])

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

  const shownGroups = useMemo(
    () => (posFilter ? groups.filter((g) => g.pos === posFilter) : groups),
    [groups, posFilter]
  )

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

  // Spins the wheel onto a specific index. Taking the index as an argument
  // rather than reading spinIndex is what lets a reroll advance and start
  // spinning in the same handler: waiting for the state to settle first put
  // a dead "press Spin again" screen between the button and the wheel.
  const startSpin = useCallback(
    (atIndex: number) => {
      if (!deal || atIndex >= deal.spins.length) return
      setCopied(false)
      setRevealed(false)
      setSpinning(true)
      setHdrSlim(true)

      if (spinTimer.current) window.clearTimeout(spinTimer.current)
      if (flickerTimer.current) window.clearInterval(flickerTimer.current)

      // The wheel is theatre, not chance: the squad was decided by the seed
      // before the page loaded. The flicker cycles other squads so it reads
      // as a wheel slowing down rather than a spinner.
      const others = deal.spins.filter((_, i) => i !== atIndex)
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
    },
    [deal]
  )

  const spin = useCallback(() => {
    if (spinning || revealed || done) return
    startSpin(spinIndex)
  }, [spinning, revealed, done, spinIndex, startSpin])

  const advance = useCallback(() => {
    setRevealed(false)
    setSpinIndex((i) => i + 1)
    setPosFilter(null)
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
      setLineup((prev) => ({
        ...prev,
        [targetId]: {
          player,
          squad: current,
          bestAvailable,
          spin: spinIndex,
          playerIdx: current.players.indexOf(player),
        },
      }))
      // That pick finishes the lineup, so the board is done and the header
      // comes back for the recap.
      if (Object.keys(lineup).length + 1 >= slots.length) setHdrSlim(false)
      advance()
    },
    [current, revealed, slots, lineup, advance, slotFor, spinIndex]
  )

  // Rerolling spins straight into the next squad. It costs a reroll either
  // way, so making the player press Spin again afterwards was pure friction.
  const reroll = useCallback(() => {
    if (rerollsLeft <= 0 || !revealed) return
    setRerollsLeft((r) => r - 1)
    advance()
    startSpin(spinIndex + 1)
  }, [rerollsLeft, revealed, advance, startSpin, spinIndex])

  // The share link carries the finished run, so the preview a friend sees is
  // a scoreboard with the record on it rather than a generic card — and the
  // seed means they play the identical nine squads, in the identical order.
  const shareUrl = useCallback(() => {
    if (!deal) return ''
    const url = new URL(window.location.href)
    url.search = ''
    url.searchParams.set('pool', deal.pool.id)
    // No seed. A challenge means "play until you beat this", not "replay my
    // exact nine squads" — and a replayed deal can never go on a board, so
    // handing one to a friend would send them somewhere that doesn't count.
    // They land on a fresh wheel with the number to beat above it.
    if (deal.benchmark) url.searchParams.set('w', String(wins))
    url.searchParams.set('ppg', String(round1(ppg)))
    // The lineup itself, so the link preview shows who was drafted rather
    // than a bare score. Surnames only: it reads like a depth chart and
    // keeps the URL short enough to survive a group chat.
    const rows = deal.slots
      .map((slot) => {
        const f = lineup[slot.id]
        if (!f) return null
        const parts = f.player.name.split(/\s+/)
        const surname = (parts.length > 1 ? parts.slice(1).join(' ') : parts[0]).replace(/[,;]/g, '')
        return `${slot.label},${surname},${round1(f.player.ppg)}`
      })
      .filter(Boolean)
    if (rows.length > 0) url.searchParams.set('l', rows.join(';'))
    return url.toString()
  }, [deal, wins, ppg, lineup])

  const shareRun = useCallback(async () => {
    if (!deal) return
    const url = shareUrl()
    const rec = deal.benchmark ? `${wins}-${GAMES - wins}` : `${round1(ppg)} PPG`
    // The link is passed separately to the share sheet, which appends it
    // itself. Including it in the text too is what was producing two copies
    // of the URL in the shared message.
    const line = `I went ${rec} on Roster Roulette, ${round1(ppg)} ppg. Beat it!`
    try {
      if (navigator.share) {
        await navigator.share({ text: line, url })
        return
      }
    } catch {
      // Cancelled or unavailable, fall through to the clipboard.
    }
    try {
      await navigator.clipboard.writeText(`${line} ${url}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      /* clipboard blocked, the seed is on screen either way */
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
      {/* Phones get the lineup as a fixed bar at the bottom of the screen,
          where a thumb is. Resting state is the seven slots as a grid that
          fits the width; the chevron opens it into full rows with faces and
          names, for when you want to actually look at the team you've built.
          The record is deliberately absent from both: knowing you're on for
          14-3 with two slots left gives away the ending. */}
      <div className={styles.hud}>
        <button
          type="button"
          className={styles.hudBar}
          onClick={() => setHudOpen((v) => !v)}
          aria-expanded={hudOpen}
          aria-label={hudOpen ? 'Collapse lineup' : 'Expand lineup'}
        >
          <span className={styles.hudScore}>
            <span className={styles.hudPpg}>
              {round1(ppg)}
              <span className={styles.hudUnit}>PPG</span>
            </span>
          </span>
          <span className={styles.hudFilled}>
            {slots.length - openSlots.length}/{slots.length} set
          </span>
          <span className={hudOpen ? styles.hudChevronOpen : styles.hudChevron} aria-hidden>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </span>
        </button>

        {hudOpen ? (
          <div className={styles.hudRows}>
            {slots.map((s) => {
              const f = lineup[s.id]
              return (
                <div
                  key={s.id}
                  className={`${styles.hudRow} ${hoverSlot === s.id ? styles.hudRowHover : ''}`}
                  style={f ? ({ ['--pos' as string]: `var(--pos-${f.player.pos})` }) : undefined}
                >
                  <span className={styles.hudRowId}>{s.label}</span>
                  {f ? (
                    <>
                      <HudFace player={f.player} />
                      <span className={styles.hudRowName}>
                        {f.player.name}
                        <span className={styles.hudRowSub}>
                          {f.player.nflTeam ?? '·'} · {f.squad.year}
                        </span>
                      </span>
                      <span className={styles.hudRowPpg}>{round1(f.player.ppg)}</span>
                    </>
                  ) : (
                    <>
                      <span className={styles.hudRowBlank} />
                      <span className={styles.hudRowName} style={{ color: 'var(--gp-mute)' }}>
                        Open
                      </span>
                      <span className={styles.hudRowPpg} style={{ color: 'var(--gp-line)' }}>
                        ·
                      </span>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className={styles.hudSlots}>
            {slots.map((s) => {
              const f = lineup[s.id]
              const cls = f
                ? styles.hudCellFilled
                : hoverSlot === s.id
                  ? styles.hudCellHover
                  : styles.hudCell
              return (
                <div
                  key={s.id}
                  className={cls}
                  style={f ? ({ ['--pos' as string]: `var(--pos-${f.player.pos})` }) : undefined}
                >
                  <span className={styles.hudId}>{s.label}</span>
                  {f ? (
                    <span className={styles.hudVal}>{round1(f.player.ppg)}</span>
                  ) : (
                    <span className={styles.hudEmpty}>·</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
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
                  <span className={styles.recapNumVal}>{round1(bestPick)}</span>
                  <span className={styles.recapNumLbl}>Best pick</span>
                </div>
              </div>
              <Runback lineup={lineup} slots={slots} />
              <BoardLine post={post} poolId={poolId} signedIn={signedIn} />
              {/* Only after the run is actually on the board. Asked before
                  that, it would be a form standing between the player and
                  their score. */}
              {post.state === 'posted' && <ClaimPrompt poolId={poolId} />}
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
              {borrowedPool && (
                <OwnLeagueCta
                  signedIn={signedIn}
                  line="These were strangers. Point the wheel at your own league and it lands on people you actually know."
                />
              )}
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
              {Object.keys(lineup).length > 0 && (
                <button type="button" className={styles.btnQuiet} onClick={newWheel}>
                  Start a new wheel
                </button>
              )}
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
                <div className={styles.plateRight}>
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
                  <button type="button" className={styles.plateNew} onClick={newWheel}>
                    New draft
                  </button>
                </div>
              </div>

              {/* Filter rail. Doubles as the roster's contents at a glance:
                  each chip carries how many of that position are on the
                  squad, and a position with no slot open reads dimmed. */}
              <div className={styles.filterBar}>
                <button
                  type="button"
                  className={posFilter === null ? styles.filterChipOn : styles.filterChip}
                  onClick={() => setPosFilter(null)}
                >
                  All <span className={styles.filterCount}>{current.players.length}</span>
                </button>
                {groups.map((g) => (
                  <button
                    key={g.pos}
                    type="button"
                    className={posFilter === g.pos ? styles.filterChipOn : styles.filterChip}
                    style={{ ['--pos' as string]: `var(--pos-${g.pos})` }}
                    data-locked={!g.usable || undefined}
                    onClick={() => setPosFilter(posFilter === g.pos ? null : g.pos)}
                  >
                    {g.pos} <span className={styles.filterCount}>{g.players.length}</span>
                  </button>
                ))}
                <span className={styles.filterSpin}>
                  {spinIndex + 1}/{deal.spins.length}
                </span>
              </div>

              <div className={styles.roster} ref={rosterRef}>
                {shownGroups.map((g) => (
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
                          lineupsKnown={current.lineupsKnown}
                          draftsKnown={current.draftsKnown}
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
            <span className={styles.sheetTitle}>Your lineup</span>
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
                        {/* Holds the second line open. A filled or hovered slot
                            carries a sub-line and an empty one doesn't, and with
                            `.slot { flex: 1 }` the taller rows freeze at their
                            content height while the rest shrink around them — so
                            a slot appeared to grow the moment it was taken. The
                            row is the same height in all three states now. */}
                        <span className={styles.slotFrom} aria-hidden>
                          &nbsp;
                        </span>
                      </span>
                      <span className={styles.slotDash}>·</span>
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
  onHover,
  lineupsKnown,
  draftsKnown,
}: {
  player: SquadPlayer
  disabled: boolean
  onTake: () => void
  onHover: (p: SquadPlayer | null) => void
  /** False when the season has no lineup history to report. */
  lineupsKnown: boolean
  /** False when the season's draft was never ingested (free-tier leagues). */
  draftsKnown: boolean
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
            {draftsKnown && player.source === 'pickup' ? ' · Added in-season' : ''}
          </span>
          {lineupsKnown &&
            (player.weeksStarted > 0 ? (
              <span className={styles.startedTag}>Started {player.weeksStarted}</span>
            ) : (
              <span className={styles.benchedTag}>Never started</span>
            ))}
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

// Small headshot for the expanded mobile lineup.
function HudFace({ player }: { player: SquadPlayer }) {
  const [imgOk, setImgOk] = useState(true)
  const src = headshot(player.playerId)
  return (
    <span className={styles.hudRowShot}>
      {src && imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.hudRowImg}
          src={src}
          alt=""
          loading="lazy"
          onError={() => setImgOk(false)}
        />
      ) : (
        <span className={styles.hudRowInitials}>{initials(player.name)}</span>
      )}
    </span>
  )
}

// The deep bench. Same card, less height, headshot kept so a player further
// down the list still reads as a player rather than a table row.
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
  const [imgOk, setImgOk] = useState(true)
  const src = headshot(player.playerId)
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
      <span className={styles.compactShot}>
        {src && imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={styles.compactShotImg}
            src={src}
            alt=""
            loading="lazy"
            onError={() => setImgOk(false)}
          />
        ) : (
          <span className={styles.compactShotFallback}>{initials(player.name)}</span>
        )}
      </span>
      <span className={styles.compactMain}>
        <span className={styles.compactPos}>
          {player.pos}
          {player.posRank}
        </span>
        <span className={styles.compactName}>{player.name}</span>
        {player.nflTeam && <span className={styles.compactTeam}>{player.nflTeam}</span>}
      </span>
      <span className={styles.compactPpg}>{round1(player.ppg)}</span>
    </button>
  )
}

// What the run cost, in terms of the player's own decisions only.
//
// Deliberately says nothing about what the wheel could have paid at best.
// Quoting that ceiling tells anyone whose wheel came in under the 17-0 bar
// that they were never in it, which is a miserable thing to be told and
// takes the point out of the next spin. Losing because the squads were thin
// is fine; being shown the receipt for it isn't.
function Runback({
  lineup,
  slots,
}: {
  lineup: Partial<Record<SlotId, Filled>>
  slots: SlotDef[]
}) {
  const filled = slots.map((s) => lineup[s.id]).filter((f): f is Filled => f != null)
  if (filled.length === 0) return null
  const left = filled.reduce((sum, f) => sum + (f.bestAvailable - f.player.ppg), 0)
  if (left < 0.1) {
    return (
      <p className={styles.missed}>
        You took the best man available on every single spin.
      </p>
    )
  }
  return (
    <p className={styles.missed}>
      You walked past <b>{round1(left)}</b>{' '}points a week that were sitting on
      squads you took from.
    </p>
  )
}

/**
 * Where this run landed on the board, in one line under the recap.
 *
 * Deliberately one line and deliberately quiet. The recap's job is still to
 * make you want another wheel; a full leaderboard dropped in here would be
 * the loudest thing on the page and the wrong thing to have made loudest.
 * The rank links out to the board for anyone who wants the rest of it.
 */
function BoardLine({
  post,
  poolId,
  signedIn,
}: {
  post: PostState
  poolId: string
  signedIn: boolean
}) {
  const boardHref = `/games/roulette/board/?pool=${encodeURIComponent(poolId)}`

  if (post.state === 'idle' || post.state === 'sending') {
    return <p className={styles.boardLine}>Putting this on the board…</p>
  }

  if (post.state === 'posted') {
    const { rank, total } = post
    return (
      <p className={styles.boardLine}>
        {rank === 1 ? (
          <>
            <b>Best run on the board.</b>{' '}
          </>
        ) : rank != null ? (
          <>
            <b>{ordinal(rank)}</b> of {total.toLocaleString()} runs.{' '}
          </>
        ) : null}
        <a href={boardHref} className={styles.boardLink}>
          See the board
        </a>
      </p>
    )
  }

  if (post.state === 'banked') {
    // Not a failure and not phrased as one: the run is verified and waiting.
    // Asked here rather than in the lobby because this is the first moment
    // skipping the account costs the player something.
    return (
      <p className={styles.boardLine}>
        This run is saved on this device.{' '}
        <a
          href={`/login?mode=signup&next=${encodeURIComponent(boardHref)}`}
          className={styles.boardLink}
        >
          {signedIn ? 'Sign in again' : 'Make an account'}
        </a>{' '}
        to put it on the board.
      </p>
    )
  }

  return <p className={styles.boardLine}>{post.why}</p>
}

function profileLabel(profile: string): string {
  const ppr = profile.startsWith('ppr') ? 'PPR' : profile.startsWith('half') ? 'Half PPR' : 'Standard'
  const pass = profile.endsWith('6pt') ? '6 pt pass TD' : '4 pt pass TD'
  return `${ppr} · ${pass}`
}
