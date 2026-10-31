'use client'

// The captain draft: Empire Builder's whole game, and the draft each side of
// a Versus Challenge plays.
//
//   1. Tap a position to make it your captain. Its pack deals off the
//      captain table.
//   2. Open the other ten in any order, captain whenever you like.
//   3. Five cards a pack, face down. Flip them, keep one.
//
// On Range and Ball Knower the server masks every card and the total stays
// hidden until the lineup is locked. An Even Versus skips step one: there's no
// captain, the seat just sits down on the shared seed.
//
// The captain is a commitment: the server signs it into the seed before a
// single pack is dealt, so it can't be moved after a look at the packs.
//
// A run in progress is kept on this device (the seed, the picks in order, the
// players), so a refresh or a dropped connection puts you back at the table
// rather than throwing away an immortal. Nothing in it is worth editing: the
// board re-deals every pack from the seed and refuses a pick that isn't in it.
//
// A saved run can outlive its deal: a seed is signed with the pool it was
// dealt from, so when the pool changes, the server stops recognising it. The
// table checks a restored seed once on the way in and says so, rather than
// leaving a half-built lineup nobody can finish. Empire Builder can also be
// started over by hand; a Versus seat can't, the seed is the commitment.

import { useCallback, useEffect, useState } from 'react'
import {
  SALARY_CAP,
  SLOTS,
  SLOT_COUNT,
  TIERS,
  captainFromSeed,
  chemistryCounts,
  chemistryFor,
  chemistryPreview,
  isBlind,
  lineupScore,
  signingPrice,
  tierFor,
  type Difficulty,
  type Player,
} from '@/lib/packEmpire/rules'
import { CaptainMark, Field, blindTotal, type SlotView } from './cards'
import { KeyAside, KeyButton, type KeyFlavor } from './DraftKey'
import { useHydrated } from './clientStore'
import { PackStage, ScoreStrip, usePackStage, useStripOffset } from './stage'

export type DraftPick = { slot: number; id: string }

export type DraftDone = {
  seed: string
  captain: number | null
  picks: DraftPick[]
  lineup: Player[]
  score: number
  /** Under a salary cap, what the eleven cost. */
  spent: number
}

type Saved = {
  seed: string
  captain: number | null
  picks: DraftPick[]
  lineup: (Player | null)[]
  /** Under a salary cap. */
  spent?: number
  at: number
}

/** Runs older than this are dropped rather than offered back. */
const SAVE_TTL = 1000 * 60 * 60 * 24 * 3

function readSaved(key: string): Saved | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const s = JSON.parse(raw) as Saved
    if (!s.seed || !Array.isArray(s.lineup) || Date.now() - s.at > SAVE_TTL) return null
    return s
  } catch {
    return null
  }
}

function writeSaved(key: string, s: Saved | null) {
  try {
    if (s) localStorage.setItem(key, JSON.stringify(s))
    else localStorage.removeItem(key)
  } catch {
    // Private browsing. The run just won't survive a refresh.
  }
}

async function dealPack(seed: string, slot: number, taken: string[]): Promise<Player[]> {
  const res = await fetch('/api/games/pack-empire/deal/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'pack', seed, slot, taken }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.ok) throw new Error(body?.error ?? 'The pack would not open. Try again.')
  return body.cards as Player[]
}

type DraftProps = {
  /** Where a run in progress is kept on this device. */
  saveKey: string
  /** Commit the captain and get a seed signed for it. */
  startSeed: (captain: number) => Promise<string>
  /** A seat that already has a seed (a Versus side resumed on a new device):
      the captain inside it is already decided. */
  fixedSeed?: string | null
  onDone: (run: DraftDone) => void
  /** What sits above the table before the first pack. */
  intro?: React.ReactNode
  /** What sits above it once a run is going. */
  running?: React.ReactNode
  /** Empire Builder: the run can be thrown away and started again. */
  restartable?: boolean
  /** What the cards show. The seed is what really decides it: masked cards
      are all the server sends. */
  difficulty?: Difficulty
  /** An Even Versus: no captain, and chemistry decides it. */
  even?: boolean
}

/** A blind draft's stand-in for the total: on Range the sum of what its cards
    could be worth, on Ball Knower nothing at all. */
function hiddenTotal(lineup: (Player | null)[], diff: Difficulty) {
  if (!isBlind(diff)) return null
  if (diff === 'season') return { value: '?', label: 'Hidden' }
  const signed = lineup.filter((p): p is Player => !!p)
  const lo = signed.reduce((sum, p) => sum + (p.blind?.lo ?? 0), 0)
  const hi = signed.reduce((sum, p) => sum + (p.blind?.hi ?? 0), 0)
  return { value: blindTotal(lo, hi), label: 'Could be' }
}

/** Where the run stands, on the left of the row with the key's button. */
function ChaseLine({ score, choosing, blind, even }: { score: number; choosing: boolean; blind: boolean; even: boolean }) {
  if (even) return <span className="pe-board-next">Same packs on both sides</span>
  if (choosing) return <span className="pe-board-next">Pick your captain</span>
  if (blind) return <span className="pe-board-next">Scored when you lock in</span>
  const next = [...TIERS].reverse().find((t) => t.min > score)
  if (!next) return <span className="pe-board-next">Top of the ladder</span>
  return (
    <span className="pe-board-next">
      <b>{(next.min - score).toLocaleString()}</b> to {next.label}
    </span>
  )
}

/** The field and, beside it on a wide screen, the key; narrower, a button
    above the field that opens the key. */
function Board({
  score,
  choosing = true,
  flavor,
  children,
}: {
  score: number
  choosing?: boolean
  flavor: KeyFlavor
  children: React.ReactNode
}) {
  return (
    <div className="pe-board">
      <div className="pe-board-bar">
        <ChaseLine score={score} choosing={choosing} blind={isBlind(flavor.difficulty)} even={flavor.even} />
        <KeyButton score={score} flavor={flavor} />
      </div>
      <div className="pe-board-in">
        <div className="pe-turf">{children}</div>
        <KeyAside score={score} flavor={flavor} />
      </div>
    </div>
  )
}

async function seedIsLive(seed: string): Promise<boolean> {
  try {
    const res = await fetch('/api/games/pack-empire/deal/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check', seed }),
    })
    const body = await res.json().catch(() => null)
    // Only a definite no counts; a dropped connection shouldn't eat a run.
    return !(res.ok && body?.ok && body.live === false)
  } catch {
    return true
  }
}

/**
 * The table, once the page is live in the browser.
 *
 * A run in progress lives in this device's storage, which the server can't
 * read, so the server draws the field with every pack sealed and the live
 * table takes over on hydration, already holding whatever was saved. Reading
 * the save in the first state rather than an effect means it never renders
 * an empty field and then refills it.
 */
export function CaptainDraft(props: DraftProps) {
  const hydrated = useHydrated()
  if (!hydrated) {
    return (
      <>
        {props.intro}
        <Board score={0} flavor={{ difficulty: props.difficulty ?? 'open', even: !!props.even }}>
          <Field lineup={EMPTY} view={() => ({ clickable: false })} />
        </Board>
      </>
    )
  }
  return <LiveDraft {...props} />
}

const EMPTY: (Player | null)[] = Array(SLOT_COUNT).fill(null)

type Start = {
  seed: string | null
  captain: number | null
  lineup: (Player | null)[]
  picks: DraftPick[]
  spent: number
  restored: boolean
}

function startingState(saveKey: string, fixedSeed: string | null | undefined): Start {
  const saved = readSaved(saveKey)
  if (saved && (!fixedSeed || saved.seed === fixedSeed)) {
    return {
      seed: saved.seed,
      captain: saved.captain,
      lineup: saved.lineup,
      picks: saved.picks,
      spent: saved.spent ?? 0,
      restored: saved.picks.length > 0,
    }
  }
  if (fixedSeed) {
    return { seed: fixedSeed, captain: captainFromSeed(fixedSeed), lineup: EMPTY, picks: [], spent: 0, restored: false }
  }
  return { seed: null, captain: null, lineup: EMPTY, picks: [], spent: 0, restored: false }
}

function LiveDraft({
  saveKey,
  startSeed,
  fixedSeed,
  onDone,
  intro,
  running,
  restartable = false,
  difficulty = 'open',
  even = false,
}: DraftProps) {
  const [start] = useState(() => startingState(saveKey, fixedSeed))
  const [captain, setCaptain] = useState<number | null>(start.captain)
  const [seed, setSeed] = useState<string | null>(start.seed)
  const [lineup, setLineup] = useState<(Player | null)[]>(start.lineup)
  const [picks, setPicks] = useState<DraftPick[]>(start.picks)
  const [spent, setSpent] = useState(start.spent)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restored, setRestored] = useState(start.restored)
  /** The seed this table holds was dealt from a pool that's since changed. */
  const [stale, setStale] = useState(false)
  /** First tap on Start over arms it; the second throws the run away. */
  const [armed, setArmed] = useState(false)
  const { stage, landing, open, tear, reveal, revealAll, skip, pick, dismiss, settle } = usePackStage()

  // Check a seed brought back from storage (or held by a Versus seat) once.
  useEffect(() => {
    if (!start.seed) return
    let gone = false
    seedIsLive(start.seed).then((live) => {
      if (!gone && !live) setStale(true)
    })
    return () => {
      gone = true
    }
  }, [start.seed])

  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), 3500)
    return () => window.clearTimeout(t)
  }, [armed])

  const restart = useCallback(() => {
    writeSaved(saveKey, null)
    setCaptain(null)
    setSeed(null)
    setLineup(EMPTY)
    setPicks([])
    setSpent(0)
    setError(null)
    setStale(false)
    setRestored(false)
    setArmed(false)
  }, [saveKey])

  useStripOffset()

  // The strip counts a card once it lands, not while it's in the air.
  const settled = settle(lineup)
  const filled = settled.filter(Boolean).length
  const chemOn = chemistryCounts(difficulty, even)
  // A Ball Knower card has no team to read, so nothing on the table can say
  // what chemistry is doing until the lineup is locked.
  const chemShown = chemOn && difficulty !== 'season'
  const signed = settled.filter((p): p is Player => !!p)
  const chem = chemShown ? chemistryFor(signed, true).total : 0
  const score = lineupScore(settled) + chem
  const tier = tierFor(score)
  const capped = difficulty === 'cap'
  const budget: number = even ? SALARY_CAP.shared : SALARY_CAP.own
  const capLeft = budget - spent
  const packCards = stage?.cards ?? null
  const priceOf = (p: Player) => signingPrice(p, packCards ?? [p], capLeft)
  const skint = capped && !!packCards && packCards.every((p) => (p.salary ?? 0) > capLeft)

  const chooseCaptain = useCallback(
    async (i: number) => {
      if (starting || seed) return
      setStarting(true)
      setError(null)
      setCaptain(i)
      try {
        const s = await startSeed(i)
        setSeed(s)
        writeSaved(saveKey, { seed: s, captain: i, picks: [], lineup: Array(SLOT_COUNT).fill(null), at: Date.now() })
      } catch (e) {
        setCaptain(null)
        setError(e instanceof Error ? e.message : 'Could not start the run.')
      } finally {
        setStarting(false)
      }
    },
    [starting, seed, startSeed, saveKey]
  )

  // An Even seat has nothing to commit: it sits straight down on the shared seed.
  useEffect(() => {
    if (!even || start.seed) return
    let gone = false
    startSeed(0)
      .then((s) => {
        if (gone) return
        setSeed(s)
        writeSaved(saveKey, { seed: s, captain: null, picks: [], lineup: EMPTY, at: Date.now() })
      })
      .catch((e) => {
        if (!gone) setError(e instanceof Error ? e.message : 'Could not start the run.')
      })
    return () => {
      gone = true
    }
  }, [even, start.seed, startSeed, saveKey])

  const openSlot = useCallback(
    (i: number) => {
      if (!seed || stage || lineup[i]) return
      const taken = picks.map((p) => p.id)
      open(i, () => dealPack(seed, i, taken))
    },
    [seed, stage, lineup, picks, open]
  )

  const onCard = useCallback(
    (i: number) => {
      if (!stage?.cards || (captain == null && !even) || !seed) return
      if (!stage.revealed[i]) {
        reveal(i)
        return
      }
      const slot = stage.slot
      const price = capped ? signingPrice(stage.cards[i], stage.cards, budget - spent) : 0
      if (price == null) return
      let done: DraftDone | null = null
      pick(i, (card) => {
        const nextLineup = [...lineup]
        nextLineup[slot] = card
        const nextPicks = [...picks, { slot, id: card.id }]
        const nextSpent = spent + price
        setLineup(nextLineup)
        setPicks(nextPicks)
        setSpent(nextSpent)
        if (nextPicks.length === SLOT_COUNT) {
          writeSaved(saveKey, null)
          const full = nextLineup as Player[]
          const total = lineupScore(full) + (chemShown ? chemistryFor(full, true).total : 0)
          done = { seed, captain, picks: nextPicks, lineup: full, score: total, spent: nextSpent }
        } else {
          writeSaved(saveKey, { seed, captain, picks: nextPicks, lineup: nextLineup, spent: nextSpent, at: Date.now() })
        }
      }).then((landed) => {
        // After the last card has landed and the count has run up.
        const run = done
        if (landed && run) window.setTimeout(() => onDone(run), 900)
      })
    },
    [stage, captain, even, seed, reveal, pick, lineup, picks, saveKey, onDone, capped, budget, spent, chemShown]
  )

  const choosing = !seed && !even
  const view = (i: number): SlotView => {
    const isCap = captain === i
    if (choosing) {
      return { clickable: !starting, captain: isCap, capHint: !starting }
    }
    return {
      clickable: !!seed && !stale && !stage && !lineup[i],
      opening: stage?.slot === i,
      captain: isCap,
    }
  }

  const capDef = captain != null ? SLOTS[captain] : null

  return (
    <div className="pe-draft">
      {choosing ? (
        <>
          {intro}
          <div className="pe-banner">
            <CaptainMark inline />
            <span>
              Tap any position to make it your <b>captain</b>. Its pack deals off the captain table: five
              times the weight on immortals.
            </span>
          </div>
        </>
      ) : (
        <>
          {running}
          <ScoreStrip
            score={score}
            filled={filled}
            tier={tier}
            hidden={hiddenTotal(settled, difficulty)}
            noTier={even}
            capLeft={capped ? capLeft : null}
            extra={chemShown ? { value: `${chem >= 0 ? '+' : '−'}${Math.abs(chem).toLocaleString()}`, label: 'Chemistry' } : undefined}
          />
          {capDef && captain != null && !lineup[captain] && !stale && (
            <div className="pe-banner">
              <CaptainMark inline />
              <span>
                Your <b>{capDef.label.toLowerCase()}</b> pack is the captain pack. Open it whenever you
                like.
              </span>
            </div>
          )}
          {restored && !stale && filled < SLOT_COUNT && (
            <p className="pe-note" style={{ textAlign: 'center', marginBottom: '0.8rem' }}>
              Picked up where you left off · {filled} of {SLOT_COUNT} signed
            </p>
          )}
        </>
      )}

      {stale && (
        <div className="pe-stale">
          <p>
            {restartable
              ? 'This run was dealt from an older set of cards, so its packs can’t be opened anymore.'
              : 'This draft was dealt from an older set of cards, so its packs can’t be opened anymore.'}
          </p>
          {restartable && (
            <button type="button" className="pe-btn pe-btn--sm" onClick={restart}>
              Start a new run
            </button>
          )}
        </div>
      )}

      {error && !stale && (
        <div className="pe-error" style={{ maxWidth: 560, margin: '0 auto 1rem' }}>
          {error}
        </div>
      )}

      <Board score={score} choosing={choosing} flavor={{ difficulty, even }}>
        <Field lineup={lineup} view={view} onSlot={choosing ? chooseCaptain : openSlot} landing={landing} />
        {!choosing && !stage && !stale && filled < SLOT_COUNT && (
          <div className="pe-turf-foot">
            <p className="pe-turf-note pe-note">Tap a pack to open it · {SLOT_COUNT - filled} to go</p>
            {restartable && (
              <button
                type="button"
                className={`pe-restart${armed ? ' armed' : ''}`}
                onClick={() => (armed ? restart() : setArmed(true))}
              >
                {armed ? 'Tap again to throw this run away' : 'Start over'}
              </button>
            )}
          </div>
        )}
        {choosing && starting && <p className="pe-turf-note pe-note">Sealing the captain pack</p>}
      </Board>

      {stage && (
        <PackStage
          stage={stage}
          tag={stage.slot === captain ? { text: 'Captain pack', captain: true } : null}
          onCard={onCard}
          onRevealAll={revealAll}
          onDismiss={dismiss}
          onTear={tear}
          onSkip={skip}
          chemFor={chemShown ? (p) => chemistryPreview(p, signed, true) : undefined}
          blockedFor={capped ? (p) => (priceOf(p) == null ? 'Over cap' : null) : undefined}
          note={skint ? 'You can’t afford anyone here, so the cheapest card signs for free' : null}
        />
      )}
    </div>
  )
}
