'use client'

// Where a game of Field General starts: which deck, and who against. Built like the
// front of a game rather than a page of options: the stadium, your deck in hand and
// one button that says go, with everything else a tap from it.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { Challenge } from '@/lib/packEmpire/locker/fieldGeneralMatch'
import { MAX_DECKS, lockerCost, lockerPower, type LockerEvent, type LockerGameDef } from '@/lib/packEmpire/locker/rules'
import type { DeckSummary } from '@/lib/packEmpire/locker/store'
import { RARITIES, type Player } from '@/lib/packEmpire/rules'
import { lockerPost } from '../api'
import { LockerCard } from '../LockerCard'
import { FG_RULES } from './rulesCopy'

const DECK_PAGE = '/games/pack-empire/locker/field-general/deck/'
const MATCH = (id: string) => `/games/pack-empire/locker/field-general/${id}/`

type Friend = { id: string; name: string }

export function Lobby({
  deck,
  decks,
  event,
  rule,
  game,
  live,
  friends,
  challenges,
}: {
  deck: Player[]
  decks: DeckSummary[]
  event: LockerEvent
  rule: LockerGameDef['deck']
  game: string
  live: string | null
  friends: Friend[]
  challenges: Challenge[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const cost = deck.reduce((sum, c) => sum + lockerCost(c), 0)

  // A friend's challenge turns up here while you're on the page.
  useEffect(() => {
    const t = window.setInterval(() => router.refresh(), 12000)
    return () => window.clearInterval(t)
  }, [router])

  const go = async (body: Record<string, unknown>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const { id } = await lockerPost<{ id: string }>('/field-general', body)
      router.push(MATCH(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That game did not start.')
      setBusy(false)
    }
  }

  const choose = async (id: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await lockerPost('', { action: 'deck-choose', game, id })
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not go through.')
    }
    setBusy(false)
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
  const active = decks.find((d) => d.active)

  return (
    <>
      <section className="fg-hero">
        <div className="fg-hero-turf" aria-hidden />
        <div className="fg-hero-fan" aria-hidden>
          {shown.slice(0, 5).map((c, i) => (
            <span key={c.id} style={{ '--i': i - 2, '--d': Math.abs(i - 2) } as React.CSSProperties}>
              <LockerCard card={c} cost={lockerCost(c)} power={lockerPower(c)} />
            </span>
          ))}
        </div>
        <div className="fg-hero-copy">
          <div className="fg-hero-kick">{active?.name ?? 'Your Best Cards'}</div>
          <div className="fg-hero-meta">
            {deck.length} Men · {cost} of {rule.cap} Cap
            {active?.themes.length ? ` · ${active.themes.join(' · ')}` : ''}
          </div>
        </div>
        {live ? (
          <Link href={MATCH(live)} className="pe-btn fg-hero-go">
            Back To Your Game
          </Link>
        ) : (
          <button type="button" className="pe-btn fg-hero-go" disabled={busy} onClick={() => go({ action: 'start', mode: 'standard' })}>
            Play The CPU
          </button>
        )}
      </section>
      {error && <p className="pe-fg-error">{error}</p>}

      {challenges.map((c) => (
        <div key={c.id} className="fg-invite">
          <span>
            <b>{c.from}</b> challenged you
          </span>
          <button type="button" className="pe-btn pe-btn--sm" disabled={busy || !!live} onClick={() => go({ action: 'join', id: c.id })}>
            Accept
          </button>
        </div>
      ))}

      {!live && (
        <div className="pe-fg-start">
          <div className="pe-fg-mode" style={{ '--mode': '#7be0a2' } as React.CSSProperties}>
            <span>
              <span className="pe-fg-mode-kick">Head To Head</span>
              <span className="pe-fg-mode-name">Play A Friend</span>
              <span className="pe-fg-mode-line">Live, a 75-second clock on every drive.</span>
            </span>
            {picking ? (
              <span className="fg-friends">
                {friends.map((f) => (
                  <button key={f.id} type="button" className="pe-btn pe-btn--sm pe-btn--ghost" disabled={busy} onClick={() => go({ action: 'challenge', friend: f.id })}>
                    {f.name}
                  </button>
                ))}
                <button type="button" className="pe-btn pe-btn--sm" disabled={busy} onClick={() => go({ action: 'challenge' })}>
                  Open A Link
                </button>
              </span>
            ) : (
              <button type="button" className="pe-btn pe-btn--sm" disabled={busy} onClick={() => setPicking(true)}>
                Challenge
              </button>
            )}
          </div>
          <button type="button" className="pe-fg-mode" style={{ '--mode': '#4fc3b0' } as React.CSSProperties} disabled={busy} onClick={() => go({ action: 'start', mode: 'event' })}>
            <span>
              <span className="pe-fg-mode-kick">This Week&apos;s Event</span>
              <span className="pe-fg-mode-name">{event.title}</span>
              <span className="pe-fg-mode-line">{event.line}</span>
            </span>
            <span className="pe-btn pe-btn--sm pe-btn--ghost">Play</span>
          </button>
        </div>
      )}

      <section className="pe-sec">
        <div className="pe-sec-head">
          <span className="pe-sec-num">Your Decks</span>
          <span className="pe-sec-title">{decks.length ? `${decks.length} Saved` : 'None Saved'}</span>
          {decks.length < MAX_DECKS && (
            <Link href={`${DECK_PAGE}?deck=new`} className="pe-sec-meta pe-link">
              New Deck
            </Link>
          )}
        </div>
        {decks.length > 0 ? (
          <div className="pe-fg-decks">
            {decks.map((d) => (
              <div key={d.id} className="pe-fg-deck" data-on={d.active ? '' : undefined}>
                <button type="button" className="pe-fg-deck-pick" disabled={busy || d.active} onClick={() => choose(d.id)} aria-pressed={d.active}>
                  <b>{d.name}</b>
                  <span>
                    {d.cost} of {rule.cap} Cap
                    {d.themes.length > 0 && ` · ${d.themes.join(' · ')}`}
                  </span>
                </button>
                <Link href={`${DECK_PAGE}?deck=${d.id}`} className="pe-btn pe-btn--ghost pe-btn--sm">
                  Edit
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <Link href={DECK_PAGE} className="pe-btn pe-btn--ghost pe-btn--sm">
            Edit Your Deck
          </Link>
        )}
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
