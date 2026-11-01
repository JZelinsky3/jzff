'use client'

// Where a game of Field General starts: your deck, and which game you want.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { lockerCost, lockerPower, type LockerEvent, type LockerGameDef } from '@/lib/packEmpire/locker/rules'
import { RARITIES, type Player } from '@/lib/packEmpire/rules'
import { lockerPost } from '../api'
import { LockerCard } from '../LockerCard'
import { FG_RULES } from './rulesCopy'

export function Lobby({ deck, event, rule, live }: { deck: Player[]; event: LockerEvent; rule: LockerGameDef['deck']; live: string | null }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cost = deck.reduce((sum, c) => sum + lockerCost(c), 0)

  const play = async (mode: 'standard' | 'event') => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const { id } = await lockerPost<{ id: string }>('/field-general', { action: 'start', mode })
      router.push(`/games/pack-empire/locker/field-general/${id}/`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That game did not start.')
      setBusy(false)
    }
  }

  if (deck.length === 0) {
    return (
      <div className="pe-lk-signin">
        <p>You need {rule.size} cards to field a deck. Your Starter Pack has enough.</p>
        <Link href="/games/pack-empire/locker/" className="pe-btn">
          Open Your Starter Pack
        </Link>
      </div>
    )
  }

  const shown = [...deck].sort((a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || b.score - a.score)

  return (
    <>
      <div className="pe-fg-start">
        {live ? (
          <Link href={`/games/pack-empire/locker/field-general/${live}/`} className="pe-fg-mode" style={{ '--mode': '#e8a84b' } as React.CSSProperties}>
            <span>
              <span className="pe-fg-mode-kick">In Progress</span>
              <span className="pe-fg-mode-name">Back To Your Game</span>
            </span>
            <span className="pe-btn pe-btn--sm">Play</span>
          </Link>
        ) : (
          <>
            <button type="button" className="pe-fg-mode" style={{ '--mode': '#e8a84b' } as React.CSSProperties} disabled={busy} onClick={() => play('standard')}>
              <span>
                <span className="pe-fg-mode-kick">Exhibition</span>
                <span className="pe-fg-mode-name">Play The CPU</span>
                <span className="pe-fg-mode-line">Your deck against one built to match it.</span>
              </span>
              <span className="pe-btn pe-btn--sm">Play</span>
            </button>
            <button type="button" className="pe-fg-mode" style={{ '--mode': '#4fc3b0' } as React.CSSProperties} disabled={busy} onClick={() => play('event')}>
              <span>
                <span className="pe-fg-mode-kick">Today&apos;s Event</span>
                <span className="pe-fg-mode-name">{event.title}</span>
                <span className="pe-fg-mode-line">{event.line}</span>
              </span>
              <span className="pe-btn pe-btn--sm pe-btn--ghost">Play</span>
            </button>
          </>
        )}
      </div>
      {error && <p className="pe-fg-error">{error}</p>}

      <section className="pe-sec">
        <div className="pe-sec-head">
          <span className="pe-sec-num">Your Deck</span>
          <span className="pe-sec-title">
            {cost} of {rule.cap} Cap
          </span>
          <Link href="/games/pack-empire/locker/field-general/deck/" className="pe-sec-meta pe-link">
            Edit
          </Link>
        </div>
        <div className="pe-lk-grid">
          {shown.map((c) => (
            <LockerCard key={c.id} card={c} cost={lockerCost(c)} power={lockerPower(c)} />
          ))}
        </div>
      </section>

      <section className="pe-sec">
        <div className="pe-sec-head">
          <span className="pe-sec-num">How It Works</span>
          <span className="pe-sec-title">Two Lanes Of Three</span>
        </div>
        <ul className="pe-fg-how">
          {FG_RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>
    </>
  )
}
