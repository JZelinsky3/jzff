'use client'

// The captain draft: Empire Builder's whole game, and the draft each side of
// a Versus Challenge plays.
//
//   1. Tap a position to make it your captain. Its pack deals off the
//      captain table.
//   2. Open the other ten in any order, captain whenever you like.
//   3. Five cards a pack, face down. Flip them, keep one.
//
// The captain is a commitment: the server signs it into the seed before a
// single pack is dealt, so it can't be moved after a look at the packs.
//
// A run in progress is kept on this device (the seed, the picks in order, the
// players), so a refresh or a dropped connection puts you back at the table
// rather than throwing away an immortal. Nothing in it is worth editing: the
// board re-deals every pack from the seed and refuses a pick that isn't in it.

import { useCallback, useState } from 'react'
import {
  SLOTS,
  SLOT_COUNT,
  captainFromSeed,
  lineupScore,
  tierFor,
  type Player,
} from '@/lib/packEmpire/rules'
import { Bolt, Field, type SlotView } from './cards'
import { useHydrated } from './clientStore'
import { ImmortalFlash, PackStage, ScoreStrip, usePackStage, useStripOffset } from './stage'

export type DraftPick = { slot: number; id: string }

export type DraftDone = {
  seed: string
  captain: number
  picks: DraftPick[]
  lineup: Player[]
  score: number
}

type Saved = {
  seed: string
  captain: number
  picks: DraftPick[]
  lineup: (Player | null)[]
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
        <div className="pe-turf">
          <Field lineup={EMPTY} view={() => ({ clickable: false })} />
        </div>
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
      restored: saved.picks.length > 0,
    }
  }
  if (fixedSeed) {
    return { seed: fixedSeed, captain: captainFromSeed(fixedSeed), lineup: EMPTY, picks: [], restored: false }
  }
  return { seed: null, captain: null, lineup: EMPTY, picks: [], restored: false }
}

function LiveDraft({ saveKey, startSeed, fixedSeed, onDone, intro }: DraftProps) {
  const [start] = useState(() => startingState(saveKey, fixedSeed))
  const [captain, setCaptain] = useState<number | null>(start.captain)
  const [seed, setSeed] = useState<string | null>(start.seed)
  const [lineup, setLineup] = useState<(Player | null)[]>(start.lineup)
  const [picks, setPicks] = useState<DraftPick[]>(start.picks)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const restored = start.restored
  const { stage, flash, open, reveal, revealAll, pick, dismiss } = usePackStage()

  useStripOffset()

  const filled = lineup.filter(Boolean).length
  const score = lineupScore(lineup)
  const tier = tierFor(score)

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
      if (!stage?.cards || captain == null || !seed) return
      if (!stage.revealed[i]) {
        reveal(i)
        return
      }
      const slot = stage.slot
      pick(i, (card) => {
        const nextLineup = [...lineup]
        nextLineup[slot] = card
        const nextPicks = [...picks, { slot, id: card.id }]
        setLineup(nextLineup)
        setPicks(nextPicks)
        if (nextPicks.length === SLOT_COUNT) {
          writeSaved(saveKey, null)
          const full = nextLineup as Player[]
          // After the stage has cleared, so the last card is seen landing.
          window.setTimeout(
            () => onDone({ seed, captain, picks: nextPicks, lineup: full, score: lineupScore(full) }),
            420
          )
        } else {
          writeSaved(saveKey, { seed, captain, picks: nextPicks, lineup: nextLineup, at: Date.now() })
        }
      })
    },
    [stage, captain, seed, reveal, pick, lineup, picks, saveKey, onDone]
  )

  const choosing = !seed
  const view = (i: number): SlotView => {
    const isCap = captain === i
    if (choosing) {
      return {
        clickable: !starting,
        badge: isCap ? { text: 'CAPTAIN' } : null,
        glow: isCap ? 'cap' : null,
        tone: isCap ? 'cap' : null,
      }
    }
    return {
      clickable: !stage && !lineup[i],
      opening: stage?.slot === i,
      badge: isCap ? { text: 'CAPTAIN' } : null,
      glow: isCap ? 'cap' : null,
      tone: isCap ? 'cap' : null,
      flag: isCap ? { text: 'CAP' } : null,
    }
  }

  const capDef = captain != null ? SLOTS[captain] : null

  return (
    <>
      {flash && <ImmortalFlash />}

      {choosing ? (
        <>
          {intro}
          <div className="pe-banner">
            <Bolt />
            <span>
              Tap any position to make it your <b>captain</b>. Its pack deals off the captain table: five
              times the weight on immortals.
            </span>
          </div>
        </>
      ) : (
        <>
          <ScoreStrip score={score} filled={filled} tier={tier} />
          {capDef && captain != null && !lineup[captain] && (
            <div className="pe-banner">
              <Bolt />
              <span>
                Your <b>{capDef.label.toLowerCase()}</b> pack is the captain pack. Open it whenever you
                like.
              </span>
            </div>
          )}
          {restored && filled < SLOT_COUNT && (
            <p className="pe-note" style={{ textAlign: 'center', marginBottom: '0.8rem' }}>
              Picked up where you left off · {filled} of {SLOT_COUNT} signed
            </p>
          )}
        </>
      )}

      {error && (
        <div className="pe-error" style={{ maxWidth: 560, margin: '0 auto 1rem' }}>
          {error}
        </div>
      )}

      <div className="pe-turf">
        <Field lineup={lineup} view={view} onSlot={choosing ? chooseCaptain : openSlot} />
        {!choosing && !stage && filled < SLOT_COUNT && (
          <p className="pe-turf-note pe-note">
            Tap a pack to open it · {SLOT_COUNT - filled} to go
          </p>
        )}
        {choosing && starting && <p className="pe-turf-note pe-note">Sealing the captain pack</p>}
      </div>

      {stage && (
        <PackStage
          stage={stage}
          tag={stage.slot === captain ? { text: 'Captain pack' } : null}
          onCard={onCard}
          onRevealAll={revealAll}
          onDismiss={dismiss}
        />
      )}
    </>
  )
}
