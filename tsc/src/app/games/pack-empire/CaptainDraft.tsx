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
//
// A saved run can outlive its deal: a seed is signed with the pool it was
// dealt from, so when the pool changes, the server stops recognising it. The
// table checks a restored seed once on the way in and says so, rather than
// leaving a half-built lineup nobody can finish. Empire Builder can also be
// started over by hand; a Versus seat can't, the seed is the commitment.

import { useCallback, useEffect, useState } from 'react'
import {
  SLOTS,
  SLOT_COUNT,
  captainFromSeed,
  lineupScore,
  tierFor,
  type Player,
} from '@/lib/packEmpire/rules'
import { CaptainMark, Field, type SlotView } from './cards'
import { KeyAside, KeyButton } from './DraftKey'
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
  /** Empire Builder: the run can be thrown away and started again. */
  restartable?: boolean
}

/** The field and, beside it on a wide screen, the key; narrower, a button
    above the field that opens the key. */
function Board({ score, children }: { score: number; children: React.ReactNode }) {
  return (
    <div className="pe-board">
      <div className="pe-board-bar">
        <KeyButton score={score} />
      </div>
      <div className="pe-board-in">
        <div className="pe-turf">{children}</div>
        <KeyAside score={score} />
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
        <Board score={0}>
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

function LiveDraft({ saveKey, startSeed, fixedSeed, onDone, intro, restartable = false }: DraftProps) {
  const [start] = useState(() => startingState(saveKey, fixedSeed))
  const [captain, setCaptain] = useState<number | null>(start.captain)
  const [seed, setSeed] = useState<string | null>(start.seed)
  const [lineup, setLineup] = useState<(Player | null)[]>(start.lineup)
  const [picks, setPicks] = useState<DraftPick[]>(start.picks)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restored, setRestored] = useState(start.restored)
  /** The seed this table holds was dealt from a pool that's since changed. */
  const [stale, setStale] = useState(false)
  /** First tap on Start over arms it; the second throws the run away. */
  const [armed, setArmed] = useState(false)
  const { stage, flash, landing, open, tear, reveal, revealAll, skip, pick, dismiss, settle } = usePackStage()

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
    setError(null)
    setStale(false)
    setRestored(false)
    setArmed(false)
  }, [saveKey])

  useStripOffset()

  // The strip counts a card once it lands, not while it's in the air.
  const settled = settle(lineup)
  const filled = settled.filter(Boolean).length
  const score = lineupScore(settled)
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
      let done: DraftDone | null = null
      pick(i, (card) => {
        const nextLineup = [...lineup]
        nextLineup[slot] = card
        const nextPicks = [...picks, { slot, id: card.id }]
        setLineup(nextLineup)
        setPicks(nextPicks)
        if (nextPicks.length === SLOT_COUNT) {
          writeSaved(saveKey, null)
          const full = nextLineup as Player[]
          done = { seed, captain, picks: nextPicks, lineup: full, score: lineupScore(full) }
        } else {
          writeSaved(saveKey, { seed, captain, picks: nextPicks, lineup: nextLineup, at: Date.now() })
        }
      }).then((landed) => {
        // After the last card has landed and the count has run up.
        const run = done
        if (landed && run) window.setTimeout(() => onDone(run), 900)
      })
    },
    [stage, captain, seed, reveal, pick, lineup, picks, saveKey, onDone]
  )

  const choosing = !seed
  const view = (i: number): SlotView => {
    const isCap = captain === i
    if (choosing) {
      return { clickable: !starting, captain: isCap, capHint: !starting }
    }
    return {
      clickable: !stale && !stage && !lineup[i],
      opening: stage?.slot === i,
      captain: isCap,
    }
  }

  const capDef = captain != null ? SLOTS[captain] : null

  return (
    <div className="pe-draft">
      {flash && <ImmortalFlash />}

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
          <ScoreStrip score={score} filled={filled} tier={tier} />
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

      <Board score={score}>
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
        />
      )}
    </div>
  )
}
