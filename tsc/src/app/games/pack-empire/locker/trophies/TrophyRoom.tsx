'use client'

// Every case and what's in it. A trophy shows how far along you are and what it pays,
// and the card at the end of a case is on show the whole time, since it's the reason to
// finish it. Nothing lands until you claim it, so a reward is something you get to take.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LOCKER_PACKS, lockerCost, lockerPower } from '@/lib/packEmpire/locker/rules'
import { TROPHY_CASES, caseDone, trophyDone, trophyProgress, type TrophyReward, type TrophyStats } from '@/lib/packEmpire/locker/trophies'
import type { Player } from '@/lib/packEmpire/rules'
import { lockerPost } from '../api'
import { CardSheet } from '../CardSheet'
import { LockerCard } from '../LockerCard'

const rewardLabel = (r: TrophyReward, cards: Record<string, Player>) => {
  if (r.kind === 'faab') return `$${r.n} FAAB`
  if (r.kind === 'pack') return LOCKER_PACKS[r.pack]?.label ?? 'A Pack'
  return Object.values(cards).find((c) => c.id === r.id)?.name ?? 'A Card'
}

const landed = (r: TrophyReward, cards: Record<string, Player>) => {
  if (r.kind === 'faab') return `$${r.n} FAAB added.`
  if (r.kind === 'pack') return `${LOCKER_PACKS[r.pack]?.label ?? 'A pack'} is waiting in your Locker.`
  return `${rewardLabel(r, cards)} is in your collection.`
}

export function TrophyRoom({ stats, claimed, cards }: { stats: TrophyStats; claimed: string[]; cards: Record<string, Player> }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [open, setOpen] = useState<Player | null>(null)
  const held = new Set(claimed)

  const claim = async (id: string) => {
    if (busy) return
    setBusy(id)
    setNote(null)
    try {
      const { reward } = await lockerPost<{ reward: TrophyReward }>('', { action: 'claim', id })
      setNote(landed(reward, cards))
      router.refresh()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That did not go through.')
    }
    setBusy(null)
  }

  return (
    <>
      {note && (
        <p className="pe-tr-note" role="status">
          {note}
        </p>
      )}
      {TROPHY_CASES.map((c, n) => {
        const done = c.trophies.filter((t) => trophyDone(t, stats)).length
        const whole = caseDone(c, stats)
        const card = cards[c.id]
        const owned = held.has(c.id)
        return (
          <section key={c.id} className={`pe-sec${n === 0 ? ' pe-lk-first' : ''}`}>
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ {String(n + 1).padStart(2, '0')} · Case</span>
              <span className="pe-sec-title">{c.title}</span>
              <span className="pe-sec-meta">
                {done} Of {c.trophies.length}
              </span>
            </div>
            <div className="pe-tr-case">
              <aside className="pe-tr-prize" data-won={owned ? '' : undefined}>
                {card && <LockerCard card={card} cost={lockerCost(card)} power={lockerPower(card)} onClick={() => setOpen(card)} label={`${card.name}, ${card.year}`} />}
                <div className="pe-tr-prize-text">
                  <b>{card?.name}</b>
                  <span>{owned ? 'In your collection.' : `${card?.year} season. Not in any pack: finish this case to own it.`}</span>
                  {whole && !owned && (
                    <button type="button" className="pe-btn pe-btn--sm" disabled={!!busy} onClick={() => claim(c.id)}>
                      Claim The Card
                    </button>
                  )}
                </div>
              </aside>
              <div className="pe-tr-list">
                <p className="pe-lk-none">{c.line}</p>
                {c.trophies.map((t) => {
                  const ready = trophyDone(t, stats)
                  const got = held.has(t.id)
                  return (
                    <div key={t.id} className="pe-tr-row" data-state={got ? 'got' : ready ? 'ready' : undefined}>
                      <i className="pe-tr-mark" aria-hidden>
                        {got ? '✓' : '★'}
                      </i>
                      <div className="pe-tr-body">
                        <b>{t.title}</b>
                        <span>{t.line}</span>
                        {t.need > 1 && !ready && (
                          <span className="pe-tr-bar" aria-label={`${trophyProgress(t, stats)} of ${t.need}`}>
                            <i style={{ transform: `scaleX(${trophyProgress(t, stats) / t.need})` }} />
                            <small>
                              {trophyProgress(t, stats).toLocaleString()} / {t.need.toLocaleString()}
                            </small>
                          </span>
                        )}
                      </div>
                      <div className="pe-tr-pay">
                        {ready && !got ? (
                          <button type="button" className="pe-btn pe-btn--sm" disabled={!!busy} onClick={() => claim(t.id)}>
                            Claim
                          </button>
                        ) : (
                          <small>{rewardLabel(t.reward, cards)}</small>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )
      })}
      {open && <CardSheet card={open} event={null} onClose={() => setOpen(null)} />}
    </>
  )
}
