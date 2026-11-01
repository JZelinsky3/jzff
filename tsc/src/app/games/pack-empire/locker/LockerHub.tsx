'use client'

// The Locker's front room: packs waiting, the bonus, today's event, the games.
// Packs open on the same stage as every other pack in the game, so a Canton here
// gets the same doors. The only difference is that all five are yours.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LOCKER_GAMES, LOCKER_PACKS } from '@/lib/packEmpire/locker/rules'
import type { LockerHome, WaitingPack } from '@/lib/packEmpire/locker/store'
import { RARITIES, RARITY_LOOK, type Player } from '@/lib/packEmpire/rules'
import { RarityGem } from '../cards'
import { PackStage, usePackStage } from '../stage'
import { lockerPost } from './api'
import { WinMeter } from './WinMeter'

export function LockerHub({ home }: { home: LockerHome }) {
  const router = useRouter()
  const { stage, open, tear, rip, reveal, revealAll, skip, dismiss } = usePackStage()
  const [opening, setOpening] = useState<WaitingPack | null>(null)
  const def = opening ? LOCKER_PACKS[opening.kind] : null

  const start = (pack: WaitingPack) => {
    setOpening(pack)
    open(0, async () => (await lockerPost<{ cards: Player[] }>('', { action: 'open', pack: pack.id })).cards)
  }

  const done = () => {
    dismiss()
    setOpening(null)
    router.refresh()
  }

  const [first, ...rest] = (def?.label ?? '').split(' ')

  return (
    <>
      <section className="pe-sec pe-lk-first">
        <div className="pe-sec-head">
          <span className="pe-sec-num">§ 01 · Packs</span>
          <span className="pe-sec-title">{home.packs.length ? 'Ready To Open' : 'All Opened'}</span>
        </div>
        {home.packs.length > 0 ? (
          <div className="pe-lk-packs">
            {home.packs.map((p) => {
              const pack = LOCKER_PACKS[p.kind]
              return (
                <button key={p.id} type="button" className="pe-lk-pack" onClick={() => start(p)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pack.art} alt="" draggable={false} />
                  <span className="pe-lk-pack-body">
                    <b>{pack.label}</b>
                    <span>{pack.line}</span>
                    <span className="pe-btn pe-btn--sm">Open</span>
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="pe-lk-none">Your next Daily Pack lands at midnight Eastern.</p>
        )}
        <WinMeter wins={home.wins} need={home.need} bonus={home.bonus} />
      </section>

      <section className="pe-sec">
        <div className="pe-sec-head">
          <span className="pe-sec-num">§ 02 · Today</span>
          <span className="pe-sec-title">{home.event.title}</span>
          <span className="pe-sec-meta">Event</span>
        </div>
        <p className="pe-lk-event">{home.event.line}</p>
      </section>

      <section className="pe-sec">
        <div className="pe-sec-head">
          <span className="pe-sec-num">§ 03 · Games</span>
          <span className="pe-sec-title">Play Your Deck</span>
        </div>
        <div className="pe-lk-games">
          {LOCKER_GAMES.map((g) => (
            <Link key={g.id} href={g.href} className="pe-lk-game">
              <span className="pe-lk-game-name">
                {g.title} <em>{g.titleEm}</em>
              </span>
              <span className="pe-lk-game-line">{g.line}</span>
              <span className="pe-btn pe-btn--sm">Play</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="pe-sec">
        <div className="pe-sec-head">
          <span className="pe-sec-num">§ 04 · Collection</span>
          <span className="pe-sec-title">
            {home.owned} {home.owned === 1 ? 'Card' : 'Cards'}
          </span>
          <Link href="/games/pack-empire/locker/collection/" className="pe-sec-meta pe-link">
            See All
          </Link>
        </div>
        <div className="pe-lk-rarities">
          {[...RARITIES].reverse().map((r) => (
            <span key={r} style={{ color: RARITY_LOOK[r].color }}>
              <RarityGem rarity={r} />
              <b>{home.byRarity[r]}</b>
              {RARITY_LOOK[r].label}
            </span>
          ))}
        </div>
      </section>

      {stage && opening && def && (
        <PackStage
          stage={stage}
          onCard={reveal}
          onRevealAll={revealAll}
          onDismiss={done}
          onTear={tear}
          onRip={rip}
          onSkip={skip}
          own={{ art: def.art, first, rest: rest.join(' '), done: 'Into The Locker', onDone: done }}
        />
      )}
    </>
  )
}
