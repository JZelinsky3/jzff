'use client'

// What FAAB buys, and the one way to raise it that isn't winning: selling spares. The
// first copy of a card is never on offer, so nothing here can break a deck.
//
// A family of packs is one card with a picker on it, so the shelf stays four packs
// long however many divisions there are, and Boosted is a switch on any of them.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FAAB_WIN, LOCKER_PACKS, SHOP_SHELF, packPrice, shelfKind, type ShelfItem } from '@/lib/packEmpire/locker/rules'
import type { Spares } from '@/lib/packEmpire/locker/store'
import { RARITY_LOOK } from '@/lib/packEmpire/rules'
import { lockerPost } from '../api'
import { PackOdds } from '../PackOdds'

function ShelfCard({ item, faab, busy, onBuy }: { item: ShelfItem; faab: number; busy: boolean; onBuy: (kind: string) => void }) {
  const [pick, setPick] = useState(item.pick?.[0]?.id ?? null)
  const [boosted, setBoosted] = useState(false)
  const kind = shelfKind(pick, boosted)
  const pack = LOCKER_PACKS[kind]
  const price = packPrice(kind) ?? 0
  return (
    <div className="pe-shop-pack" data-boost={boosted ? '' : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pack.art} alt="" draggable={false} />
      <div className="pe-shop-pack-body">
        <div className="pe-shop-pack-head">
          <b>{pack.label.replace('Boosted ', '')}</b>
          <PackOdds pack={pack} />
        </div>
        <span>{item.line}</span>
        {item.pick && (
          <label className="pe-shop-pick">
            <span>Pick</span>
            <select value={pick ?? ''} onChange={(e) => setPick(e.target.value)} aria-label={`Which ${item.label}`}>
              {item.pick.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="pe-shop-tier" role="group" aria-label="Odds">
          <button type="button" aria-pressed={!boosted} onClick={() => setBoosted(false)}>
            Standard
          </button>
          <button type="button" aria-pressed={boosted} onClick={() => setBoosted(true)}>
            Boosted
          </button>
        </div>
        <button type="button" className="pe-btn pe-btn--sm" disabled={busy || price > faab} onClick={() => onBuy(kind)}>
          Buy ${price}
        </button>
      </div>
    </div>
  )
}

export function Shop({ faab, spares }: { faab: number; spares: Spares }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const act = async (body: Record<string, unknown>, then: () => void) => {
    if (busy) return
    setBusy(true)
    setNote(null)
    try {
      await lockerPost('', body)
      then()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That did not go through.')
    }
    setBusy(false)
  }

  return (
    <>
      <div className="pe-shop-purse">
        <b>${faab}</b>
        <span>FAAB</span>
      </div>
      {note && <p className="pe-fg-error">{note}</p>}

      <section className="pe-sec pe-lk-first">
        <div className="pe-sec-head">
          <span className="pe-sec-num">§ 01 · Packs</span>
          <span className="pe-sec-title">For Sale</span>
        </div>
        <div className="pe-shop-packs">
          {SHOP_SHELF.map((item) => (
            <ShelfCard key={item.id} item={item} faab={faab} busy={busy} onBuy={(kind) => act({ action: 'buy', kind }, () => { router.push('/games/pack-empire/locker/'); router.refresh() })} />
          ))}
        </div>
      </section>

      <section className="pe-sec">
        <div className="pe-sec-head">
          <span className="pe-sec-num">§ 02 · Spares</span>
          <span className="pe-sec-title">Sell Your Repeats</span>
        </div>
        {spares.length === 0 ? (
          <p className="pe-lk-none">No spares yet. Your last copy of a card is never for sale.</p>
        ) : (
          <div className="pe-shop-spares">
            {spares.map((s) => (
              <div key={s.rarity} className="pe-shop-spare">
                <b style={{ color: RARITY_LOOK[s.rarity].color }}>{RARITY_LOOK[s.rarity].label}</b>
                <span>
                  {s.copies} {s.copies === 1 ? 'spare' : 'spares'}
                </span>
                <button type="button" className="pe-btn pe-btn--sm" disabled={busy} onClick={() => act({ action: 'sell', rarity: s.rarity }, () => router.refresh())}>
                  Sell ${s.worth}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="pe-sec">
        <div className="pe-sec-head">
          <span className="pe-sec-num">§ 03 · FAAB</span>
          <span className="pe-sec-title">How You Earn It</span>
        </div>
        <ul className="pe-fg-how">
          <li>Every win in a Locker game pays ${FAAB_WIN}.</li>
          <li>Sell spare copies here. Your last copy of a card always stays.</li>
          <li>FAAB only buys packs. It can&apos;t be bought or traded.</li>
        </ul>
      </section>
    </>
  )
}
