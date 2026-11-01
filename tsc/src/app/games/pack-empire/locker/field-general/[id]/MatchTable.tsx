'use client'

// The table. Pick a card and every lane he can line up in lights up with what he'd
// add there, chemistry and all. Place as many as your cap room covers, and a card
// you've placed comes back with a tap, so nothing's final until you run the play.
//
// Then it plays out in order, because a turn over at once is no turn at all: yours
// snap down, theirs flip one at a time, their numbers climb, and the next drive is
// called. On the last one each lane gets its verdict before the result. Only what's
// on the table ever reaches the browser: the server plays the other side.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { DRIVES, LANES, LANE_MAX, LEGAL_LANES, POSITION_RULE, laneTotal, type Lane, type Play } from '@/lib/packEmpire/locker/fieldGeneral'
import type { MatchView } from '@/lib/packEmpire/locker/fieldGeneralMatch'
import { LOCKER_PACKS, eventCost, eventPower, lockerPower } from '@/lib/packEmpire/locker/rules'
import type { Player } from '@/lib/packEmpire/rules'
import { useCountUp } from '../../../stage'
import { lockerPost } from '../../api'
import { CardSheet } from '../../CardSheet'
import { LockerCard } from '../../LockerCard'
import { FG_RULES } from '../rulesCopy'
import { WinMeter } from '../../WinMeter'

type Pending = { card: Player; lane: Lane }

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
function Ghosts({ used, open = false, gain = 0 }: { used: number; open?: boolean; gain?: number }) {
  const row = Math.max(2, Math.ceil(used / 2) * 2)
  return Array.from({ length: LANE_MAX - used }, (_, n) => (
    <span key={n} className={`pe-fg-slot${used + n >= row ? ' extra' : ''}`} data-next={open && n === 0 ? '' : undefined}>
      {open && n === 0 && <b>+{gain}</b>}
    </span>
  ))
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
  const [picked, setPicked] = useState<string | null>(null)
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
  const spent = pending.reduce((sum, p) => sum + eventCost(p.card, event), 0)
  const left = match.room - spent
  const placed = new Set(pending.map((p) => p.card.id))
  const hand = match.hand.filter((c) => !placed.has(c.id))
  const held = hand.find((c) => c.id === picked) ?? null
  const live = match.status === 'live'
  const calling = phase === 'call' && live

  const yours = useMemo(() => LANES.map((_, i) => [...match.you.lanes[i], ...pending.filter((p) => p.lane === i).map((p) => p.card)]), [match, pending])
  const totals = useMemo(() => yours.map((cards) => laneTotal(cards, event).total), [yours, event])
  const canPlace = (lane: number) => !!held && (LEGAL_LANES[held.pos] as number[]).includes(lane) && yours[lane].length < LANE_MAX
  const gain = (lane: number) => (held ? laneTotal([...yours[lane], held], event).total - totals[lane] : 0)
  const verdict = (i: number) => {
    const w = match.result?.lanes[i].winner
    return i >= stamped || w === undefined ? undefined : w === 0 ? 'won' : w === 1 ? 'lost' : 'tied'
  }

  const pick = (c: Player) => {
    setError(null)
    if (eventCost(c, event) > left) {
      setPicked(null)
      setError(`${c.name} costs ${eventCost(c, event)}, and you have ${left} left.`)
      return
    }
    setPicked(picked === c.id ? null : c.id)
  }

  const place = (lane: Lane) => {
    if (!held) return
    setPending((p) => [...p, { card: held, lane }])
    setPicked(null)
  }

  const run = async () => {
    if (!calling) return
    setPhase('snap')
    setError(null)
    setPicked(null)
    const quick = reduced()
    try {
      const plays: Play[] = pending.map((p) => ({ card: p.card.id, lane: p.lane }))
      const { match: next } = await lockerPost<{ match: MatchView }>('/field-general', { action: 'drive', id: match.id, plays })
      const before = foeShown
      const after = next.foe.totals.map((t) => t.total)
      setMatch(next)
      setPending([])
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

  const coach = error ?? (held ? POSITION_RULE[held.pos] : !calling ? '' : pending.length ? 'Tap a card you placed to take it back.' : 'Pick a card, then a lane.')

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
            const mine = pending.filter((p) => p.lane === i)
            const res = verdict(i)
            return (
              <section key={lane.key} className="pe-fg-lane" data-open={open ? '' : undefined} data-dim={held && !open ? '' : undefined} aria-label={lane.label}>
                <div className="pe-fg-side pe-fg-side--foe">
                  {match.foe.lanes[i].map((c) => {
                    const n = phase === 'turn' ? match.fresh.indexOf(c.id) : -1
                    const s = stat(c)
                    return <LockerCard key={c.id} card={c} cost={s.cost} power={s.power} base={s.base} fresh={n >= 0} index={n} onClick={() => setDetail(c)} />
                  })}
                  <Ghosts used={match.foe.lanes[i].length} />
                </div>

                <div className="pe-fg-los">
                  <LaneNumber value={foeShown[i]} side="foe" lead={foeShown[i] > totals[i]} gain={gains[i]} />
                  <span className="pe-fg-tag" data-res={res}>
                    <LaneMark lane={lane.key} />
                    {res === 'won' ? 'Won' : res === 'lost' ? 'Lost' : res === 'tied' ? 'Tied' : lane.label}
                  </span>
                  <LaneNumber value={totals[i]} side="you" lead={totals[i] > foeShown[i]} />
                </div>

                <div className="pe-fg-side pe-fg-side--you">
                  {match.you.lanes[i].map((c) => {
                    const s = stat(c)
                    return <LockerCard key={c.id} card={c} cost={s.cost} power={s.power} base={s.base} onClick={() => setDetail(c)} />
                  })}
                  {mine.map((p) => {
                    const s = stat(p.card)
                    return (
                      <LockerCard
                        key={p.card.id}
                        card={p.card}
                        cost={s.cost}
                        power={s.power}
                        base={s.base}
                        state="pending"
                        onClick={calling ? () => setPending((list) => list.filter((x) => x.card.id !== p.card.id)) : undefined}
                        label={`Take ${p.card.name} back`}
                      />
                    )
                  })}
                  <Ghosts used={yours[i].length} open={open} gain={gain(i)} />
                </div>
                {open && <button type="button" className="pe-fg-target" onClick={() => place(i as Lane)} aria-label={`Play ${held?.name} on ${lane.label}`} />}
              </section>
            )
          })}
        </div>

        <div className="pe-fg-zone pe-fg-zone--you">
          <b>You</b>
          <span>{match.you.deck} in deck</span>
        </div>

        {banner && (
          <div key={banner.key} className="pe-fg-banner" aria-live="polite">
            <b>{banner.drive === DRIVES ? 'Last Drive' : `Drive ${banner.drive}`}</b>
            <span>{banner.drive} Cap Room</span>
          </div>
        )}
      </div>

      {live && (
        <>
          <div className="pe-fg-coach" aria-live="polite" data-err={error ? '' : undefined}>
            {held && !error && <b>{held.name}</b>}
            <span>{coach}</span>
          </div>
          <div className="pe-fg-tray">
          <div className="pe-fg-hand">
            {hand.map((c, i) => {
              const s = stat(c)
              const t = i - (hand.length - 1) / 2
              return (
                <div key={c.id} className="pe-fg-hold" data-on={c.id === picked ? '' : undefined} style={{ '--t': t, '--d': Math.abs(t) } as React.CSSProperties}>
                  <LockerCard card={c} cost={s.cost} power={s.power} base={s.base} state={s.cost > left ? 'off' : undefined} onClick={calling ? () => pick(c) : undefined} />
                </div>
              )
            })}
            {hand.length === 0 && <p className="pe-fg-hand-none">Your hand is empty.</p>}
          </div>
          <div className="pe-fg-act">
            <div className="pe-fg-cap" aria-label={`${left} of ${match.room} cap room left`}>
              <small>Cap Room</small>
              <b>{left}</b>
              <span className="pe-fg-rooms" aria-hidden>
                {Array.from({ length: DRIVES }, (_, i) => (
                  <i key={i} data-state={i < left ? 'left' : i < match.room ? 'spent' : undefined} />
                ))}
              </span>
            </div>
            <button type="button" className="pe-btn pe-fg-go" disabled={!calling} onClick={run}>
              {phase === 'snap' ? 'Snap' : phase === 'turn' ? 'Turning Over' : pending.length ? 'Run The Play' : 'Pass The Drive'}
            </button>
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
