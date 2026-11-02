'use client'

// What FAAB buys, and the one way to raise it that isn't winning: selling spares. The
// first copy of a card is never on offer, so nothing here can break a deck.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FAAB_WIN, LOCKER_PACKS, packPrice } from '@/lib/packEmpire/locker/rules'
import type { Spares } from '@/lib/packEmpire/locker/store'
import { RARITY_LOOK } from '@/lib/packEmpire/rules'
import { lockerPost } from '../api'

export function Shop({ faab, spares }: { faab: number; spares: Spares }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const forSale = Object.keys(LOCKER_PACKS).flatMap((kind) => {
    const price = packPrice(kind)
    return price == null ? [] : [{ kind, price, ...LOCKER_PACKS[kind] }]
  })

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
          {forSale.map((p) => (
            <div key={p.kind} className="pe-shop-pack">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.art} alt="" />
              <b>{p.label}</b>
              <span>{p.line}</span>
              <button type="button" className="pe-btn pe-btn--sm" disabled={busy || p.price > faab} onClick={() => act({ action: 'buy', kind: p.kind }, () => { router.push('/games/pack-empire/locker/'); router.refresh() })}>
                Buy ${p.price}
              </button>
            </div>
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
