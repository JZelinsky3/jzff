'use client'

// The offseason, season two on (Joey, 2026-11-07): keep up to three points of
// last season's eleven (an Immortal three, a Transcendent two, anyone else one),
// no man kept more than two seasons running. A kept man holds his spot through
// Draft Day; every other spot is a fresh pack, and the finish bought one of them
// a Standings Pack. Tap a card to lock him in.

import { useState } from 'react'
import { FORMATION, SLOTS, type Player } from '@/lib/packEmpire/rules'
import { KEEPER_BUDGET, KEEP_YEARS, keeperCost } from '@/lib/packEmpire/seasonRules'
import type { MySeason } from '@/lib/packEmpire/season'
import { FilledSlot, LeagueMark } from '../../cards'

const ORDINAL = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`

function Lock() {
  return (
    <svg className="pe-kp-lock" viewBox="0 0 24 24" aria-hidden>
      <path d="M7 10.5V8a5 5 0 0 1 10 0v2.5" />
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" />
      <path d="M12 14.5v2.5" />
    </svg>
  )
}

export function Keepers({ me, season, busy, onLock }: { me: MySeason; season: number; busy: boolean; onLock: (ids: string[]) => void }) {
  const o = me.offseason!
  const [picked, setPicked] = useState<string[]>([])
  const spent = picked.reduce((n, id) => n + keeperCost(o.prev.find((p) => p?.id === id)?.rarity ?? 'common'), 0)
  const left = KEEPER_BUDGET - spent

  const toggle = (p: Player) => {
    if (busy) return
    if (picked.includes(p.id)) setPicked(picked.filter((x) => x !== p.id))
    else if ((o.prevKept[p.id] ?? 0) < KEEP_YEARS && keeperCost(p.rarity) <= left) setPicked([...picked, p.id])
  }

  const slot = (i: number) => {
    const p = o.prev[i]
    if (!p) return <div key={i} className="pe-slot-outer" />
    const years = o.prevKept[p.id] ?? 0
    const maxed = years >= KEEP_YEARS
    const on = picked.includes(p.id)
    const cost = keeperCost(p.rarity)
    const blocked = !on && (maxed || cost > left)
    return (
      <div key={i} className={`pe-slot-outer${i === 1 ? ' hb-back' : ''}`}>
        <button
          type="button"
          className="pe-kp-card"
          data-state={on ? 'kept' : maxed ? 'maxed' : blocked ? 'dim' : undefined}
          onClick={() => toggle(p)}
          disabled={busy || (blocked && !on)}
          aria-pressed={on}
          aria-label={`${on ? 'Keeping' : 'Keep'} ${p.name}, ${cost} ${cost === 1 ? 'point' : 'points'}`}
        >
          <FilledSlot player={p} />
          {on && (
            <span className="pe-kp-seal" aria-hidden>
              <Lock />
              <b>Keeper</b>
            </span>
          )}
          {maxed && <span className="pe-kp-gone">Kept {KEEP_YEARS} seasons</span>}
        </button>
        <span className="pe-kp-cost" aria-hidden>
          {Array.from({ length: cost }, (_, k) => (
            <i key={k} data-on={on ? 'true' : undefined} />
          ))}
          <small>{SLOTS[i].short}{years ? ` · kept ${years}` : ''}</small>
        </span>
      </div>
    )
  }

  return (
    <div className="pe-table">
      <section className="pe-kp-head">
        <div className="pe-kicker">Season {season} · The Offseason</div>
        <h2>Keepers.</h2>
        <p>
          You finished <b>{ORDINAL(o.finish)}</b> of {o.teams}. That bought a{' '}
          <span className="pe-kp-pack" style={{ '--mk': me.special.color } as React.CSSProperties}>
            <LeagueMark color={me.special.color} label={me.special.label} inline /> {me.special.label}
          </span>{' '}
          for Draft Day: the worse the finish, the better the pack.
        </p>
        <p className="pe-kp-rule">
          Keep up to {KEEPER_BUDGET} points of last season&apos;s eleven: an Immortal costs 3, a Transcendent 2, anyone else 1. A keeper holds his spot through Draft Day. Nobody can be kept more than {KEEP_YEARS}{' '}
          seasons running.
        </p>
        <div className="pe-kp-budget" aria-label={`${spent} of ${KEEPER_BUDGET} keeper points used`}>
          {Array.from({ length: KEEPER_BUDGET }, (_, k) => (
            <i key={k} data-on={k < spent ? 'true' : undefined} />
          ))}
          <span>
            {spent} of {KEEPER_BUDGET} points
          </span>
        </div>
      </section>

      <div className="pe-turf pe-kp-turf">
        <div className="pe-field">
          <div className="pe-form-row">{FORMATION.line.map(slot)}</div>
          <div className="pe-skill-spread">
            <div className="pe-skill-side">{FORMATION.wrLeft.map(slot)}</div>
            <div className="pe-skill-side">{FORMATION.wrRight.map(slot)}</div>
          </div>
          <div className="pe-form-row">{FORMATION.backfield.map(slot)}</div>
        </div>
      </div>

      <div className="pe-kp-go">
        <button type="button" className="pe-push" disabled={busy} onClick={() => onLock(picked)}>
          {busy ? 'Locking In' : picked.length ? `Lock In ${picked.length} ${picked.length === 1 ? 'Keeper' : 'Keepers'}` : 'Start Fresh, No Keepers'}
        </button>
      </div>
    </div>
  )
}
