'use client'

// The table. Drag a card onto a lane, or tap it and tap the lane, and every lane he
// can line up in lights up with what he'd add there, formations and all. Nothing's
// final until you end the drive: a card you've placed comes back with a tap.
//
// Then it plays out in order, because a turn over at once is no turn at all: yours
// lock in, their play call takes the stage, their men flip one at a time, the numbers
// climb and the ball on each lane moves, and the next drive is called with a goal
// nobody's seen. After the last one the calls left on the field tally up, lane by
// lane, before anyone gets a verdict, because that's where a lane can still flip.
//
// Against a person the only difference is the clock and the wait: a drive goes down
// when both sides are in, and this page polls until it does. Only what's on the table
// ever reaches the browser: the server holds the other side.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { callOf, type FgCall } from '@/lib/packEmpire/locker/calls'
import {
  DRIVES,
  LANES,
  LANE_MAX,
  LEGAL_LANES,
  POSITION_RULE,
  canStack,
  driveGoal,
  formationsOn,
  pairStacks,
  payLabel,
  sideTotals,
  stackCost,
  stackPower,
  type DrivePlay,
  type Lane,
  type Play,
} from '@/lib/packEmpire/locker/fieldGeneral'
import type { MatchView } from '@/lib/packEmpire/locker/fieldGeneralMatch'
import { FAAB_WIN, LOCKER_PACKS, eventCost, eventPower, lockerPower } from '@/lib/packEmpire/locker/rules'
import type { Player } from '@/lib/packEmpire/rules'
import { lockerPost } from '../../api'
import { CallCard } from '../../CallCard'
import { CardSheet } from '../../CardSheet'
import { LockerCard } from '../../LockerCard'
import { WinMeter } from '../../WinMeter'
import { FG_RULES } from '../rulesCopy'
import { Backed, Ball, Crowns, DRIVE_DOTS, Formations, Ghosts, LANE_IDS, LaneMark, LaneNumber, OnField, PlayLog, TurnGuide, type GuideStep } from './parts'

type Pending = { card: Player; lane: Lane; stack: boolean }
type Called = { call: FgCall; lane: Lane; target?: string }

/** call: your move. snap: going to the server. locked: in, waiting on them. turn: it's
    flipping. tally: the calls on the field are paying out. over: the result is up. */
type Phase = 'call' | 'snap' | 'locked' | 'turn' | 'tally' | 'over'
type Sheet = 'guide' | 'field' | 'log' | 'rules'

const VERDICT: Record<string, string> = { won: 'Victory', lost: 'Defeat', drawn: 'A Draw', resigned: 'You Walked Off' }
const DRIVE_S = 75

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const lobby = '/games/pack-empire/locker/field-general/'

/** What happened last drive that the cards on the table don't show. */
function recap(m: MatchView): string {
  const bits: string[] = []
  const goal = driveGoal(m.lastGoal?.id)
  if (goal && m.lastGoal?.met[0]) bits.push(`Goal met: ${payLabel(goal.pay)}.`)
  if (goal && m.lastGoal?.met[1]) bits.push(m.lastGoal.met[0] ? `${m.foe.name} met it too.` : `${m.foe.name} met the goal.`)
  return bits.join(' ')
}

function WaitingRoom({ match, onCancel }: { match: MatchView; onCancel: () => void }) {
  const [copied, setCopied] = useState(false)
  const held = match.foe.name !== 'Open Seat'
  const copy = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}${lobby}${match.id}/`).catch(() => null)
    setCopied(true)
  }
  return (
    <div className="fg-wait">
      <div className="fg-wait-in">
        <Ball className="fg-wait-ball" />
        <div className="fg-wait-kick">Head To Head</div>
        <h1>{held ? `Waiting For ${match.foe.name}` : 'Waiting For An Opponent'}</h1>
        <p>{held ? 'They can accept from their Field General page, or from this link.' : 'Send this link. The first person to open it takes the other seat.'}</p>
        <button type="button" className="pe-btn" onClick={copy}>
          {copied ? 'Link Copied' : 'Copy The Link'}
        </button>
        <button type="button" className="pe-btn pe-btn--ghost pe-btn--sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export function MatchTable({ initial }: { initial: MatchView }) {
  const router = useRouter()
  const [match, setMatch] = useState(initial)
  const matchRef = useRef(initial)
  useEffect(() => {
    matchRef.current = match
  }, [match])
  const ended = initial.status !== 'live' && initial.status !== 'waiting'
  const [phase, setPhase] = useState<Phase>(ended ? 'over' : initial.locked.you ? 'locked' : 'call')
  const [pending, setPending] = useState<Pending[]>([])
  const [called, setCalled] = useState<Called[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [stacking, setStacking] = useState(false)
  const [moving, setMoving] = useState<string | null>(null)
  const [news, setNews] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [foeShown, setFoeShown] = useState(() => initial.foe.totals.map((t) => t.total))
  const [gains, setGains] = useState<({ n: number; key: number } | null)[]>([null, null, null])
  const [stamped, setStamped] = useState(ended ? 3 : 0)
  const [board, setBoard] = useState<[number, number][] | null>(() => (initial.result ? initial.result.lanes.map((l) => l.totals) : null))
  const [banner, setBanner] = useState<{ drive: number; key: number } | null>(initial.status === 'live' ? { drive: initial.drive, key: 0 } : null)
  const [spot, setSpot] = useState<{ call: FgCall; who: string; lane: Lane; delta?: number } | null>(null)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [detail, setDetail] = useState<Player | null>(null)
  const [restarting, setRestarting] = useState(false)
  const [dragging, setDragging] = useState<Player | FgCall | null>(null)
  const [clock, setClock] = useState<number | null>(initial.msLeft)
  const ghost = useRef<HTMLDivElement>(null)
  const drag = useRef<{ card: Player | FgCall; x: number; y: number; live: boolean } | null>(null)
  const noClick = useRef(false)
  const clockEnd = useRef(0)

  useEffect(() => {
    if (initial.msLeft != null) clockEnd.current = Date.now() + initial.msLeft
  }, [initial.msLeft])

  useEffect(() => {
    if (!banner) return
    const t = window.setTimeout(() => setBanner(null), 1500)
    return () => window.clearTimeout(t)
  }, [banner])

  const { event } = match
  const stat = (c: Player) => ({ cost: eventCost(c, event), power: eventPower(c, event), base: event ? lockerPower(c) : undefined })
  const price = (p: Pick<Pending, 'card' | 'stack'>) => (p.stack ? stackCost(p.card, event) : eventCost(p.card, event))
  const cap = match.room + match.carry
  const spent = pending.reduce((sum, p) => sum + price(p), 0) + called.reduce((sum, c) => sum + c.call.cost, 0)
  const left = cap - spent
  // The drive's own cap goes first, so this is what carries, and the rest of `left` is
  // the carried cap that runs out after this drive.
  const rolls = Math.max(0, match.room - spent)
  const placed = new Set(pending.map((p) => p.card.id))
  const hand = match.hand.filter((c) => !placed.has(c.id))
  const calls = match.calls.flatMap((id) => (called.some((c) => c.call.id === id) ? [] : (callOf(id) ?? [])))
  const held = hand.find((c) => c.id === picked) ?? null
  const heldCall = calls.find((c) => c.id === picked) ?? null
  const live = match.status === 'live'
  const calling = phase === 'call' && live
  const moveCall = heldCall?.does.kind === 'move'
  const youName = match.you.name
  const foeName = match.foe.name

  const yours = useMemo(() => {
    const lanes = LANES.map((_, i) => [...match.you.lanes[i], ...pending.filter((p) => p.lane === i && !p.stack).map((p) => p.card)])
    for (const c of called) {
      if (!c.target) continue
      const from = lanes.findIndex((l) => l.some((m) => m.id === c.target))
      if (from < 0) continue
      const man = lanes[from].find((m) => m.id === c.target) as Player
      lanes[from] = lanes[from].filter((m) => m.id !== c.target)
      lanes[c.lane] = [...lanes[c.lane], man]
    }
    return lanes
  }, [match, pending, called])
  const behind = useMemo(() => LANES.map((_, i) => [...match.you.stacks[i], ...pending.filter((p) => p.lane === i && p.stack).map((p) => p.card)]), [match, pending])
  const totals = useMemo(() => sideTotals(yours, behind, match.you.bonus, event).map((t) => t.total), [yours, behind, match, event])
  const formsOn = useMemo(() => formationsOn(yours).map((f) => f.id), [yours])

  const hostFor = (c: Player) => canStack(c) && LEGAL_LANES[c.pos].some((l) => l !== match.closed && yours[l].length > behind[l].length)
  const canPlace = (lane: number) => {
    if (heldCall) {
      if (moveCall) {
        const man = moving ? yours.flat().find((m) => m.id === moving) : null
        return !!man && lane !== match.closed && (LEGAL_LANES[man.pos] as number[]).includes(lane) && !yours[lane].includes(man) && yours[lane].length < LANE_MAX
      }
      return !!heldCall.aim
    }
    if (!held || lane === match.closed || !(LEGAL_LANES[held.pos] as number[]).includes(lane)) return false
    return stacking ? yours[lane].length > behind[lane].length : yours[lane].length < LANE_MAX
  }

  /** What a card would do in a lane, and any formation it would set off. */
  const preview = (lane: number): { gain: string; sub?: string } => {
    const does = heldCall?.does
    if (does?.kind === 'blitz') return { gain: `-${does.each * (match.foe.lanes[lane].length + match.foe.stacks[lane].length)}`, sub: 'So Far' }
    if (does?.kind === 'boost') return { gain: `+${does.each * [...yours[lane], ...behind[lane]].filter((c) => does.pos.includes(c.pos)).length}`, sub: 'So Far' }
    if (does?.kind === 'close') return { gain: 'Close' }
    if (does?.kind === 'stand') return { gain: 'Stand' }
    if (does?.kind === 'move') return { gain: 'Here' }
    if (does?.kind === 'turnover') {
      const last = match.foe.lanes[lane][match.foe.lanes[lane].length - 1]
      return { gain: 'Back', sub: last?.name.split(' ').slice(-1)[0] }
    }
    if (!held) return { gain: '' }
    if (stacking) {
      const after = sideTotals(yours, behind.map((l, i) => (i === lane ? [...l, held] : l)), match.you.bonus, event)
      const adds = after[lane].total - totals[lane]
      return { gain: `+${adds}`, sub: adds > stackPower(held, event) ? 'Depth' : undefined }
    }
    const lanes = yours.map((l, i) => (i === lane ? [...l, held] : l))
    const after = sideTotals(lanes, behind, match.you.bonus, event)
    const fresh = formationsOn(lanes).find((f) => !formsOn.includes(f.id))
    return { gain: `+${after[lane].total - totals[lane]}`, sub: fresh?.title }
  }

  const goal = driveGoal(match.goal)
  const plays: DrivePlay[] = pending.map((p) => ({ card: p.card, lane: p.lane, stack: p.stack }))
  const down: DrivePlay[] = [...LANES.flatMap((_, l) => [...yours[l], ...behind[l]].map((card) => ({ card, lane: l as Lane })))]
  const meeting = calling && !!goal && (called.some((c) => c.call.does.kind === 'goal') || goal.met({ plays, down, spent }))

  const verdict = (i: number) => {
    const w = match.result?.lanes[i].winner
    return i >= stamped || w === undefined ? undefined : w === 0 ? 'won' : w === 1 ? 'lost' : 'tied'
  }
  const youNum = (i: number) => (board ? board[i][0] : totals[i])
  const foeNum = (i: number) => (board ? board[i][1] : foeShown[i])
  const yourLead = LANE_IDS.filter((i) => youNum(i) > foeNum(i)).length
  const foeLead = LANE_IDS.filter((i) => foeNum(i) > youNum(i)).length

  const pick = (c: Player): boolean => {
    setError(null)
    setMoving(null)
    const full = eventCost(c, event)
    if (full > left && !(hostFor(c) && stackCost(c, event) <= left)) {
      setPicked(null)
      setError(`${c.name} costs ${full}, and you have ${left} left.`)
      return false
    }
    setPicked(c.id)
    setStacking(full > left)
    return true
  }

  const pickCall = (c: FgCall): boolean => {
    setError(null)
    setMoving(null)
    if (c.cost > left) {
      setPicked(null)
      setError(`${c.title} costs ${c.cost}, and you have ${left} left.`)
      return false
    }
    setPicked(c.id)
    return true
  }

  const tapMan = (c: Player) => (picked === c.id ? setPicked(null) : pick(c))
  const tapCall = (c: FgCall) => (picked === c.id ? setPicked(null) : pickCall(c))

  const place = (lane: Lane) => {
    if (heldCall) setCalled((list) => [...list, { call: heldCall, lane, ...(moving ? { target: moving } : {}) }])
    else if (held) setPending((p) => [...p, { card: held, lane, stack: stacking }])
    setPicked(null)
    setStacking(false)
    setMoving(null)
  }

  /** A man comes back, and anyone he leaves with nobody to stand behind comes too. */
  const takeBack = (id: string) => {
    setCalled((list) => list.filter((c) => c.target !== id))
    setPending((list) => {
      const gone = list.find((p) => p.card.id === id)
      const rest = list.filter((p) => p.card.id !== id)
      if (!gone || gone.stack) return rest
      let room = match.you.lanes[gone.lane].length + rest.filter((p) => p.lane === gone.lane && !p.stack).length - match.you.stacks[gone.lane].length
      return rest.filter((p) => p.lane !== gone.lane || !p.stack || room-- > 0)
    })
  }

  // Drag from the hand to a lane. A tap still works: it only turns into a drag once
  // the pointer's moved. The ghost moves on a transform, so a drag never re-renders.
  const startDrag = (e: React.PointerEvent, card: Player | FgCall) => {
    if (!calling || e.button !== 0) return
    drag.current = { card, x: e.clientX, y: e.clientY, live: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    if (!d.live) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 12) return
      const ok = 'does' in d.card ? pickCall(d.card) : pick(d.card)
      if (!ok) {
        drag.current = null
        return
      }
      d.live = true
      setDragging(d.card)
    }
    if (ghost.current) ghost.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -62%) rotate(-3deg)`
  }
  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d?.live) return
    noClick.current = true
    window.setTimeout(() => (noClick.current = false), 0)
    setDragging(null)
    const spot = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el instanceof HTMLElement && el.dataset.laneTarget)
    if (spot instanceof HTMLElement) place(Number(spot.dataset.laneTarget) as Lane)
  }

  /** The drive flips. `next` is the table after it. */
  const reveal = useCallback(async (next: MatchView) => {
    const quick = reduced()
    const before = matchRef.current.foe.totals.map((t) => t.total)
    const after = next.foe.totals.map((t) => t.total)
    matchRef.current = next
    setMatch(next)
    setPending([])
    setCalled([])
    setPicked(null)
    setMoving(null)
    setNews(next.overtime && next.drive === next.last ? 'Lanes are tied, so one more drive. Two new cards.' : recap(next))
    setPhase('turn')
    if (next.msLeft != null) {
      clockEnd.current = Date.now() + next.msLeft
      setClock(next.msLeft)
    }
    for (const p of next.lastCalls[1]) {
      const call = callOf(p.card)
      if (!call || quick) continue
      setSpot({ call, who: next.foe.name, lane: p.lane })
      await wait(1500)
      setSpot(null)
      await wait(120)
    }
    if (!quick) await wait(next.fresh.length * 170 + (next.fresh.length ? 420 : 120))
    setFoeShown(after)
    setGains((g) => after.map((n, i) => ({ n: n - before[i], key: (g[i]?.key ?? 0) + 1 })))
    if (!quick) await wait(620)
    if (next.status === 'live') {
      setBanner({ drive: next.drive, key: next.drive })
      setPhase(next.locked.you ? 'locked' : 'call')
      return
    }
    const r = next.result
    if (r) {
      // The calls left on the field land one at a time, then each lane gets its verdict.
      setPhase('tally')
      const shown = r.before.map((b) => [...b] as [number, number])
      setBoard(shown.map((b) => [...b] as [number, number]))
      if (!quick) await wait(500)
      for (const t of r.tallies) {
        const call = callOf(t.call)
        if (!call) continue
        shown[t.lane][t.on] = Math.max(0, shown[t.lane][t.on] + t.delta)
        setSpot({ call, who: t.seat === 0 ? next.you.name : next.foe.name, lane: t.lane, delta: t.delta })
        setBoard(shown.map((b) => [...b] as [number, number]))
        if (!quick) await wait(1300)
        setSpot(null)
        if (!quick) await wait(120)
      }
      for (let i = 1; i <= LANES.length; i++) {
        setStamped(i)
        if (!quick) await wait(520)
      }
      if (!quick) await wait(520)
    }
    setPhase('over')
  }, [])

  const run = useCallback(async () => {
    if (phase !== 'call') return
    setPhase('snap')
    setError(null)
    setPicked(null)
    setMoving(null)
    try {
      const sent: Play[] = [
        ...pending.map((p) => ({ card: p.card.id, lane: p.lane, ...(p.stack ? { stack: true } : {}) })),
        ...called.map((c) => ({ card: c.call.id, lane: c.lane, ...(c.target ? { target: c.target } : {}) })),
      ]
      const { match: next } = await lockerPost<{ match: MatchView }>('/field-general', { action: 'drive', id: match.id, plays: sent })
      if (next.drive === matchRef.current.drive && next.status === 'live') {
        setMatch(next)
        setPhase('locked')
        return
      }
      await reveal(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That play did not go through.')
      setPhase('call')
    }
  }, [phase, pending, called, match.id, reveal])
  const runRef = useRef(run)
  useEffect(() => {
    runRef.current = run
  }, [run])

  // Against a person: watch for them sitting down, locking in, and the drive flipping.
  useEffect(() => {
    if (!match.versus || (!match.open && !live) || phase === 'snap' || phase === 'turn' || phase === 'tally' || phase === 'over') return
    let stop = false
    const beat = async () => {
      try {
        const { match: next } = await lockerPost<{ match: MatchView }>('/field-general', { action: 'poll', id: match.id })
        if (stop) return
        const now = matchRef.current
        if (now.open && !next.open) {
          setMatch(next)
          setFoeShown(next.foe.totals.map((t) => t.total))
          clockEnd.current = Date.now() + (next.msLeft ?? 0)
          setBanner({ drive: next.drive, key: 1 })
        } else if (next.drive !== now.drive || next.status !== now.status) {
          await reveal(next)
        } else {
          setMatch((m) => ({ ...m, locked: next.locked, msLeft: next.msLeft }))
          if (next.msLeft != null) clockEnd.current = Date.now() + next.msLeft
        }
      } catch {
        // A missed beat is nothing: the next one will catch up.
      }
    }
    const t = window.setInterval(beat, phase === 'locked' || match.open ? 1200 : 2400)
    return () => {
      stop = true
      window.clearInterval(t)
    }
  }, [match.versus, match.open, match.id, match.status, live, phase, reveal])

  // The clock. Run out with cards down and they go in as they stand.
  useEffect(() => {
    if (!match.versus || !live || match.open) return
    const t = window.setInterval(() => {
      const ms = Math.max(0, clockEnd.current - Date.now())
      setClock(ms)
      if (ms === 0) runRef.current()
    }, 400)
    return () => window.clearInterval(t)
  }, [match.versus, match.open, live])

  const again = async () => {
    if (restarting) return
    setRestarting(true)
    try {
      const { id } = await lockerPost<{ id: string }>('/field-general', { action: 'start', mode: event ? 'event' : 'standard' })
      router.push(`${lobby}${id}/`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That game did not start.')
      setRestarting(false)
    }
  }

  const leave = async () => {
    await lockerPost('/field-general', { action: 'resign', id: match.id }).catch(() => null)
    router.push(lobby)
    router.refresh()
  }

  const walk = async () => {
    if (!leaving) {
      setLeaving(true)
      return
    }
    await leave()
  }

  if (match.open) return <WaitingRoom match={match} onCancel={leave} />

  const waiting = pending.length || called.length ? `Tap a card you placed to take it back.${rolls ? ` ${rolls} rolls to next drive.` : ''}` : news || 'Drag a card onto a lane, or tap it.'
  const lockedLine = `Locked in. Waiting on ${foeName}.`
  const coach =
    error ??
    (moveCall && !moving
      ? 'Tap one of your cards to move it.'
      : moveCall
        ? 'Now pick its new lane.'
        : heldCall
          ? heldCall.line
          : held
            ? stacking
              ? 'Stacks behind a card in its lane: half cost, half PL, no slot. Same position adds 2.'
              : POSITION_RULE[held.pos]
            : phase === 'locked'
              ? lockedLine
              : calling
                ? waiting
                : '')

  const inPlay = [...match.you.lanes.flat(), ...match.you.stacks.flat()]
  const steps: GuideStep[] = [
    { title: 'Line Up A Card', line: 'Pays full cost and takes a slot.', done: pending.some((p) => !p.stack) },
    { title: 'Stack A Card', line: `Behind a card in its lane: half cost, half PL, no slot. Same position adds 2.${inPlay.length || pending.length ? '' : ' Line up a card first.'}`, done: pending.some((p) => p.stack), off: !inPlay.length && !pending.length },
    { title: 'Run A Play Call', line: calls[0] ? `${calls[0].title} costs ${calls[0].cost}.` : called.length ? `${called[0].call.title} is in.` : 'None in hand.', done: called.length > 0, off: !calls.length && !called.length },
    { title: 'Save Cap', line: rolls ? `${rolls} rolls to next drive.` : 'Unspent cap carries one drive.', done: rolls > 0 },
    { title: 'End The Drive', line: 'Both sides flip together.' },
  ]

  const tags = (side: 'you' | 'foe') =>
    LANE_IDS.map((lane) => {
      const mine = side === 'you'
      const own = (mine ? match.you : match.foe).ongoing.filter((o) => o.lane === lane && o.own)
      const hit = (mine ? match.foe : match.you).ongoing.filter((o) => o.lane === lane && !o.own)
      const pendingTags = mine ? called.filter((c) => c.lane === lane && c.call.aim === 'yours' && c.call.ongoing) : called.filter((c) => c.lane === lane && c.call.aim === 'theirs')
      return (
        <div key={lane} className="fg-tags">
          {own.map((o, i) => (
            <span key={`o${i}`} className="fg-tag" data-who={mine ? 'you' : 'foe'}>
              {callOf(o.call)?.title}
              {o.delta !== 0 && <b>{o.delta > 0 ? `+${o.delta}` : o.delta}</b>}
            </span>
          ))}
          {hit.map((o, i) => (
            <span key={`h${i}`} className="fg-tag" data-who={mine ? 'foe' : 'you'}>
              {callOf(o.call)?.title}
              {o.delta !== 0 && <b>{o.delta}</b>}
            </span>
          ))}
          {pendingTags.map((c) => (
            <button key={c.call.id} type="button" className="fg-tag" data-who="you" data-pending onClick={() => setCalled((list) => list.filter((x) => x.call.id !== c.call.id))} aria-label={`Take ${c.call.title} back`}>
              {c.call.title}
            </button>
          ))}
        </div>
      )
    })

  const lastOne = live && match.drive >= match.last
  const goalBlock = goal ? (
    <>
      <span className="fg-goal-kick">{meeting ? 'Goal Met' : `Drive ${match.drive} Goal`}</span>
      <b>{goal.title}</b>
      <span className="fg-goal-line">{goal.line}</span>
      <span className="fg-goal-pay">{payLabel(goal.pay)}</span>
    </>
  ) : (
    <>
      <span className="fg-goal-kick">{live ? (match.overtime ? 'Overtime' : `Drive ${match.drive}`) : 'Final'}</span>
      <b>{live ? (match.overtime ? 'Win It Here' : 'No Goal This Drive') : 'That Is The Game'}</b>
      <span className="fg-goal-line">{live ? (match.overtime ? 'One drive to break the tie. Still level, and the bigger total wins.' : 'Three or four drives a game have one, and nobody knows which.') : ''}</span>
    </>
  )

  const seconds = clock != null ? Math.ceil(clock / 1000) : null

  return (
    <div className="fg" data-phase={phase}>
      <header className="fg-hud">
        <button type="button" className="fg-hud-btn" onClick={() => setSheet('rules')} aria-label="Menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <div className="fg-bug">
          <span className="fg-bug-team" data-side="foe">
            <b>{foeName}</b>
            <Crowns held={foeLead} side="foe" />
          </span>
          <span className="fg-bug-drive" data-last={lastOne ? '' : undefined}>
            <small className="fg-bug-lab">{!live ? 'Final' : match.overtime ? 'Overtime' : lastOne ? 'Last Drive' : 'Drive'}</small>
            <b>{match.overtime ? 'OT' : live ? match.drive : DRIVES}</b>
            {!match.overtime && <small>Of {DRIVES}</small>}
          </span>
          <span className="fg-bug-team" data-side="you">
            <Crowns held={yourLead} side="you" />
            <b>{youName}</b>
          </span>
        </div>
        {event ? (
          <button type="button" className="fg-event" onClick={() => setSheet('rules')}>
            {event.title}
          </button>
        ) : (
          <span className="fg-hud-gap" />
        )}
        <button type="button" className="fg-hud-btn fg-hud-q" onClick={() => setSheet('guide')} aria-label="What you can do">
          ?
        </button>
      </header>

      <div className="fg-progress" aria-hidden>
        {DRIVE_DOTS.map((i) => (
          <i key={i} data-state={!live || i + 1 < match.drive ? 'done' : i + 1 === match.drive ? 'now' : undefined} />
        ))}
        {match.overtime && <i data-state={live ? 'now' : 'done'} data-ot />}
      </div>

      {match.versus && live && seconds != null && (
        <div className="fg-rope" data-low={seconds <= 15 ? '' : undefined} aria-label={`${seconds} seconds left`}>
          <i style={{ transform: `scaleX(${Math.min(1, seconds / DRIVE_S)})` }} />
        </div>
      )}

      <div className="fg-stage">
        <aside className="fg-rail fg-rail--left">
          <div className="fg-panel fg-plate">
            <span className="fg-plate-mono" data-side="foe">{foeName.slice(0, 2).toUpperCase()}</span>
            <span>
              <b>{foeName}</b>
              <small>{match.versus && match.locked.foe ? 'Locked In' : `${match.foe.hand} in hand · ${match.foe.deck} in deck`}</small>
            </span>
          </div>
          <div className="fg-panel fg-goal" data-met={meeting ? '' : undefined}>
            {goalBlock}
          </div>
          <div className="fg-panel">
            <h2>Your Drive</h2>
            <TurnGuide steps={steps} />
          </div>
        </aside>

        <div className="fg-pitch" data-drag={dragging ? '' : undefined}>
          <div className="fg-yards" aria-hidden>
            {['10', '20', '30', '40', '50', '40', '30', '20', '10'].map((y, i) => (
              <span key={i}>{y}</span>
            ))}
          </div>

          <div className="fg-ez fg-ez--foe">
            <span className="fg-ez-name" aria-hidden>{foeName}</span>
            <div className="fg-ez-row">{tags('foe')}</div>
          </div>

          <div className="fg-row fg-row--foe">
            {LANES.map((lane, i) => (
              <div key={lane.key} className="fg-half fg-half--foe">
                {match.foe.lanes[i].map((c, at) => {
                  const n = phase === 'turn' ? match.fresh.indexOf(c.id) : -1
                  const s = stat(c)
                  const man = pairStacks(match.foe.lanes[i], match.foe.stacks[i])[at]
                  return (
                    <Backed key={c.id} man={man} host={c} event={event} onTap={() => man && setDetail(man)}>
                      <LockerCard card={c} cost={s.cost} power={s.power} base={s.base} fresh={n >= 0} index={n} onClick={() => setDetail(c)} />
                    </Backed>
                  )
                })}
                <Ghosts used={match.foe.lanes[i].length} />
              </div>
            ))}
          </div>

          <div className="fg-mid">
            <div className="fg-plaques">
              {LANES.map((lane, i) => {
                const res = verdict(i)
                return (
                  <div key={lane.key} className="fg-plaque" data-lane={lane.key} data-res={res}>
                    <LaneNumber value={foeNum(i)} side="foe" lead={foeNum(i) > youNum(i)} gain={gains[i]} />
                    <span className="fg-lanetag" data-res={res} data-closed={match.closed === i ? '' : undefined}>
                      <LaneMark lane={lane.key} />
                      {res === 'won' ? 'Won' : res === 'lost' ? 'Lost' : res === 'tied' ? 'Tied' : match.closed === i ? 'Closed' : lane.label}
                    </span>
                    <LaneNumber value={youNum(i)} side="you" lead={youNum(i) > foeNum(i)} />
                  </div>
                )
              })}
            </div>
            {live && (
              <div className="fg-ribbon" data-met={meeting ? '' : undefined}>
                <span className="fg-goal-kick">{goal ? (meeting ? 'Met' : 'Goal') : match.overtime ? 'OT' : 'No Goal'}</span>
                <span className="fg-goal-line">{goal ? goal.line : match.overtime ? 'One drive to break the tie.' : 'Nothing extra this drive.'}</span>
                {goal && <span className="fg-goal-pay">{payLabel(goal.pay)}</span>}
              </div>
            )}
          </div>

          <div className="fg-row fg-row--you">
            {LANES.map((lane, i) => {
              const open = (calling && canPlace(i)) || (!!dragging && canPlace(i))
              const view = open ? preview(i) : null
              return (
                <div key={lane.key} className="fg-half fg-half--you" data-closed={match.closed === i ? '' : undefined}>
                  {yours[i].map((c, at) => {
                    const s = stat(c)
                    const man = pairStacks(yours[i], behind[i])[at]
                    const fresh = pending.some((p) => p.card.id === c.id)
                    const manFresh = !!man && pending.some((p) => p.card.id === man.id)
                    const movable = moveCall && !moving && match.you.lanes[i].some((m) => m.id === c.id) && match.you.lanes[i].length > match.you.stacks[i].length
                    return (
                      <Backed key={c.id} man={man} host={c} event={event} onTap={() => man && (manFresh && calling ? takeBack(man.id) : setDetail(man))}>
                        {fresh ? (
                          <LockerCard card={c} cost={s.cost} power={s.power} base={s.base} state="pending" onClick={calling ? () => takeBack(c.id) : undefined} label={`Take ${c.name} back`} />
                        ) : (
                          <LockerCard card={c} cost={s.cost} power={s.power} base={s.base} state={moving === c.id ? 'pending' : undefined} onClick={() => (movable ? setMoving(c.id) : setDetail(c))} />
                        )}
                      </Backed>
                    )
                  })}
                  <Ghosts used={yours[i].length} open={open && !heldCall?.aim} gain={view?.gain} sub={view?.sub} />
                </div>
              )
            })}
          </div>

          <div className="fg-ez fg-ez--you">
            <span className="fg-ez-name" aria-hidden>{youName}</span>
            <div className="fg-ez-row">{tags('you')}</div>
            {called.some((c) => !c.call.aim) && (
              <div className="fg-ez-called">
                {called
                  .filter((c) => !c.call.aim)
                  .map((c) => (
                    <button key={c.call.id} type="button" className="fg-tag" data-who="you" data-pending onClick={() => setCalled((list) => list.filter((x) => x.call.id !== c.call.id))} aria-label={`Take ${c.call.title} back`}>
                      {c.call.title}
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div className="fg-tracks" aria-hidden>
            {LANES.map((lane, i) => (
              <span key={lane.key} className="fg-track">
                <i style={{ '--m': Math.max(-1, Math.min(1, (youNum(i) - foeNum(i)) / 24)) } as React.CSSProperties}>
                  <Ball />
                </i>
              </span>
            ))}
          </div>

          <div className="fg-targets">
            {LANES.map((lane, i) => {
              const open = (calling && canPlace(i)) || (!!dragging && canPlace(i))
              const view = open ? preview(i) : null
              const dim = (held || heldCall?.aim) && !open
              return (
                <div key={lane.key} className="fg-target" data-open={open ? '' : undefined} data-dim={dim ? '' : undefined} data-aim={heldCall?.aim === 'theirs' ? 'foe' : undefined}>
                  {open && (
                    <button type="button" data-lane-target={i} onClick={() => place(i as Lane)} aria-label={`${held?.name ?? heldCall?.title} on ${lane.label}`}>
                      {(heldCall?.aim || yours[i].length >= LANE_MAX) && view && (
                        <b>
                          {view.gain}
                          {view.sub && <small>{view.sub}</small>}
                        </b>
                      )}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {calling && heldCall && !heldCall.aim && (
            <button type="button" className="fg-playzone" data-lane-target={0} onClick={() => place(0)}>
              <b>Drop It Here To Call It</b>
              <small>
                {heldCall.title}: {heldCall.line}
              </small>
            </button>
          )}

          {banner && (
            <div key={banner.key} className="fg-banner" aria-live="polite">
              <b>{banner.drive > DRIVES ? 'Overtime' : banner.drive === DRIVES ? 'Last Drive' : `Drive ${banner.drive}`}</b>
              <span>{match.room + match.carry} Cap{driveGoal(match.goal) ? ` · ${driveGoal(match.goal)?.title}` : ''}</span>
            </div>
          )}

          {spot && (
            <div className="fg-spot" aria-live="polite">
              <small>{spot.delta === undefined ? `${spot.who} Called` : `${spot.who} · ${LANES[spot.lane].label}`}</small>
              <CallCard call={spot.call} />
              {spot.delta !== undefined && spot.delta !== 0 && <b data-down={spot.delta < 0 ? '' : undefined}>{spot.delta > 0 ? `+${spot.delta}` : spot.delta}</b>}
            </div>
          )}

          {phase === 'tally' && !spot && <div className="fg-tallyhead">Final Tally</div>}
        </div>

        <aside className="fg-rail fg-rail--right">
          <div className="fg-panel">
            <h2>On The Field</h2>
            <OnField you={match.you} foe={match.foe} />
          </div>
          <div className="fg-panel">
            <h2>Formations</h2>
            <Formations mine={formsOn} theirs={match.foe.forms} />
          </div>
          <div className="fg-panel fg-panel--grow">
            <h2>Play-By-Play</h2>
            <PlayLog log={match.log} />
          </div>
        </aside>
      </div>

      {live && (
        <div className="fg-tray">
          <div className="fg-coach" aria-live="polite" data-err={error ? '' : undefined}>
            {(held || heldCall) && !error && <b>{held?.name ?? heldCall?.title}</b>}
            <span>{coach}</span>
          </div>
          <div className="fg-cap" aria-label={`${left} of ${cap} cap left`}>
            <small>{match.carry ? `Cap · ${match.carry} Carried` : 'Cap'}</small>
            <div className="fg-cap-row">
              <b>{left}</b>
              <span className="fg-gems" aria-hidden>
                {Array.from({ length: Math.max(DRIVES, cap) }, (_, i) => (
                  <i key={i} data-state={i < rolls ? 'left' : i < left ? 'carry' : i < cap ? 'spent' : undefined} />
                ))}
              </span>
            </div>
          </div>
          <div className="fg-hand">
            {[...hand, ...calls].map((c, i, all) => {
              const t = i - (all.length - 1) / 2
              const style = { '--t': t, '--d': Math.abs(t) } as React.CSSProperties
              const on = c.id === picked ? '' : undefined
              // The browser would drag a card's photo as an image, and cancel the pointer.
              const grab = { onPointerDown: (e: React.PointerEvent) => startDrag(e, c), onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: endDrag, onDragStart: (e: React.DragEvent) => e.preventDefault() }
              if ('does' in c) {
                return (
                  <div key={c.id} className="fg-hold" data-on={on} data-gone={dragging === c ? '' : undefined} style={style} {...grab}>
                    <CallCard call={c} state={c.cost > left ? 'off' : undefined} onClick={calling ? () => !noClick.current && tapCall(c) : undefined} />
                  </div>
                )
              }
              const s = stat(c)
              const out = s.cost > left && !(hostFor(c) && stackCost(c, event) <= left)
              return (
                <div key={c.id} className="fg-hold" data-on={on} data-gone={dragging === c ? '' : undefined} style={style} {...grab}>
                  <LockerCard card={c} cost={s.cost} power={s.power} base={s.base} state={out ? 'off' : undefined} onClick={calling ? () => !noClick.current && tapMan(c) : undefined} />
                </div>
              )
            })}
            {hand.length + calls.length === 0 && <p className="fg-hand-none">Your hand is empty.</p>}
          </div>
          <div className="fg-act">
            {held && hostFor(held) ? (
              <div className="fg-either" role="group" aria-label="How he comes in">
                <button type="button" className={`pe-btn pe-btn--sm${stacking ? ' pe-btn--ghost' : ''}`} aria-pressed={!stacking} disabled={eventCost(held, event) > left} onClick={() => setStacking(false)}>
                  Line Up {eventCost(held, event)}
                </button>
                <button type="button" className={`pe-btn pe-btn--sm${stacking ? '' : ' pe-btn--ghost'}`} aria-pressed={stacking} onClick={() => setStacking(true)}>
                  Stack {stackCost(held, event)}
                </button>
              </div>
            ) : (
              <button type="button" className="pe-btn fg-go" data-ready={calling && (left === 0 || pending.length + called.length > 0) ? '' : undefined} disabled={!calling} onClick={run}>
                {phase === 'snap' ? 'Snap' : phase === 'locked' ? 'Locked In' : phase === 'turn' ? 'Flipping' : pending.length || called.length ? 'End Drive' : 'Pass The Drive'}
              </button>
            )}
          </div>
        </div>
      )}

      {dragging && (
        <div ref={ghost} className="fg-ghost" aria-hidden>
          {'does' in dragging ? <CallCard call={dragging} /> : <LockerCard card={dragging} cost={stat(dragging).cost} power={stat(dragging).power} />}
        </div>
      )}

      {phase === 'over' && (
        <div className="fg-end" data-out={match.status}>
          {match.status === 'won' && <span className="fg-rays" aria-hidden />}
          <div className="fg-end-in">
            {match.walked && <div className="fg-end-kick">{foeName} Walked Off</div>}
            {match.result && match.result.score[0] === match.result.score[1] && match.result.winner !== null && <div className="fg-end-kick">Level On Lanes, Decided On Total Points</div>}
            <div className="fg-end-title">{VERDICT[match.status] ?? 'Game Over'}</div>
            {match.result && (
              <>
                <div className="fg-end-crowns" aria-label={`${match.result.score[0]} lanes to ${match.result.score[1]}`}>
                  {match.result.lanes.map((l, i) => (
                    <span key={LANES[i].key} className="fg-end-lane" data-res={l.winner === 0 ? 'won' : l.winner === 1 ? 'lost' : undefined} style={{ '--i': i } as React.CSSProperties}>
                      <Ball />
                      <small>{LANES[i].label}</small>
                      <b>
                        {l.totals[0]} - {l.totals[1]}
                      </b>
                      {l.stood != null && <em>Stand</em>}
                    </span>
                  ))}
                </div>
              </>
            )}
            {match.status === 'won' && <div className="fg-end-faab">+${FAAB_WIN} FAAB</div>}
            {match.wins.earned ? (
              <Link href="/games/pack-empire/locker/" className="fg-end-prize">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={LOCKER_PACKS.bonus.art} alt="" />
                <span>
                  <b>Bonus Pack Earned</b>
                  <span>Five wins today. It&apos;s waiting in your Locker.</span>
                </span>
              </Link>
            ) : (
              <WinMeter wins={match.wins.wins} need={match.wins.need} bonus={match.wins.wins >= match.wins.need ? 'waiting' : 'earning'} />
            )}
            <div className="fg-end-btns">
              {match.versus ? (
                <Link href={lobby} className="pe-btn">
                  Back To The Lobby
                </Link>
              ) : (
                <button type="button" className="pe-btn" disabled={restarting} onClick={again}>
                  Run It Back
                </button>
              )}
              <Link href="/games/pack-empire/locker/" className="pe-btn pe-btn--ghost">
                The Locker Room
              </Link>
            </div>
          </div>
        </div>
      )}

      {sheet && (
        <div className="fg-sheet" role="dialog" aria-modal="true" aria-label="Game menu" onClick={(e) => e.target === e.currentTarget && setSheet(null)}>
          <div className="fg-sheet-in">
            <div className="fg-tabs" role="tablist">
              {(
                [
                  ['guide', 'Your Drive'],
                  ['field', 'On The Field'],
                  ['log', 'Play-By-Play'],
                  ['rules', 'Rules'],
                ] as [Sheet, string][]
              ).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={sheet === id} onClick={() => setSheet(id)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="fg-sheet-body">
              {sheet === 'guide' && <TurnGuide steps={steps} />}
              {sheet === 'field' && (
                <>
                  <h2>Plays Down</h2>
                  <OnField you={match.you} foe={match.foe} />
                  <h2>Formations</h2>
                  <Formations mine={formsOn} theirs={match.foe.forms} />
                </>
              )}
              {sheet === 'log' && <PlayLog log={match.log} />}
              {sheet === 'rules' && (
                <>
                  {event && (
                    <div className="fg-sheet-event">
                      <b>{event.title}</b>
                      {event.line}
                    </div>
                  )}
                  <ul className="pe-fg-how">
                    {FG_RULES.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <div className="fg-sheet-btns">
              {live && (
                <button type="button" className="fg-walk" onClick={walk}>
                  {leaving ? (match.versus ? `Tap again to give ${foeName} the win` : 'Tap again to walk off') : 'Walk Off'}
                </button>
              )}
              <button type="button" className="pe-btn pe-btn--sm" onClick={() => { setSheet(null); setLeaving(false) }}>
                Back To The Game
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && <CardSheet card={detail} event={event} onClose={() => setDetail(null)} />}
    </div>
  )
}
