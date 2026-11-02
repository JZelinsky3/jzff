'use client'

// A family of packs, one at a time: swipe to the one you want, or use the arrows or the
// arrow keys. It's plain scroll-snap, so a phone gets its own momentum, and the pack in
// the middle is worked out from where the track came to rest. Portalled to <main> so
// the tokens reach it and no section can sit over it.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LOCKER_PACKS, packPrice, shelfKind, type ShelfItem } from '@/lib/packEmpire/locker/rules'
import { PackOdds } from '../PackOdds'

export function PackCarousel({ item, faab, busy, onBuy, onClose }: { item: ShelfItem; faab: number; busy: boolean; onBuy: (kind: string) => void; onClose: () => void }) {
  const picks = item.pick ?? []
  const [at, setAt] = useState(0)
  const [boosted, setBoosted] = useState(false)
  const track = useRef<HTMLDivElement>(null)
  const frame = useRef(0)
  const [host, setHost] = useState<Element | null>(null)
  const anchor = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    setHost(anchor.current?.closest('main') ?? document.body)
  }, [])

  const go = (n: number) => {
    const next = Math.max(0, Math.min(picks.length - 1, n))
    const slide = track.current?.children[next] as HTMLElement | undefined
    slide?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', inline: 'center', block: 'nearest' })
  }

  const settle = () => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const box = track.current
      if (!box) return
      const middle = box.scrollLeft + box.clientWidth / 2
      let best = 0
      let gap = Infinity
      ;[...box.children].forEach((el, i) => {
        const slide = el as HTMLElement
        const d = Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - middle)
        if (d < gap) {
          gap = d
          best = i
        }
      })
      setAt(best)
    })
  }

  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') go(at + 1)
      if (e.key === 'ArrowLeft') go(at - 1)
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  })

  const kind = shelfKind(picks[at]?.id ?? null, boosted)
  const pack = LOCKER_PACKS[kind]
  const price = packPrice(kind) ?? 0

  const sheet = (
    <div className="pe-car" role="dialog" aria-modal="true" aria-label={item.label} data-boost={boosted ? '' : undefined} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pe-car-in">
        <header className="pe-car-head">
          <div>
            <div className="pe-kicker">★ {item.label} ★</div>
            <h2>{pack.label.replace('Boosted ', '')}</h2>
          </div>
          <button type="button" className="pe-car-x" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="m2 2 10 10M12 2 2 12" />
            </svg>
          </button>
        </header>

        <div className="pe-car-stage">
          <button type="button" className="pe-car-arrow" data-at="prev" disabled={at === 0} onClick={() => go(at - 1)} aria-label="Previous pack">
            <svg viewBox="0 0 8 14" width="9" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="7 1 1 7 7 13" />
            </svg>
          </button>
          <div ref={track} className="pe-car-track" onScroll={settle}>
            {picks.map((p, i) => (
              <button key={p.id} type="button" className="pe-car-slide" data-on={i === at ? '' : undefined} onClick={() => go(i)} aria-label={p.label} aria-current={i === at}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={LOCKER_PACKS[shelfKind(p.id, boosted)].art} alt="" draggable={false} />
                <span>{p.label}</span>
              </button>
            ))}
          </div>
          <button type="button" className="pe-car-arrow" data-at="next" disabled={at === picks.length - 1} onClick={() => go(at + 1)} aria-label="Next pack">
            <svg viewBox="0 0 8 14" width="9" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="1 1 7 7 1 13" />
            </svg>
          </button>
        </div>

        <div className="pe-car-dots" aria-hidden>
          {picks.map((p, i) => (
            <i key={p.id} data-on={i === at ? '' : undefined} />
          ))}
        </div>

        <p className="pe-car-line">{pack.line}</p>

        <div className="pe-car-foot">
          <div className="pe-shop-tier" role="group" aria-label="Odds">
            <button type="button" aria-pressed={!boosted} onClick={() => setBoosted(false)}>
              Standard
            </button>
            <button type="button" aria-pressed={boosted} onClick={() => setBoosted(true)}>
              Boosted
            </button>
          </div>
          <PackOdds pack={pack} />
          <button type="button" className="pe-btn pe-car-buy" disabled={busy || price > faab} onClick={() => onBuy(kind)}>
            {price > faab ? `Need $${price}` : `Buy $${price}`}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <span ref={anchor} hidden />
      {host && createPortal(sheet, host)}
    </>
  )
}
