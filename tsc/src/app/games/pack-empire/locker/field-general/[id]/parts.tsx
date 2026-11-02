'use client'

// The pieces of the table that only draw: nothing here decides anything.

import { callOf } from '@/lib/packEmpire/locker/calls'
import { DRIVES, FORMATIONS, LANES, LANE_MAX, stackPower, type Lane } from '@/lib/packEmpire/locker/fieldGeneral'
import type { LogLine, SeatView } from '@/lib/packEmpire/locker/fieldGeneralMatch'
import type { LockerEvent } from '@/lib/packEmpire/locker/rules'
import type { Player } from '@/lib/packEmpire/rules'
import { useCountUp } from '../../../stage'

/** The three lanes as routes: a run up the middle, a quick out and a go. */
const LANE_MARK: Record<(typeof LANES)[number]['key'], React.ReactNode> = {
  ground: (
    <>
      <path d="M7 21c3-3 5-6 5-10 0-2 .5-3.500 1.500-5" />
      <path d="M10.500 8.500 14 5l3 3.800" />
    </>
  ),
  short: (
    <>
      <path d="M6 21v-8.500c0-1 .8-1.500 1.600-1.500H18" />
      <path d="m14.500 7.500 3.800 3.500-3.800 3.500" />
    </>
  ),
  deep: (
    <>
      <path d="M12 22V4" />
      <path d="m8 7.500 4-4 4 4" />
      <path d="M7 14h10" strokeDasharray="1.500 2.500" />
    </>
  ),
}

export function LaneMark({ lane }: { lane: (typeof LANES)[number]['key'] }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {LANE_MARK[lane]}
    </svg>
  )
}

/** A football, for the marker on a lane and the crowns in the score bug. */
export function Ball({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 28 18" aria-hidden>
      <path d="M1 9C6 1.500 22 1.500 27 9c-5 7.500-21 7.500-26 0Z" fill="currentColor" />
      <path d="M9 9h10M11.500 7.200v3.600M14 7.200v3.600M16.500 7.200v3.600" fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="1.100" strokeLinecap="round" />
    </svg>
  )
}

/** The empty places on a side. The one a card would go in shows what he'd add. */
export function Ghosts({ used, open = false, gain = '', sub }: { used: number; open?: boolean; gain?: string; sub?: string }) {
  return Array.from({ length: LANE_MAX - used }, (_, n) => (
    <span key={n} className="fg-slot" data-next={open && n === 0 ? '' : undefined}>
      {open && n === 0 && (
        <>
          <b>{gain}</b>
          {sub && <small>{sub}</small>}
        </>
      )}
    </span>
  ))
}

/** A man on the table, and whoever's stacked behind him: all a stacked man adds is a
    number, so a tag on the card says it without taking up a slot. */
export function Backed({ man, event, onTap, children }: { man?: Player; event: LockerEvent | null; onTap?: () => void; children: React.ReactNode }) {
  return (
    <span className="fg-host">
      {children}
      {man && (
        <button type="button" className="fg-stack" data-r={man.rarity} onClick={onTap} aria-label={`${man.name} stacked, adds ${stackPower(man, event)}`}>
          +{stackPower(man, event)}
        </button>
      )}
    </span>
  )
}

/** A lane's number, climbing to wherever it's just landed. On its own so a tick of the
    count never redraws the cards. */
export function LaneNumber({ value, side, lead, gain }: { value: number; side: 'you' | 'foe'; lead: boolean; gain?: { n: number; key: number } | null }) {
  const shown = useCountUp(value, 420)
  return (
    <b className="fg-num" data-side={side} data-lead={lead ? '' : undefined}>
      {shown}
      {gain && gain.n !== 0 && (
        <span key={gain.key} className="fg-pop" data-down={gain.n < 0 ? '' : undefined} aria-hidden>
          {gain.n > 0 ? `+${gain.n}` : gain.n}
        </span>
      )}
    </b>
  )
}

/** Three marks for the three lanes, lit for whoever's holding them. */
export function Crowns({ held, side }: { held: number; side: 'you' | 'foe' }) {
  return (
    <span className="fg-crowns" data-side={side} aria-label={`Leading ${held} of 3 lanes`}>
      {[0, 1, 2].map((i) => (
        <Ball key={i} className={i < held ? 'on' : undefined} />
      ))}
    </span>
  )
}

/** Everything left on the field that hasn't paid out yet. */
export function OnField({ you, foe }: { you: SeatView; foe: SeatView }) {
  const rows = [...you.ongoing.map((o) => ({ ...o, mine: true })), ...foe.ongoing.map((o) => ({ ...o, mine: false }))]
  if (rows.length === 0) return <p className="fg-none">Calls marked Stays land here and tally at the end of the game.</p>
  return (
    <ul className="fg-onfield">
      {rows.map((r, i) => {
        const call = callOf(r.call)
        return (
          <li key={`${r.call}${i}`} data-mine={r.mine ? '' : undefined}>
            <span>
              <b>{call?.title}</b>
              <small>
                {r.mine ? 'You' : foe.name} · {r.own === r.mine ? 'Your' : `${foe.name}'s`} {LANES[r.lane].label}
              </small>
            </span>
            <em data-down={r.delta < 0 ? '' : undefined}>{call?.does.kind === 'stand' ? 'Stand' : r.delta > 0 ? `+${r.delta}` : r.delta}</em>
          </li>
        )
      })}
    </ul>
  )
}

/** Every formation, lit for whoever's got it on. */
export function Formations({ mine, theirs }: { mine: string[]; theirs: string[] }) {
  return (
    <ul className="fg-forms">
      {FORMATIONS.map((f) => {
        const on = mine.includes(f.id)
        return (
          <li key={f.id} data-on={on ? '' : undefined} data-foe={theirs.includes(f.id) ? '' : undefined}>
            <span>
              <b>{f.title}</b>
              <small>{f.line}</small>
            </span>
            <em>
              +{f.n} {LANES[f.lane].label}
            </em>
          </li>
        )
      })}
    </ul>
  )
}

export function PlayLog({ log }: { log: LogLine[] }) {
  if (log.length === 0) return <p className="fg-none">Every drive lands here once it flips.</p>
  return (
    <ol className="fg-log">
      {log.map((l, i) => (
        <li key={i} data-who={l.who}>
          <small>D{l.drive}</small>
          <span>{l.text}</span>
        </li>
      ))}
    </ol>
  )
}

export type GuideStep = { title: string; line: string; done?: boolean; off?: boolean }

/** What you can do on a drive, reading the table as it stands. */
export function TurnGuide({ steps }: { steps: GuideStep[] }) {
  return (
    <ol className="fg-guide">
      {steps.map((s, i) => (
        <li key={s.title} data-done={s.done ? '' : undefined} data-off={s.off ? '' : undefined}>
          <i>{s.done ? '✓' : i + 1}</i>
          <span>
            <b>{s.title}</b>
            <small>{s.line}</small>
          </span>
        </li>
      ))}
    </ol>
  )
}

export const LANE_IDS: Lane[] = [0, 1, 2]
export const DRIVE_DOTS = Array.from({ length: DRIVES }, (_, i) => i)
