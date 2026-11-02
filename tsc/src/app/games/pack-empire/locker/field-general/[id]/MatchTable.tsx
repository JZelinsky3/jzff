'use client'

// The table. Pick a card and every lane he can line up in lights up with what he'd
// add there, chemistry and all. Place as many as your cap room covers, and a card
// you've placed comes back with a tap, so nothing's final until you run the play. A
// man with someone to stand behind can stack instead, and a play call is paid for
// the same way. The goal over the hand checks itself off as you place.
//
// Then it plays out in order, because a turn over at once is no turn at all: yours
// snap down, theirs flip one at a time, their numbers climb, and the next drive is
// called. On the last one each lane gets its verdict before the result. Only what's
// on the table ever reaches the browser: the server plays the other side.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { callOf, type FgCall } from '@/lib/packEmpire/locker/calls'
import {
  DRIVES,
  LANES,
  LANE_MAX,
  LEGAL_LANES,
  POSITION_RULE,
  canStack,
  driveGoal,
  laneTotal,
  payLabel,
  stackCost,
  stackPower,
  type DrivePlay,
  type Lane,
  type Play,
} from '@/lib/packEmpire/locker/fieldGeneral'
import type { MatchView } from '@/lib/packEmpire/locker/fieldGeneralMatch'
import { FAAB_WIN, LOCKER_PACKS, eventCost, eventPower, lockerPower, type LockerEvent } from '@/lib/packEmpire/locker/rules'
import type { Player } from '@/lib/packEmpire/rules'
import { useCountUp } from '../../../stage'
import { lockerPost } from '../../api'
import { CallCard } from '../../CallCard'
import { CardSheet } from '../../CardSheet'
import { LockerCard } from '../../LockerCard'
import { FG_RULES } from '../rulesCopy'
import { WinMeter } from '../../WinMeter'

type Pending = { card: Player; lane: Lane; stack: boolean }
type Called = { call: FgCall; lane: Lane }

/** call: your move. snap: your plays are going in. turn: theirs are turning over.
    over: the result is up. */
type Phase = 'call' | 'snap' | 'turn' | 'over'

const VERDICT: Record<string, string> = { won: 'You Won', lost: 'You Lost', drawn: 'A Tie', resigned: 'You Walked Off' }

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** The three lanes as routes, at the tag's size: a run up the middle, a quick out
    and a go. */
const LANE_MARK: Record<(typeof LANES)[number]['key'], React.ReactNode> = {
  ground: (
    <>
      <path d="M7 21c3-3 5-6 5-10 0-2 .5-3.5 1.5-5" />
      <path d="M10.5 8.5 14 5l3 3.8" />
    </>
  ),
  short: (
    <>
      <path d="M6 21v-8.5c0-1 .8-1.5 1.600-1.5H18" />
      <path d="m14.5 7.5 3.8 3.5-3.8 3.5" />
    </>
  ),
  deep: (
    <>
      <path d="M12 22V4" />
      <path d="m8 7.5 4-4 4 4" />
      <path d="M7 14h10" strokeDasharray="1.5 2.5" />
    </>
  ),
}

function LaneMark({ lane }: { lane: (typeof LANES)[number]['key'] }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {LANE_MARK[lane]}
    </svg>
  )
}

/** The empty places on a side. The first full row always shows; a tall screen shows
    the second too, and a short one only once there's a card in it (`.extra`). */
function Ghosts({ used, open = false, gain = '' }: { used: number; open?: boolean; gain?: string }) {
  const row = Math.max(2, Math.ceil(used / 2) * 2)
  return Array.from({ length: LANE_MAX - used }, (_, n) => (
    <span key={n} className={`pe-fg-slot${used + n >= row ? ' extra' : ''}`} data-next={open && n === 0 ? '' : undefined}>
      {open && n === 0 && <b>{gain}</b>}
    </span>
  ))
}

/** A man on the table, and whoever's stacked behind him: all he adds is a number, so
    a tag on the corner says it without taking up a slot. */
function Backed({ man, event, onTap, children }: { man?: Player; event: LockerEvent | null; onTap?: () => void; children: React.ReactNode }) {
  return (
    <span className="pe-fg-host">
      {children}
      {man && (
        <button type="button" className="pe-fg-stack" data-r={man.rarity} onClick={onTap} aria-label={`${man.name} stacked, adds ${stackPower(man, event)}`}>
          +{stackPower(man, event)}
        </button>
      )}
    </span>
  )
}

/** What happened last drive that the cards on the table don't show. */
function recap(m: MatchView): string {
  const bits: string[] = []
  const goal = driveGoal(m.lastGoal?.id)
  if (goal && m.lastGoal?.met[0]) bits.push(`Goal met: ${payLabel(goal.pay)}.`)
  if (goal && m.lastGoal?.met[1]) bits.push(m.lastGoal.met[0] ? 'The CPU met it too.' : 'The CPU met the goal.')
  for (const p of m.lastCalls[1]) {
    const call = callOf(p.card)
    if (call) bits.push(`CPU called ${call.title}${call.aimed ? ` on ${LANES[p.lane].label}` : ''}.`)
  }
  return bits.join(' ')
}

/** A lane's number, climbing to wherever it's just landed. On its own so a tick of the
    count never redraws the cards. */
function LaneNumber({ value, side, lead, gain }: { value: number; side: 'you' | 'foe'; lead: boolean; gain?: { n: number; key: number } | null }) {
  const shown = useCountUp(value, 420)
  return (
    <b className="pe-fg-num" data-side={side} data-lead={lead ? '' : undefined}>
      {shown}
      {gain && gain.n > 0 && (
        <span key={gain.key} className="pe-fg-pop" aria-hidden>
          +{gain.n}
        </span>
      )}
    </b>
  )
}

export function MatchTable({ initial }: { initial: MatchView }) {
  const router = useRouter()
  const [match, setMatch] = useState(initial)
  const [phase, setPhase] = useState<Phase>(initial.status === 'live' ? 'call' : 'over')
  const [pending, setPending] = useState<Pending[]>([])
  const [called, setCalled] = useState<Called[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [stacking, setStacking] = useState(false)
  const [news, setNews] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [foeShown, setFoeShown] = useState(() => initial.foe.totals.map((t) => t.total))
  const [gains, setGains] = useState<({ n: number; key: number } | null)[]>([null, null, null])
  const [stamped, setStamped] = useState(initial.status === 'live' ? 0 : 3)
  const [banner, setBanner] = useState<{ drive: number; key: number } | null>(initial.status === 'live' ? { drive: initial.drive, key: 0 } : null)
  const [help, setHelp] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [detail, setDetail] = useState<Player | null>(null)
  const [restarting, setRestarting] = useState(false)

  useEffect(() => {
    if (!banner) return
    const t = window.setTimeout(() => setBanner(null), 1200)
    return () => window.clearTimeout(t)
  }, [banner])

  const { event } = match
  const stat = (c: Player) => ({ cost: eventCost(c, event), power: eventPower(c, event), base: event ? lockerPower(c) : undefined })
  const price = (p: Pick<Pending, 'card' | 'stack'>) => (p.stack ? stackCost(p.card, event) : eventCost(p.card, event))
  const cap = match.room + match.carry
  const spent = pending.reduce((sum, p) => sum + price(p), 0) + called.reduce((sum, c) => sum + c.call.cost, 0)
  const left = cap - spent
  // The drive's own room goes first, so this is what carries, and the rest of `left`
  // is the carried room that runs out after this drive.
  const rolls = Math.max(0, match.room - spent)
  const placed = new Set(pending.map((p) => p.card.id))
  const hand = match.hand.filter((c) => !placed.has(c.id))
  const calls = match.calls.flatMap((id) => (called.some((c) => c.call.id === id) ? [] : (callOf(id) ?? [])))
  const held = hand.find((c) => c.id === picked) ?? null
  const heldCall = calls.find((c) => c.id === picked) ?? null
  const live = match.status === 'live'
  const calling = phase === 'call' && live

  const yours = useMemo(() => LANES.map((_, i) => [...match.you.lanes[i], ...pending.filter((p) => p.lane === i && !p.stack).map((p) => p.card)]), [match, pending])
  const behind = useMemo(() => LANES.map((_, i) => [...match.you.stacks[i], ...pending.filter((p) => p.lane === i && p.stack).map((p) => p.card)]), [match, pending])
  const bonus = useMemo(
    () =>
      LANES.map((_, i) =>
        called.reduce((sum, { call: { does }, lane }) => sum + (does.kind === 'lane' && (does.lane ?? lane) === i ? does.n : does.kind === 'every' ? does.n : 0), match.you.bonus[i])
      ),
    [match, called]
  )
  const totals = useMemo(() => yours.map((cards, i) => laneTotal(cards, event, behind[i], bonus[i]).total), [yours, behind, bonus, event])

  const hostFor = (c: Player) => canStack(c) && LEGAL_LANES[c.pos].some((l) => l !== match.closed && yours[l].length > behind[l].length)
  const canPlace = (lane: number) => {
    if (heldCall) return !!heldCall.aimed
    if (!held || lane === match.closed || !(LEGAL_LANES[held.pos] as number[]).includes(lane)) return false
    return stacking ? yours[lane].length > behind[lane].length : yours[lane].length < LANE_MAX
  }
  const gain = (lane: number) => (held && !stacking ? laneTotal([...yours[lane], held], event, behind[lane], bonus[lane]).total - totals[lane] : 0)

  /** What a stacked man or a call would do to a lane. Printed in the next empty slot
      like a man's gain, or over the lane once it's full, since these can still land. */
  const mark = (lane: number) => {
    if (held && stacking) return `+${stackPower(held, event)}`
    const does = heldCall?.does
    if (does?.kind === 'lane') return `+${does.n}`
    if (does?.kind === 'blitz') return `-${does.each * match.foe.lanes[lane].length}`
    if (does?.kind === 'close') return 'Closed'
    return null
  }

  const goal = driveGoal(match.goals[match.drive - 1])
  const nextGoal = driveGoal(match.goals[match.drive])
  const plays: DrivePlay[] = pending.map((p) => ({ card: p.card, lane: p.lane, stack: p.stack }))
  const down: DrivePlay[] = [...LANES.flatMap((_, l) => [...match.you.lanes[l], ...match.you.stacks[l]].map((card) => ({ card, lane: l as Lane }))), ...plays]
  const meeting = calling && !!goal && (called.some((c) => c.call.does.kind === 'goal') || goal.met({ plays, down, spent }))

  const verdict = (i: number) => {
    const w = match.result?.lanes[i].winner
    return i >= stamped || w === undefined ? undefined : w === 0 ? 'won' : w === 1 ? 'lost' : 'tied'
  }

  const pick = (c: Player) => {
    setError(null)
    if (picked === c.id) {
      setPicked(null)
      return
    }
    const full = eventCost(c, event)
    if (full > left && !(hostFor(c) && stackCost(c, event) <= left)) {
      setPicked(null)
      setError(`${c.name} costs ${full}, and you have ${left} left.`)
      return
    }
    setPicked(c.id)
    setStacking(full > left)
  }

  const pickCall = (c: FgCall) => {
    setError(null)
    if (picked === c.id) {
      setPicked(null)
      return
    }
    const why = c.cost > left ? `${c.title} costs ${c.cost}, and you have ${left} left.` : c.lastDriveOnly && match.drive !== DRIVES ? `${c.title} is for the last drive.` : null
    setError(why)
    setPicked(why ? null : c.id)
  }

  const place = (lane: Lane) => {
    if (heldCall) setCalled((list) => [...list, { call: heldCall, lane }])
    else if (held) setPending((p) => [...p, { card: held, lane, stack: stacking }])
    setPicked(null)
    setStacking(false)
  }

  /** A man comes back, and anyone he leaves with nobody to stand behind comes with him. */
  const takeBack = (id: string) =>
    setPending((list) => {
      const gone = list.find((p) => p.card.id === id)
      const rest = list.filter((p) => p.card.id !== id)
      if (!gone || gone.stack) return rest
      let room = match.you.lanes[gone.lane].length + rest.filter((p) => p.lane === gone.lane && !p.stack).length - match.you.stacks[gone.lane].length
      return rest.filter((p) => p.lane !== gone.lane || !p.stack || room-- > 0)
    })

  const run = async () => {
    if (!calling) return
    setPhase('snap')
    setError(null)
    setPicked(null)
    const quick = reduced()
    try {
      const sent: Play[] = [...pending.map((p) => ({ card: p.card.id, lane: p.lane, ...(p.stack ? { stack: true } : {}) })), ...called.map((c) => ({ card: c.call.id, lane: c.lane }))]
      const { match: next } = await lockerPost<{ match: MatchView }>('/field-general', { action: 'drive', id: match.id, plays: sent })
      const before = foeShown
      const after = next.foe.totals.map((t) => t.total)
      setMatch(next)
      setPending([])
      setCalled([])
      setNews(recap(next))
      setPhase('turn')
      if (!quick) await wait(next.fresh.length * 170 + (next.fresh.length ? 420 : 120))
      setFoeShown(after)
      setGains((g) => after.map((n, i) => ({ n: n - before[i], key: (g[i]?.key ?? 0) + 1 })))
      if (!quick) await wait(560)
      if (next.status === 'live') {
        setBanner({ drive: next.drive, key: next.drive })
        setPhase('call')
        return
      }
      for (let i = 1; i <= LANES.length; i++) {
        setStamped(i)
        if (!quick) await wait(480)
      }
      if (!quick) await wait(420)
      setPhase('over')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That play did not go through.')
      setPhase('call')
    }
  }

  const again = async () => {
    if (restarting) return
    setRestarting(true)
    try {
      const { id } = await lockerPost<{ id: string }>('/field-general', { action: 'start', mode: event ? 'event' : 'standard' })
      router.push(`/games/pack-empire/locker/field-general/${id}/`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That game did not start.')
      setRestarting(false)
    }
  }

  const walk = async () => {
    if (!leaving) {
      setLeaving(true)
      return
    }
    await lockerPost('/field-general', { action: 'resign', id: match.id }).catch(() => null)
    router.push('/games/pack-empire/locker/field-general/')
    router.refresh()
  }

  const waiting = pending.length || called.length ? `Tap a card you placed to take it back.${rolls ? ` ${rolls} rolls to next drive.` : ''}` : news || 'Pick a card, then a lane.'
  const coach = error ?? (heldCall ? heldCall.line : held ? (stacking ? 'Half his cost and half his strength, behind a man in his lane.' : POSITION_RULE[held.pos]) : calling ? waiting : '')

  return (
    <div className="pe-fg">
      <header className="pe-fg-bar">
        <div className="pe-fg-drive">
          <b>{live ? `Drive ${match.drive}` : 'Final'}</b>
          <span className="pe-fg-drives" aria-label={`Drive ${Math.min(match.drive, DRIVES)} of ${DRIVES}`}>
            {Array.from({ length: DRIVES }, (_, i) => (
              <i key={i} data-on={i < match.drive ? '' : undefined} />
            ))}
          </span>
        </div>
        {event ? (
          <button type="button" className="pe-fg-event" onClick={() => setHelp(true)}>
            {event.title}
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="pe-fg-help" onClick={() => setHelp(true)} aria-label="How it works">
          ?
        </button>
      </header>

      <div className="pe-fg-field">
        <div className="pe-fg-zone pe-fg-zone--foe">
          <b>CPU</b>
          <span>
            {match.foe.hand} in hand · {match.foe.deck} in deck
          </span>
        </div>

        <div className="pe-fg-lanes">
          {LANES.map((lane, i) => {
            const open = canPlace(i)
            const res = verdict(i)
            return (
              <section key={lane.key} className="pe-fg-lane" data-open={open ? '' : undefined} data-dim={(held || heldCall?.aimed) && !open ? '' : undefined} data-closed={match.closed === i ? '' : undefined} aria-label={lane.label}>
                <div className="pe-fg-side pe-fg-side--foe">
                  {match.foe.lanes[i].map((c, at) => {
                    const n = phase === 'turn' ? match.fresh.indexOf(c.id) : -1
                    const s = stat(c)
                    const man = match.foe.stacks[i][at]
                    return (
                      <Backed key={c.id} man={man} event={event} onTap={() => setDetail(man)}>
                        <LockerCard card={c} cost={s.cost} power={s.power} base={s.base} fresh={n >= 0} index={n} onClick={() => setDetail(c)} />
                      </Backed>
                    )
                  })}
                  <Ghosts used={match.foe.lanes[i].length} />
                </div>

                <div className="pe-fg-los">
                  <LaneNumber value={foeShown[i]} side="foe" lead={foeShown[i] > totals[i]} gain={gains[i]} />
                  <span className="pe-fg-tag" data-res={res}>
                    <LaneMark lane={lane.key} />
                    {res === 'won' ? 'Won' : res === 'lost' ? 'Lost' : res === 'tied' ? 'Tied' : match.closed === i ? 'Closed' : lane.label}
                  </span>
                  <LaneNumber value={totals[i]} side="you" lead={totals[i] > foeShown[i]} />
                </div>

                <div className="pe-fg-side pe-fg-side--you">
                  {yours[i].map((c, at) => {
                    const s = stat(c)
                    const man = behind[i][at]
                    const fresh = pending.some((p) => p.card.id === c.id)
                    const manFresh = !!man && pending.some((p) => p.card.id === man.id)
                    return (
                      <Backed key={c.id} man={man} event={event} onTap={() => (manFresh && calling ? takeBack(man.id) : setDetail(man))}>
                        {fresh ? (
                          <LockerCard card={c} cost={s.cost} power={s.power} base={s.base} state="pending" onClick={calling ? () => takeBack(c.id) : undefined} label={`Take ${c.name} back`} />
                        ) : (
                          <LockerCard card={c} cost={s.cost} power={s.power} base={s.base} onClick={() => setDetail(c)} />
                        )}
                      </Backed>
                    )
                  })}
                  <Ghosts used={yours[i].length} open={open} gain={mark(i) ?? `+${gain(i)}`} />
                </div>
                {open && (
                  <button type="button" className="pe-fg-target" onClick={() => place(i as Lane)} aria-label={`Play ${held?.name ?? heldCall?.title} on ${lane.label}`}>
                    {yours[i].length >= LANE_MAX && <b>{mark(i)}</b>}
                  </button>
                )}
              </section>
            )
          })}
        </div>

        <div className="pe-fg-zone pe-fg-zone--you">
          <b>You</b>
          {called.map((c) => (
            <button key={c.call.id} type="button" className="pe-fg-called" onClick={() => setCalled((list) => list.filter((x) => x.call.id !== c.call.id))} aria-label={`Take ${c.call.title} back`}>
              {c.call.title}
              {c.call.aimed ? ` · ${LANES[c.lane].label}` : ''}
            </button>
          ))}
          <span>{match.you.deck} in deck</span>
        </div>

        {banner && (
          <div key={banner.key} className="pe-fg-banner" aria-live="polite">
            <b>{banner.drive === DRIVES ? 'Last Drive' : `Drive ${banner.drive}`}</b>
            <span>{cap} Cap Room</span>
          </div>
        )}
      </div>

      {live && (
        <>
          {(goal ?? nextGoal) && (
            <button type="button" className="pe-fg-goal" data-met={meeting ? '' : undefined} onClick={() => setHelp(true)}>
              <span className="pe-fg-goal-kick">{goal ? 'Goal' : 'Next Drive'}</span>
              <span className="pe-fg-goal-line">
                <b>{(goal ?? nextGoal)?.title}</b> {(goal ?? nextGoal)?.line}
              </span>
              <span className="pe-fg-goal-pay">{payLabel(((goal ?? nextGoal) as NonNullable<typeof goal>).pay)}</span>
            </button>
          )}
          <div className="pe-fg-coach" aria-live="polite" data-err={error ? '' : undefined}>
            {(held || heldCall) && !error && <b>{held?.name ?? heldCall?.title}</b>}
            <span>{coach}</span>
          </div>
          <div className="pe-fg-tray">
          <div className="pe-fg-hand">
            {[...hand, ...calls].map((c, i, all) => {
              const t = i - (all.length - 1) / 2
              const style = { '--t': t, '--d': Math.abs(t) } as React.CSSProperties
              if ('does' in c) {
                return (
                  <div key={c.id} className="pe-fg-hold" data-on={c.id === picked ? '' : undefined} style={style}>
                    <CallCard call={c} state={c.cost > left || (c.lastDriveOnly && match.drive !== DRIVES) ? 'off' : undefined} onClick={calling ? () => pickCall(c) : undefined} />
                  </div>
                )
              }
              const s = stat(c)
              const out = s.cost > left && !(hostFor(c) && stackCost(c, event) <= left)
              return (
                <div key={c.id} className="pe-fg-hold" data-on={c.id === picked ? '' : undefined} style={style}>
                  <LockerCard card={c} cost={s.cost} power={s.power} base={s.base} state={out ? 'off' : undefined} onClick={calling ? () => pick(c) : undefined} />
                </div>
              )
            })}
            {hand.length + calls.length === 0 && <p className="pe-fg-hand-none">Your hand is empty.</p>}
          </div>
          <div className="pe-fg-act">
            <div className="pe-fg-cap" aria-label={`${left} of ${cap} cap room left`}>
              <small>{match.carry ? `Cap Room · ${match.carry} Carried` : 'Cap Room'}</small>
              <b>{left}</b>
              <span className="pe-fg-rooms" aria-hidden>
                {Array.from({ length: Math.max(DRIVES, cap) }, (_, i) => (
                  <i key={i} data-state={i < rolls ? 'left' : i < left ? 'carry' : i < cap ? 'spent' : undefined} />
                ))}
              </span>
            </div>
            {held && hostFor(held) ? (
              <div className="pe-fg-either" role="group" aria-label="How he comes in">
                <button type="button" className={`pe-btn pe-btn--sm${stacking ? ' pe-btn--ghost' : ''}`} aria-pressed={!stacking} disabled={eventCost(held, event) > left} onClick={() => setStacking(false)}>
                  Line Up {eventCost(held, event)}
                </button>
                <button type="button" className={`pe-btn pe-btn--sm${stacking ? '' : ' pe-btn--ghost'}`} aria-pressed={stacking} onClick={() => setStacking(true)}>
                  Stack {stackCost(held, event)}
                </button>
              </div>
            ) : heldCall && !heldCall.aimed ? (
              <button type="button" className="pe-btn pe-fg-go" onClick={() => place(0)}>
                Call It
              </button>
            ) : (
              <button type="button" className="pe-btn pe-fg-go" disabled={!calling} onClick={run}>
                {phase === 'snap' ? 'Snap' : phase === 'turn' ? 'Turning Over' : pending.length || called.length ? 'Run The Play' : 'Pass The Drive'}
              </button>
            )}
          </div>
          </div>
        </>
      )}

      {phase === 'over' && (
        <div className="pe-fg-end" data-out={match.status}>
          {match.status === 'won' && <span className="pe-fg-rays" aria-hidden />}
          <div className="pe-fg-end-in">
            <div className="pe-fg-end-kick">{match.result ? `${match.result.score[0]} ${match.result.score[0] === 1 ? 'Lane' : 'Lanes'} To ${match.result.score[1]}` : 'Field General'}</div>
            <div className="pe-fg-end-title">{VERDICT[match.status] ?? 'Game Over'}</div>
            {match.result && (
              <div className="pe-fg-end-lanes">
                {match.result.lanes.map((l, i) => (
                  <span key={LANES[i].key} className="pe-fg-end-lane" data-res={l.winner === 0 ? 'won' : l.winner === 1 ? 'lost' : undefined}>
                    <small>{LANES[i].label}</small>
                    <b>
                      {l.totals[0]} - {l.totals[1]}
                    </b>
                  </span>
                ))}
              </div>
            )}
            {match.status === 'won' && <div className="pe-fg-end-faab">+${FAAB_WIN} FAAB</div>}
            {match.wins.earned ? (
              <Link href="/games/pack-empire/locker/" className="pe-fg-end-prize">
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
            <div className="pe-fg-end-btns">
              <button type="button" className="pe-btn" disabled={restarting} onClick={again}>
                Run It Back
              </button>
              <Link href="/games/pack-empire/locker/" className="pe-btn pe-btn--ghost">
                The Locker
              </Link>
            </div>
          </div>
        </div>
      )}

      {help && (
        <div className="pe-fg-sheet" role="dialog" aria-modal="true" aria-label="How it works" onClick={(e) => e.target === e.currentTarget && setHelp(false)}>
          <div className="pe-fg-sheet-in">
            <h2>Two Lanes Of Three</h2>
            {event && (
              <div className="pe-fg-sheet-event">
                <b>{event.title}</b>
                {event.line}
              </div>
            )}
            {match.goals.some(Boolean) && (
              <ol className="pe-fg-goals">
                {match.goals.map((id, i) => {
                  const g = driveGoal(id)
                  return (
                    g && (
                      <li key={g.id} data-now={i + 1 === match.drive ? '' : undefined} data-past={i + 1 < match.drive ? '' : undefined}>
                        <small>Drive {i + 1}</small>
                        <span>
                          <b>{g.title}</b> {g.line}
                        </span>
                        <em>{payLabel(g.pay)}</em>
                      </li>
                    )
                  )
                })}
              </ol>
            )}
            <ul className="pe-fg-how">
              {FG_RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <div className="pe-fg-sheet-btns">
              <button type="button" className="pe-fg-walk" onClick={walk}>
                {leaving ? 'Tap again to walk off' : 'Walk Off'}
              </button>
              <button type="button" className="pe-btn pe-btn--sm" onClick={() => { setHelp(false); setLeaving(false) }}>
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
