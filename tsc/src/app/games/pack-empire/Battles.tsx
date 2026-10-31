'use client'

// Even's three Battles on screen: above the table all draft, a line over an
// open pack (which covers the table, right when they matter), and how they
// went on the result. What they are and how they score is lib/packEmpire/battles.

import { BATTLE_BONUS, battlesFrom, type BattleOutcome } from '@/lib/packEmpire/battles'

const BONUS = `+${BATTLE_BONUS.toLocaleString()}`

export function BattleStrip({ ids }: { ids: string[] }) {
  return (
    <section className="pe-battles" aria-label="This game's Battles">
      <div className="pe-battles-head">
        <span className="pe-kicker">The Battles</span>
        <span className="pe-note">
          {BONUS} each<span className="pe-battles-more"> · beat them on it, a tie pays nobody</span>
        </span>
      </div>
      <div className="pe-battles-list">
        {battlesFrom(ids).map((b) => (
          <div key={b.id} className="pe-battle">
            <b>{b.title}</b>
            <span>{b.line}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export function BattleNote({ ids }: { ids: string[] }) {
  return <div className="pe-battle-note">{battlesFrom(ids).map((b) => b.title).join(' · ')}</div>
}

export function BattleResults({ outcome, host, guest }: { outcome: BattleOutcome; host: string; guest: string }) {
  return (
    <section className="pe-battles pe-battles--done">
      <div className="pe-battles-head">
        <span className="pe-kicker">The Battles</span>
        <span className="pe-note">{BONUS} to the winner of each</span>
      </div>
      <div className="pe-bres">
        <div className="pe-bres-names">
          <span>{host}</span>
          <span>{guest}</span>
        </div>
        {outcome.lines.map((l) => (
          <div key={l.id} className="pe-bres-row">
            <b className="pe-bres-title">{l.title}</b>
            <span className={`pe-bres-val${l.winner === 'host' ? ' won' : ''}`}>{l.host}</span>
            <span className={`pe-bres-val${l.winner === 'guest' ? ' won' : ''}`}>{l.guest}</span>
            {l.winner === null && <em className="pe-bres-tie">Tied, nobody paid</em>}
          </div>
        ))}
        <div className="pe-bres-row pe-bres-total">
          <b className="pe-bres-title">Battles</b>
          <span className={`pe-bres-val${outcome.host > outcome.guest ? ' won' : ''}`}>+{outcome.host.toLocaleString()}</span>
          <span className={`pe-bres-val${outcome.guest > outcome.host ? ' won' : ''}`}>+{outcome.guest.toLocaleString()}</span>
        </div>
      </div>
    </section>
  )
}
