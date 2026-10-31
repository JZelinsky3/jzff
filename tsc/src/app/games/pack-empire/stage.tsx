'use client'

// The stage: one pack, opened.
//
// The original opened a pack into a panel underneath the field and scrolled
// the page down to it, which on a phone meant losing the field every time and
// scrolling back up to open the next one. Here the pack opens OVER the table
// instead: it sits sealed until you rip it, the cards come out face down, you
// flip them, you keep one, and that card flies down into its slot. Every mode
// opens packs through this, so the rip, the flip, the walkout and the landing
// behave the same everywhere.
//
// Opening a pack is a commitment, exactly as it was: there is no close
// button. The pack is dealt server-side and re-deals identically, so leaving
// and coming back finds the same five cards waiting.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  PACK_ART,
  RARITIES,
  RARITY_LOOK,
  SLOTS,
  seasonLabel,
  teamLogo,
  type Player,
  type Rarity,
} from '@/lib/packEmpire/rules'
import type { FaceMap } from '@/lib/packEmpire/faces'
import { Bolt, CaptainMark, PackCard, leanCard } from './cards'
import { useFaces } from './faces'
import { RipBurst, SealedPack, SpentPack } from './rip'

/** The slow reveal on one card: its rarity, then its season and team, then
    what that season did, then the flip shows who. (It used to spell out the
    position, which a position-locked pack has already told you.) */
export type Walkout = { i: number; step: 'charge' | 'team' | 'stat' | 'flip'; id: number }

type Rect = { left: number; top: number; width: number; height: number }

/** The kept card on its way from the stage to its slot. */
export type Flight = { player: Player; from: Rect; to: Rect }

export type StageState = {
  slot: number
  /** Null while the pack is being dealt. */
  cards: Player[] | null
  revealed: boolean[]
  pickedId: string | null
  error: string | null
  leaving: boolean
  /** False until the pack has been ripped open. */
  torn: boolean
  /** Back on the stage after a refresh: it was ripped on another page load,
      so there is no wrapper here to fall away. */
  restored?: boolean
  walkout: Walkout | null
  /** Big cards waiting for their walkout after a Reveal All. */
  queue: number[]
  flight: Flight | null
}

/** A slot whose new card is in the air (hidden) or has just landed (pops). */
export type Landing = { slot: number; phase: 'incoming' | 'landed' }

/** Rarities that get the slow reveal rather than a plain flip. */
const BIG = new Set<Rarity>(['transcendent', 'immortal'])

const STEP_MS: Record<Walkout['step'], number> = { charge: 750, team: 850, stat: 1100, flip: 1200 }

/** How long the Immortal Pull banner holds the cards back. */
const PULL_MS = 2300
const NEXT_STEP = { charge: 'team', team: 'stat', stat: 'flip' } as const

/** How long the picked card hangs, lifted, before it flies. */
const HOLD_MS = 200
const FLIGHT_MS = 420
const LANDED_MS = 750

/** The light in a pack whose cards are hidden. One colour for every blind
    pack, whatever's in it: a rarity's colour here would be a tell, and the
    common's brown read as one even when it wasn't. */
const BLIND_GLOW = '#fff8ea'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** A pack already open before a refresh (League Mode): back on the stage,
    face down, no rip. */
export function restoredStage(slot: number, cards: Player[]): StageState {
  return {
    slot,
    cards,
    revealed: cards.map(() => false),
    pickedId: null,
    error: null,
    leaving: false,
    torn: true,
    restored: true,
    walkout: null,
    queue: [],
    flight: null,
  }
}

// Faces and logos are fetched the moment a pack is dealt so they're in the
// cache when a card turns. They are only ever DRAWN on a card's front, which
// is hidden until the flip passes edge-on, so fetching early can't show one
// early. Held here so a pending fetch isn't dropped with its Image.
const heldFaces: HTMLImageElement[] = []

function preloadFaces(cards: Player[], uploaded: FaceMap) {
  const faces = cards
    .flatMap((c) => [uploaded[c.id] ?? c.img, teamLogo(c)])
    .filter((src): src is string => !!src)
    .map((src) => {
      const im = new Image()
      im.decoding = 'async'
      im.src = src
      im.decode?.().catch(() => {})
      return im
    })
  heldFaces.splice(0, heldFaces.length, ...faces)
}

function rectOf(el: Element | null): Rect | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return null
  // A slot scrolled off screen gets no flight: the card would fly off the edge.
  if (r.bottom < 0 || r.top > window.innerHeight) return null
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

/** `initial` puts a pack that was already open (a League pack left open
    before a refresh) straight back on the stage. */
export function usePackStage(initial: StageState | null = null) {
  const [stage, setStage] = useState<StageState | null>(initial)
  const [landing, setLanding] = useState<Landing | null>(null)
  const busy = useRef(false)
  const timers = useRef<number[]>([])
  const walkoutId = useRef(0)
  const uploaded = useFaces()

  useEffect(() => {
    const t = timers.current
    return () => t.forEach((id) => window.clearTimeout(id))
  }, [])

  useEffect(() => {
    if (initial?.cards) preloadFaces(initial.cards, uploaded)
    // Only the pack the page loaded with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])

  // Nothing behind the stage should scroll while a pack is open.
  const staged = !!stage
  useEffect(() => {
    if (!staged) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [staged])

  const open = useCallback(async (slot: number, deal: () => Promise<Player[]>) => {
    if (busy.current) return
    busy.current = true
    setStage({
      slot,
      cards: null,
      revealed: [],
      pickedId: null,
      error: null,
      leaving: false,
      torn: false,
      walkout: null,
      queue: [],
      flight: null,
    })
    try {
      // No floor on the wait any more: the rip is the pause.
      const cards = await deal()
      preloadFaces(cards, uploaded)
      setStage((s) => (s && s.slot === slot ? { ...s, cards, revealed: cards.map(() => false) } : s))
    } catch (e) {
      setStage((s) => (s ? { ...s, error: e instanceof Error ? e.message : 'The pack would not open.' } : s))
    } finally {
      busy.current = false
    }
  }, [])

  const tear = useCallback(() => {
    setStage((s) => (s && !s.torn ? { ...s, torn: true } : s))
  }, [])

  const flip = useCallback((slot: number, i: number) => {
    setStage((cur) => {
      if (!cur || cur.slot !== slot || cur.revealed[i]) return cur
      const revealed = [...cur.revealed]
      revealed[i] = true
      return { ...cur, revealed }
    })
  }, [])

  /** Put big cards in line for a walkout. `front` jumps the line (the card
      you just tapped). Queued cards hold the pack: nothing can be kept until
      every one of them has been shown. */
  const enqueue = useCallback((slot: number, list: number[], front = false) => {
    setStage((cur) => {
      if (!cur || cur.slot !== slot) return cur
      const add = list.filter((i) => !cur.revealed[i] && cur.walkout?.i !== i)
      if (!add.length) return cur
      const rest = cur.queue.filter((i) => !add.includes(i))
      return { ...cur, queue: front ? [...add, ...rest] : [...rest, ...add] }
    })
  }, [])

  /** Start the next walkout in line, unless one is already running. */
  const runQueue = useCallback((slot: number) => {
    const id = ++walkoutId.current
    setStage((cur) => {
      if (!cur || cur.slot !== slot || cur.walkout) return cur
      const line = cur.queue.filter((i) => !cur.revealed[i])
      if (!line.length) return cur.queue.length ? { ...cur, queue: [] } : cur
      return { ...cur, walkout: { i: line[0], step: 'charge', id }, queue: line.slice(1) }
    })
  }, [])

  /** One step of a walkout forward; off the end, the next in the queue. */
  const advance = useCallback((id: number) => {
    const nextId = ++walkoutId.current
    setStage((cur) => {
      const w = cur?.walkout
      if (!cur || !w || w.id !== id) return cur
      if (w.step !== 'flip') {
        const step = NEXT_STEP[w.step]
        if (step !== 'flip') return { ...cur, walkout: { ...w, step } }
        const revealed = [...cur.revealed]
        revealed[w.i] = true
        return { ...cur, revealed, walkout: { ...w, step } }
      }
      const [next, ...rest] = cur.queue
      if (next != null) return { ...cur, walkout: { i: next, step: 'charge', id: nextId }, queue: rest }
      return { ...cur, walkout: null }
    })
  }, [])

  const walkout = stage?.walkout ?? null
  useEffect(() => {
    if (!walkout) return
    const t = window.setTimeout(() => advance(walkout.id), STEP_MS[walkout.step])
    return () => window.clearTimeout(t)
  }, [walkout, advance])

  /** A tap during a walkout: straight to the flip, or past the hold. */
  const skip = useCallback(() => {
    const w = stage?.walkout
    if (!w) return
    if (w.step === 'flip') {
      advance(w.id)
      return
    }
    setStage((cur) => {
      if (!cur?.walkout || cur.walkout.id !== w.id) return cur
      const revealed = [...cur.revealed]
      revealed[w.i] = true
      return { ...cur, revealed, walkout: { ...cur.walkout, step: 'flip' } }
    })
  }, [stage, advance])

  const reveal = useCallback(
    (i: number) => {
      if (!stage?.cards || stage.revealed[i] || stage.walkout) return
      if (BIG.has(stage.cards[i].rarity)) {
        enqueue(stage.slot, [i], true)
        runQueue(stage.slot)
      } else flip(stage.slot, i)
    },
    [stage, flip, enqueue, runQueue]
  )

  /** The ordinary cards turn in a ripple; the big ones are queued at once
      (so the pack can't be kept out from under them) and get their walkouts
      one after another once the ripple has finished. */
  const revealAll = useCallback(() => {
    if (!stage?.cards || stage.walkout || stage.queue.length) return
    const slot = stage.slot
    const cards = stage.cards
    const plain: number[] = []
    const big: number[] = []
    stage.revealed.forEach((r, i) => {
      if (!r) (BIG.has(cards[i].rarity) ? big : plain).push(i)
    })
    plain.forEach((i, n) => later(() => flip(slot, i), n * 130))
    if (big.length) {
      enqueue(slot, big)
      later(() => runQueue(slot), plain.length ? plain.length * 130 + 650 : 0)
    }
  }, [stage, flip, enqueue, runQueue, later])

  /**
   * Keep card i. `commit` writes the pick wherever this mode keeps it; if it
   * throws (a League pick the server refused), the card goes back on the
   * table with the reason above it instead of quietly vanishing.
   *
   * `slot` is where the card lands, when that isn't the pack's own slot: a
   * Daily's wild pack isn't any position's until you keep something from it.
   *
   * `background` is for a commit that goes over the network and handles its
   * own failure: the card flies straight away instead of hanging in the air
   * waiting on the server.
   *
   * Resolves true once the card has landed in its slot and the commit is done.
   */
  const pick = useCallback(
    async (
      i: number,
      commit: (card: Player) => Promise<void> | void,
      slot?: number,
      background = false
    ): Promise<boolean> => {
      const s = stage
      if (!s || !s.cards || s.pickedId || s.walkout || s.queue.length || busy.current) return false
      const card = s.cards[i]
      const target = slot ?? s.slot
      busy.current = true
      setStage({ ...s, pickedId: card.id, error: null })
      // The slot fills the moment the pick commits; it stays hidden until the
      // card flying down to it arrives.
      setLanding({ slot: target, phase: 'incoming' })
      try {
        const saving = Promise.resolve(commit(card))
        await (background ? wait(HOLD_MS) : Promise.all([saving, wait(HOLD_MS)]))
        const from = rectOf(document.querySelector(`.pe-stage-cards [data-pe-card="${CSS.escape(card.id)}"]`))
        const to = rectOf(document.querySelector(`[data-pe-slot="${target}"] .pe-fsl`))
        if (from && to && !reducedMotion()) {
          setStage((cur) => (cur ? { ...cur, leaving: true, flight: { player: card, from, to } } : cur))
          await wait(FLIGHT_MS)
        } else {
          setStage((cur) => (cur ? { ...cur, leaving: true } : cur))
          await wait(280)
        }
        setStage(null)
        setLanding({ slot: target, phase: 'landed' })
        later(() => setLanding((l) => (l && l.slot === target && l.phase === 'landed' ? null : l)), LANDED_MS)
        await saving
        return true
      } catch (e) {
        setLanding(null)
        setStage((cur) =>
          cur ? { ...cur, pickedId: null, error: e instanceof Error ? e.message : 'That pick did not save.' } : cur
        )
        return false
      } finally {
        busy.current = false
      }
    },
    [stage, later]
  )

  const dismiss = useCallback(() => setStage(null), [])

  /** The lineup as the table should show it: a card still in the air hasn't
      reached its slot, so it isn't in the score yet either. */
  const settle = useCallback(
    <T,>(lineup: (T | null)[]): (T | null)[] => {
      if (landing?.phase !== 'incoming' || !lineup[landing.slot]) return lineup
      const out = [...lineup]
      out[landing.slot] = null
      return out
    },
    [landing]
  )

  return { stage, landing, open, tear, reveal, revealAll, skip, pick, dismiss, settle }
}

/** Over the stage: 'Captain pack' (with the patch), a League boost. */
export type PackTag = { text: string; color?: string; captain?: boolean } | null

function bestRarity(cards: Player[]): Rarity {
  let best = 0
  for (const c of cards) best = Math.max(best, RARITIES.indexOf(c.rarity))
  return RARITIES[best]
}

/** The kept card, cloned above the fading stage and flown into its slot. */
function CardFlight({ flight }: { flight: Flight }) {
  const ref = useRef<HTMLDivElement>(null)
  const { from, to, player } = flight

  useLayoutEffect(() => {
    const el = ref.current
    if (!el?.animate) return
    const s = to.width / from.width
    const dx = to.left + to.width / 2 - (from.left + from.width / 2)
    const dy = to.top + to.height / 2 - (from.top + from.height / 2)
    // Up and back first, then down into the slot, so it reads as thrown
    // rather than slid.
    el.animate(
      [
        { transform: 'translate(0, 0) scale(1) rotate(0deg)' },
        {
          transform: `translate(${dx * 0.18}px, ${dy * 0.18 - 46}px) scale(${1 + (s - 1) * 0.2 + 0.06}) rotate(-5deg)`,
          offset: 0.32,
        },
        { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(0deg)` },
      ],
      { duration: FLIGHT_MS, easing: 'cubic-bezier(.5, 0, .25, 1)', fill: 'forwards' }
    )
  }, [from, to])

  return (
    <div
      ref={ref}
      className="pe-flight"
      aria-hidden
      style={
        {
          left: from.left,
          top: from.top,
          width: from.width,
          height: from.height,
          // The stage card is 8.5em wide; scale the clone's em to match.
          '--pe-fly-cs': from.width / 136,
          '--rg': RARITY_LOOK[player.rarity].glow,
        } as React.CSSProperties
      }
    >
      <PackCard player={player} revealed still />
    </div>
  )
}

/** Phones: on a device that reports its tilt without asking (Android), the
    cards follow it. iOS asks permission for this, so it gets the ambient
    sway the CSS gives every touch screen instead. */
function useGyroTilt(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el || !window.matchMedia('(hover: none)').matches || reducedMotion()) return
    const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: unknown } | undefined
    if (!DOE || typeof DOE.requestPermission === 'function') return
    let base: { b: number; g: number } | null = null
    let raf = 0
    const clamp = (n: number) => Math.max(-1, Math.min(1, n))
    const on = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return
      if (!base) {
        base = { b: e.beta, g: e.gamma }
        el.dataset.gyro = '1'
      }
      // The rest position drifts with how the phone is being held.
      base.b += (e.beta - base.b) * 0.02
      base.g += (e.gamma - base.g) * 0.02
      const x = clamp((e.gamma - base.g) / 22)
      const y = clamp((e.beta - base.b) / 22)
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        el.querySelectorAll('.pe-stage-cards .pe-card.rev').forEach((card) => leanCard(card, 0.5 + x * 0.45, 0.5 + y * 0.45))
      })
    }
    window.addEventListener('deviceorientation', on)
    return () => {
      window.removeEventListener('deviceorientation', on)
      cancelAnimationFrame(raf)
    }
  }, [ref])
}

export function PackStage({
  stage,
  tag,
  onCard,
  onRevealAll,
  onDismiss,
  onTear,
  onSkip,
  chemFor,
  wild = null,
  blockedFor,
  chipFor,
  note = null,
  clock = null,
}: {
  stage: StageState
  tag?: PackTag
  onCard: (i: number) => void
  onRevealAll: () => void
  /** Only offered when the pack failed to deal: there is nothing to lose. */
  onDismiss: () => void
  onTear: () => void
  onSkip: () => void
  chemFor?: (p: Player) => number | null
  /** The Daily's mixed packs, which aren't any one position's. */
  wild?: { art: string; first: string; rest: string; note?: string } | null
  /** Why a card is on the table but not takeable, if it isn't. */
  blockedFor?: (p: Player) => string | null
  /** The Daily's rule, marked on the cards it visibly touches. */
  chipFor?: (p: Player) => string | null
  /** Said over the cards in place of the usual prompt. */
  note?: string | null
  /** The Daily's shot clock, under the status line. */
  clock?: React.ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  useGyroTilt(root)

  const def = SLOTS[stage.slot]
  const cards = stage.cards
  const art = wild?.art ?? PACK_ART[def.pool]
  const hidden = stage.revealed.filter((r) => !r).length
  const shown = stage.revealed.length - hidden
  const w = stage.walkout
  const woCard = w && cards ? cards[w.i] : null
  const woLook = woCard ? RARITY_LOOK[woCard.rarity] : null
  // A blind pack opens the same way every time, at the size of a rare's.
  const blind = !!wild || !!cards?.some((c) => c.blind)
  const best: Rarity | null = cards ? (blind ? 'rare' : bestRarity(cards)) : null
  const glow = blind ? BLIND_GLOW : best ? RARITY_LOOK[best].color : '#e8a84b'
  const tier = best ? RARITIES.indexOf(best) : 0

  // An immortal stops the show as the pack comes open: the pack stays on the
  // table, lit, with the banner over it, and the cards wait until it's done.
  const [pullShown, setPullShown] = useState(false)
  const endPull = useCallback(() => setPullShown(true), [])
  const pulling = !!cards && stage.torn && !stage.restored && best === 'immortal' && !pullShown
  const open = !!cards && stage.torn && !pulling

  let status = 'Swipe across the top or tap to rip it open'
  if (stage.error) status = stage.error
  else if (!stage.torn) status = 'Swipe across the top, or tap, to rip it open'
  else if (!cards) status = 'Dealing'
  else if (pulling) status = 'Immortal pull'
  else if (woLook) status = `${woLook.label} pull`
  else if (stage.queue.length) status = 'Revealing'
  else if (stage.pickedId) status = 'Signed'
  else if (note) status = note
  else if (wild?.note) status = wild.note
  else if (shown > 0) status = `${shown} of ${cards.length} revealed · tap one to keep him`
  else status = 'Tap a card to flip it, or reveal them all'

  const cls = [
    'pe-stage',
    stage.leaving ? 'leaving' : '',
    stage.flight ? 'flying' : '',
    w ? 'walkout' : '',
    pulling ? 'pulling' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <div
        ref={root}
        className={cls}
        role="dialog"
        aria-modal="true"
        aria-label={wild ? `${wild.first} ${wild.rest}` : `${def.label} pack`}
        data-wo={w?.step}
        data-boom={open && !stage.restored ? tier : undefined}
        style={woLook ? ({ '--wo': woLook.color, '--wo-glow': woLook.glow } as React.CSSProperties) : undefined}
      >
        {pulling && <ImmortalPull onDone={endPull} />}

        {w && (
          <button
            type="button"
            className="pe-wo-veil"
            data-step={w.step}
            onClick={onSkip}
            aria-label={w.step === 'flip' ? 'Continue' : 'Skip to the reveal'}
          />
        )}

        <div className={`pe-stage-head${w || pulling ? ' wo' : ''}`}>
          <div className="pe-stage-norm">
            {tag && (
              <div
                className={`pe-stage-tag${tag.captain ? ' cap' : ''}`}
                style={tag.color ? ({ '--tag': tag.color } as React.CSSProperties) : undefined}
              >
                {tag.captain ? <CaptainMark inline /> : <Bolt className="pe-bolt" />}
                {tag.text}
              </div>
            )}
            <div className="pe-stage-pos">
              {wild ? wild.first : def.label.split(' ')[0]}{' '}
              <em>{wild ? wild.rest : def.label.split(' ').slice(1).join(' ')}</em>
            </div>
            <div className="pe-stage-status" aria-live="polite">
              {status}
            </div>
            {clock}
          </div>
          {pulling && (
            <div className="pe-imp-band" aria-hidden>
              <span className="pe-imp-word">Immortal</span>
              <span className="pe-imp-pull">Pull</span>
              <span className="pe-imp-sweep" />
            </div>
          )}
          {w && woCard && woLook && (
            <div className="pe-wo-cap" data-step={w.step} aria-live="polite">
              <div className="pe-wo-rar">{woLook.label}</div>
              {w.step !== 'charge' && <div className="pe-wo-team">{seasonLabel(woCard)}</div>}
              {(w.step === 'stat' || w.step === 'flip') && woCard.accolades[0] && (
                <div className="pe-wo-stat">{woCard.accolades[0]}</div>
              )}
            </div>
          )}
        </div>

        {!open && !stage.error && <SealedPack art={art} glow={glow} tier={tier} ready={!!cards} onTorn={onTear} />}

        {open && (
          <div className="pe-stage-cards">
            {!stage.restored && best && <RipBurst rarity={best} glow={blind ? BLIND_GLOW : undefined} />}
            {!stage.restored && <SpentPack art={art} tier={tier} glow={glow} />}
            {cards.map((card, i) => {
              const isPick = stage.pickedId === card.id
              const isRej = !!stage.pickedId && !isPick
              const charging = w?.i === i
              return (
                <PackCard
                  key={card.id}
                  player={card}
                  index={i}
                  revealed={stage.revealed[i]}
                  picked={isPick}
                  rejected={isRej}
                  selectable={!stage.pickedId && !w && !stage.queue.length}
                  charging={charging}
                  burst={charging && w?.step === 'flip'}
                  chem={stage.revealed[i] && chemFor ? chemFor(card) : null}
                  chip={stage.revealed[i] && chipFor ? chipFor(card) : null}
                  blocked={blockedFor?.(card) ?? null}
                  onClick={() => onCard(i)}
                  disabled={!!stage.pickedId || !!w}
                />
              )
            })}
          </div>
        )}

        <div className="pe-stage-foot">
          {open && !stage.pickedId && !w && !stage.queue.length && hidden > 0 && (
            <button type="button" className="pe-btn pe-btn--ghost" onClick={onRevealAll}>
              Reveal all {hidden}
            </button>
          )}
          {!cards && stage.error && (
            <button type="button" className="pe-btn pe-btn--quiet" onClick={onDismiss}>
              Back to the table
            </button>
          )}
        </div>
      </div>

      {stage.flight && <CardFlight flight={stage.flight} />}
    </>
  )
}

/** The dark and the light behind the Immortal Pull banner. Tapping it skips
    ahead; the banner itself sits in the stage's head, right above the pack. */
function ImmortalPull({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, reducedMotion() ? PULL_MS / 2 : PULL_MS)
    return () => window.clearTimeout(t)
  }, [onDone])
  return <button type="button" className="pe-imp-veil" onClick={onDone} aria-label="Immortal pull. Show the cards" />
}

/** Ease out: the low numbers fly by and the last stretch slows down. */
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3)

/** The recap's climb: a steady pace, so every rung on the ladder gets the
    same beat (they're about 3,000 apart), easing off only at the very end. */
export const easeClimb = (k: number) => (k < 0.8 ? (0.9 * k) / 0.8 : 0.9 + 0.1 * (1 - Math.pow(1 - (k - 0.8) / 0.2, 2)))

/** Counts a number up to its new value instead of jumping. `start` other
    than the value counts up from there on mount (the recap's climb). */
export function useCountUp(value: number, ms = 750, start = value, ease: (k: number) => number = easeOut) {
  const [shown, setShown] = useState(start)
  const at = useRef(start)

  useEffect(() => {
    const from = at.current
    if (from === value) return
    // Reduced motion lands in one frame.
    const dur = reducedMotion() ? 1 : ms
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur)
      const v = Math.round(from + (value - from) * ease(k))
      at.current = v
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms, ease])

  return shown
}

/** The running total under the masthead. */
export function ScoreStrip({
  score,
  filled,
  tier,
  extra,
  hidden = null,
  noTier = false,
  capLeft = null,
}: {
  score: number
  filled: number
  tier: { label: string; color: string }
  extra?: { value: React.ReactNode; label: string }
  /** A blind draft: what stands in for the total, which nobody knows yet. */
  hidden?: { value: string; label: string } | null
  /** An Even Versus: richer packs, so the ladder means nothing there. */
  noTier?: boolean
  /** Under a salary cap: what's left to spend, in $M. */
  capLeft?: number | null
}) {
  const shown = useCountUp(score)
  const prev = useRef(score)
  const [delta, setDelta] = useState<{ n: number; key: number } | null>(null)

  useEffect(() => {
    const n = score - prev.current
    prev.current = score
    if (n === 0) return
    setDelta((d) => ({ n, key: (d?.key ?? 0) + 1 }))
    const t = window.setTimeout(() => setDelta(null), 1400)
    return () => window.clearTimeout(t)
  }, [score])

  return (
    <div className="pe-strip">
      <div className="pe-strip-cell">
        {hidden ? (
          <div className={`pe-strip-val pe-strip-val--hidden${hidden.value === '?' ? ' pe-strip-val--mark' : ''}`}>{hidden.value}</div>
        ) : (
          <div className="pe-strip-val" style={{ color: tier.color }}>
            {shown.toLocaleString()}
            {delta && (
              <span key={delta.key} className={`pe-strip-delta${delta.n < 0 ? ' down' : ''}`} aria-hidden>
                {delta.n > 0 ? '+' : '−'}
                {Math.abs(delta.n).toLocaleString()}
              </span>
            )}
          </div>
        )}
        <div className="pe-strip-lbl">{hidden?.label ?? 'Accolades'}</div>
      </div>
      <div className="pe-strip-cell">
        <div className="pe-strip-val">
          {filled}
          <small>/{SLOTS.length}</small>
        </div>
        <div className="pe-strip-lbl">Signed</div>
      </div>
      {capLeft != null && (
        <div className="pe-strip-cell">
          <div className="pe-strip-val pe-strip-val--cap">${capLeft}M</div>
          <div className="pe-strip-lbl">Cap left</div>
        </div>
      )}
      {extra && (
        <div className="pe-strip-cell">
          <div className="pe-strip-val">{extra.value}</div>
          <div className="pe-strip-lbl">{extra.label}</div>
        </div>
      )}
      {!hidden && !noTier && capLeft == null && (
        <div className="pe-strip-cell">
          <div key={tier.label} className="pe-strip-tier" style={{ color: tier.color }}>
            {tier.label}
          </div>
          <div className="pe-strip-lbl">Tier</div>
        </div>
      )}
      <div className="pe-strip-bar">
        <div className="pe-strip-fill" style={{ width: `${(filled / SLOTS.length) * 100}%` }} />
      </div>
    </div>
  )
}

/** Measures whichever masthead the page wears (the desktop nav or the phone
    bar) so the strip can stick directly underneath it. */
export function useStripOffset() {
  useEffect(() => {
    const head = document.querySelector<HTMLElement>('[data-game-bar], nav.nav')
    const set = () => {
      const h = head ? Math.round(head.getBoundingClientRect().height) : 0
      document.documentElement.style.setProperty('--pe-strip-top', `${h + 8}px`)
    }
    set()
    window.addEventListener('resize', set)
    return () => window.removeEventListener('resize', set)
  }, [])
}
