'use client'

// The final reveal. A blind run has been waiting eleven packs to find out what it
// is, so this is the payoff, and it plays like one: the cards turn over from the
// smallest up, the number climbs the ladder as they do, anything big and the last
// card of all get the middle of the screen, chemistry draws itself across the
// formation, and the rung it stops on lands last.
//
// Under Show My Pick the cards are already up, so the show starts at the chemistry.
//
// Everything that moves here is transform and opacity, and the running number
// lives in its own component so a tick of the count never redraws the field.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RARITY_LOOK, TIERS, lineupScore, tierFor, type Chemistry, type Player, type Rarity } from '@/lib/packEmpire/rules'
import { Field, Ladder, PackCard } from './cards'
import { useFaces } from './faces'
import { ChemLinks, bondSlots, chemByCard, slotCentre } from './report'
import { preloadFaces, useCountUp } from './stage'

/** How long the table waits on each card, by what it turned out to be. */
const PACE: Record<Rarity, number> = {
  common: 420,
  rare: 560,
  dynasty: 820,
  transcendent: 900,
  immortal: 1000,
  canton: 1100,
}

/** These get the middle of the screen. */
const BIG = new Set<Rarity>(['transcendent', 'immortal', 'canton'])

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

type Pop = { key: number; x: number; y: number; text: string; color: string; big?: boolean }

type Show = {
  phase: 'intro' | 'cards' | 'chem' | 'final'
  /** Slots turned over. */
  up: number[]
  /** The slot mid-turn, on its way out or back in. */
  turn: { slot: number; part: 'out' | 'in' } | null
  /** The card in the middle of the screen. */
  hero: { card: Player; faceUp: boolean; big: boolean; last: boolean; line: string | null } | null
  total: number
  links: number
  pop: Pop | null
}

/** The number, the rung it's on, and the ladder beside it. */
function Climb({ total, final, even }: { total: number; final: boolean; even: boolean }) {
  const shown = useCountUp(total, 460)
  const tier = tierFor(shown)
  const next = [...TIERS].reverse().find((t) => t.min > shown)
  return (
    <>
      <header className="pe-uv-head" style={{ '--tc': even ? '#f4ebd8' : tier.color } as React.CSSProperties}>
        <div className="pe-uv-num" aria-live="off">
          {shown.toLocaleString()}
        </div>
        {even ? (
          <div className="pe-uv-rung">Your Eleven</div>
        ) : (
          <div key={tier.label} className="pe-uv-rung">
            {tier.label}
          </div>
        )}
        {!even && (
          <div className="pe-uv-next">
            {next ? (
              <>
                <b>{(next.min - shown).toLocaleString()}</b> to {next.label}
              </>
            ) : (
              'Top of the ladder'
            )}
          </div>
        )}
      </header>
      {!even && (
        <aside className="pe-uv-ladder">
          <Ladder score={shown} climb landed={final} />
        </aside>
      )}
    </>
  )
}

function Hero({ hero }: { hero: NonNullable<Show['hero']> }) {
  const look = RARITY_LOOK[hero.card.rarity]
  return (
    <div className={`pe-uv-hero${hero.last ? ' last' : ''}`} style={{ '--wo': look.color } as React.CSSProperties}>
      <div className="pe-uv-hero-top">
        {hero.last && <div className="pe-uv-hero-kick">Last Card</div>}
        {hero.faceUp && !hero.card.blind && <div className="pe-uv-hero-rar">{look.label}</div>}
      </div>
      <PackCard player={hero.card} revealed={hero.faceUp} charging={hero.big && !hero.faceUp} burst={hero.big && hero.faceUp && !hero.card.blind} />
      <div className="pe-uv-hero-line">{hero.card.blind ? hero.line : hero.card.score.toLocaleString()}</div>
    </div>
  )
}

export function Unveil({
  lineup,
  table,
  captain,
  chem,
  score,
  even = false,
  line,
  action = 'See The Report',
  onClose,
}: {
  /** The eleven as they really are, by slot. */
  lineup: Player[]
  /** The eleven as the table held them: masked, unless Show My Pick turned them. */
  table: (Player | null)[]
  captain: number | null
  chem: Chemistry | null
  /** Cards plus chemistry, before any Battles. */
  score: number
  /** An Even Versus: the ladder means nothing there. */
  even?: boolean
  /** Under the score at the end: where it landed. */
  line?: React.ReactNode
  action?: string
  onClose: () => void
}) {
  const uploaded = useFaces()
  const pitch = useRef<HTMLDivElement>(null)
  const run = useRef(0)
  const base = lineupScore(lineup)
  const bonds = useMemo(() => [...(chem?.bonds ?? [])].sort((a, b) => b.points - a.points), [chem])
  const ending: Show = useMemo(
    () => ({ phase: 'final', up: lineup.map((_, i) => i), turn: null, hero: null, total: score, links: bonds.length, pop: null }),
    [lineup, score, bonds]
  )
  const [show, setShow] = useState<Show>(() => ({ phase: 'intro', up: [], turn: null, hero: null, total: 0, links: 0, pop: null }))
  const patch = useCallback((p: Partial<Show>) => setShow((s) => ({ ...s, ...p })), [])

  const skip = useCallback(() => {
    run.current++
    setShow(ending)
  }, [ending])

  useEffect(() => {
    preloadFaces(lineup, uploaded)
    // Only the lineup this show opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const clock = run
    const id = ++clock.current
    const live = () => clock.current === id
    const beat = (ms: number) => new Promise<boolean>((done) => window.setTimeout(() => done(live()), ms))
    let popKey = 0

    const pop = (slot: number, text: string, color: string, big = false) => {
      const box = pitch.current
      const at = box && slotCentre(box, slot)
      if (at) patch({ pop: { key: ++popKey, x: at.x, y: at.y, text, color, big } })
    }

    async function play() {
      if (reducedMotion()) {
        setShow(ending)
        return
      }
      const wasUp = lineup.map((_, i) => i).filter((i) => !table[i]?.blind)
      const hidden = lineup
        .map((p, slot) => ({ p, slot }))
        .filter(({ slot }) => table[slot]?.blind)
        .sort((a, b) => a.p.score - b.p.score)
      const up = [...wasUp]
      let total = wasUp.reduce((sum, i) => sum + lineup[i].score, 0)

      patch({ up: [...up] })
      if (!(await beat(hidden.length ? 900 : 500))) return
      patch({ phase: 'cards', total })
      if (!hidden.length && !(await beat(1100))) return

      for (const [n, { p, slot }] of hidden.entries()) {
        const last = n === hidden.length - 1
        const big = BIG.has(p.rarity)
        const look = RARITY_LOOK[p.rarity]

        if (big || last) {
          const masked = table[slot] as Player
          const rung = [...TIERS].reverse().find((t) => t.min > total)
          const needs = last && !even && rung ? `${(rung.min - total).toLocaleString()} to ${rung.label}` : null
          patch({ hero: { card: masked, faceUp: true, big, last, line: needs } })
          if (!(await beat(last ? 1900 : 900))) return
          patch({ hero: { card: masked, faceUp: false, big, last, line: needs } })
          if (!(await beat(big ? 1050 : 480))) return
          patch({ hero: { card: p, faceUp: false, big, last, line: null } })
          if (!(await beat(40))) return
          total += p.score
          up.push(slot)
          patch({ hero: { card: p, faceUp: true, big, last, line: null }, total, up: [...up] })
          if (!(await beat(last ? 2100 : 1500))) return
          patch({ hero: null })
          if (!(await beat(320))) return
          continue
        }

        patch({ turn: { slot, part: 'out' } })
        if (!(await beat(170))) return
        total += p.score
        up.push(slot)
        patch({ turn: { slot, part: 'in' }, up: [...up], total })
        pop(slot, `+${p.score.toLocaleString()}`, look.color)
        if (!(await beat(PACE[p.rarity]))) return
      }
      patch({ turn: null, pop: null })

      if (bonds.length) {
        patch({ phase: 'chem' })
        if (!(await beat(500))) return
        const gap = bonds.length > 7 ? 260 : 460
        for (const [n, b] of bonds.entries()) {
          total += b.points
          patch({ links: n + 1, total })
          const pair = bondSlots(b, lineup)
          const box = pitch.current
          const from = pair && box && slotCentre(box, pair[0])
          const to = pair && box && slotCentre(box, pair[1])
          if (from && to) {
            const text = `${b.points > 0 ? '+' : '−'}${Math.abs(b.points).toLocaleString()}`
            patch({ pop: { key: ++popKey, x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, text, color: b.points > 0 ? '#7be0a2' : '#f08a80' } })
          }
          if (!(await beat(gap))) return
        }
        if (!(await beat(700))) return
      }
      setShow(ending)
    }

    play()
    return () => {
      clock.current++
    }
  }, [lineup, table, bonds, even, ending, patch])

  const net = useMemo(() => chemByCard(chem), [chem])
  const shownBonds = show.links > 0 ? bonds : []
  const field = lineup.map((p, i) => (show.up.includes(i) ? p : (table[i] ?? p)))
  const final = show.phase === 'final'
  const tier = tierFor(score)
  const room = document.querySelector('main.pe-theme') ?? document.body

  return createPortal(
    <div className="pe-uv" data-phase={show.phase} role="dialog" aria-modal="true" aria-label="Your eleven turning over">
      <div className="pe-uv-room" aria-hidden />
      <Climb total={show.total} final={final} even={even} />

      <div className="pe-uv-pitch" ref={pitch}>
        <ChemLinks bonds={shownBonds} lineup={lineup} count={show.links} />
        <Field
          lineup={field}
          view={(i) => ({
            clickable: false,
            captain: i === captain,
            turn: show.turn?.slot === i ? show.turn.part : null,
            chem: show.phase === 'chem' || final ? (net.get(lineup[i].id) ?? null) : null,
          })}
        />
        {show.pop && (
          <span
            key={show.pop.key}
            className="pe-uv-pop"
            style={{ left: show.pop.x, top: show.pop.y, color: show.pop.color }}
            aria-hidden
          >
            {show.pop.text}
          </span>
        )}
      </div>

      <footer className="pe-uv-foot">
        {!final && (
          <button type="button" className="pe-uv-skip" onClick={skip}>
            Skip
          </button>
        )}
      </footer>

      {show.hero && <Hero key={show.hero.card.id} hero={show.hero} />}

      {final && (
        <div className="pe-uv-end" style={{ '--tc': even ? '#e8a84b' : tier.color } as React.CSSProperties}>
          <span className="pe-uv-rays" aria-hidden />
          <span className="pe-uv-ring" aria-hidden />
          <span className="pe-uv-ring two" aria-hidden />
          <div className="pe-uv-end-in">
            <div className="pe-uv-end-tier">{even ? 'Locked In' : tier.label}</div>
            <div className="pe-uv-end-score">{score.toLocaleString()}</div>
            {chem && (
              <div className="pe-uv-end-sum">
                {base.toLocaleString()} in cards, {chem.total >= 0 ? '+' : '−'}
                {Math.abs(chem.total).toLocaleString()} chemistry
              </div>
            )}
            {line && <div className="pe-uv-end-line">{line}</div>}
            <button type="button" className="pe-btn" onClick={onClose}>
              {action}
            </button>
          </div>
        </div>
      )}
    </div>,
    room
  )
}
