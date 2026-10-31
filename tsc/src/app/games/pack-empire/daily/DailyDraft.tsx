'use client'

// The Daily's table.
//
// The server holds the run, so this only ever shows what it's handed and sends
// back one choice at a time. There's nothing here worth saving on the device:
// coming back on another phone finds the same pack waiting.

import Link from 'next/link'
import { useCallback, useState } from 'react'
import { dayChemPreview, dayChemTotal, ruleChip } from '@/lib/packEmpire/dayRules'
import { DIFFICULTY_LOOK, SLOT_COUNT, WILD_PACK_ART, shortName, slotForCard, type Player } from '@/lib/packEmpire/rules'
import type { DailyResult, DailyState } from '@/lib/packEmpire/daily'
import { KeyAside, KeyButton, type KeyFlavor } from '../DraftKey'
import { Bonds, CaptainMark, Field, LineupSheet, PackCard, blindValue, type SlotView } from '../cards'
import { PackStage, ScoreStrip, usePackStage, useStripOffset } from '../stage'

async function call(body: Record<string, unknown>): Promise<DailyState> {
  const res = await fetch('/api/games/pack-empire/daily/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = await res.json().catch(() => null)
  if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Something went wrong. Try again.')
  return out.state as DailyState
}

export function DailyDraft({ initial, other }: { initial: DailyState; other: { href: string; label: string; done: boolean } }) {
  const [state, setState] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // A finished run read from the page goes straight to the recap; one finished
  // here waits for its last card to land.
  const [turned, setTurned] = useState(initial.done)
  const { stage, landing, open, tear, reveal, revealAll, skip, pick, dismiss, settle } = usePackStage()
  useStripOffset()

  const { version, rule, captain, step, pack, reserve } = state
  const flavor: KeyFlavor = { difficulty: version, even: false, daily: true }
  const lineup = state.lineup
  const settled = settle(lineup)
  const signed = settled.filter((p): p is Player => !!p)
  const filled = new Set(lineup.flatMap((p, i) => (p ? [i] : [])))
  const captainPack = captain != null && step === 0
  const wildStep = captain != null ? step : step + 1
  const chemShown = version === 'range' && rule.id !== 'no-chem'
  const chem = chemShown ? dayChemTotal(rule.id, signed) : 0

  const start = useCallback(
    async (slot: number | null) => {
      setBusy(true)
      setError(null)
      try {
        setState(await call({ action: 'start', version, captain: slot }))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not start your Daily.')
      } finally {
        setBusy(false)
      }
    },
    [version]
  )

  const openNext = useCallback(() => {
    if (!pack || stage) return
    const cards = pack
    open(captainPack && captain != null ? captain : step, async () => cards)
  }, [pack, stage, open, captainPack, captain, step])

  const blockedFor = useCallback(
    (p: Player) => !captainPack && slotForCard(p.pos, filled) < 0,
    // `filled` is rebuilt every render from `lineup`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [captainPack, lineup]
  )

  const onCard = useCallback(
    (i: number) => {
      if (!stage?.cards) return
      if (!stage.revealed[i]) {
        reveal(i)
        return
      }
      const card = stage.cards[i]
      if (blockedFor(card)) return
      const to = captainPack && captain != null ? captain : slotForCard(card.pos, filled)
      let finished = false
      pick(
        i,
        async () => {
          const next = await call({ action: 'pick', version, id: card.id })
          finished = next.done
          setState(next)
        },
        to
      ).then((landed) => {
        if (landed && finished) window.setTimeout(() => setTurned(true), 900)
      })
    },
    // `filled` is rebuilt every render from `lineup`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stage, reveal, blockedFor, captainPack, captain, pick, version, lineup]
  )

  if (state.done && turned && state.result) return <DailyRecap state={state} result={state.result} other={other} />

  const view = (i: number): SlotView => {
    if (!state.started) return { clickable: !busy && !rule.noCaptain, captain: captain === i, capHint: !busy && !rule.noCaptain }
    return { clickable: false, captain: captain === i, opening: !!stage && captainPack && captain === i }
  }

  const left = SLOT_COUNT - step
  const range = version === 'range'
  const lo = signed.reduce((sum, p) => sum + (p.blind?.lo ?? 0), 0)
  const hi = signed.reduce((sum, p) => sum + (p.blind?.hi ?? 0), 0)

  return (
    <div className="pe-draft">
      <div className="pe-rulebar">
        <span className="pe-rulebar-tag">{rule.title}</span>
        <span>{rule.line}</span>
      </div>

      {state.started && (
        <ScoreStrip
          score={0}
          filled={signed.length}
          tier={{ label: '', color: '' }}
          hidden={
            range ? { value: blindValue({ level: 'range', lo, hi }), label: 'Could be' } : { value: '?', label: 'Hidden' }
          }
          extra={chemShown ? { value: `${chem >= 0 ? '+' : '−'}${Math.abs(chem).toLocaleString()}`, label: 'Chemistry' } : undefined}
        />
      )}

      {!state.started && !rule.noCaptain && (
        <div className="pe-banner">
          <CaptainMark inline />
          <span>
            Tap a position to make it your <b>captain</b>. That pack opens first, five cards at that position off the
            captain table.
          </span>
        </div>
      )}

      {error && (
        <div className="pe-error" style={{ maxWidth: 560, margin: '0 auto 1rem' }}>
          {error}
        </div>
      )}

      <div className="pe-board">
        <div className="pe-board-bar">
          <span className="pe-board-next">{DIFFICULTY_LOOK[version].label} · Scored at the end</span>
          <KeyButton score={0} flavor={flavor} />
        </div>
        <div className="pe-board-in">
          <div className="pe-turf">
            <Field lineup={lineup} view={view} onSlot={start} landing={landing} />
            <div className="pe-turf-foot pe-turf-foot--daily">
              {!state.started && rule.noCaptain && (
                <button type="button" className="pe-btn" onClick={() => start(null)} disabled={busy}>
                  {busy ? 'Dealing' : 'Open the first pack'}
                </button>
              )}
              {state.started && pack && !state.done && !stage && (
                <button type="button" className="pe-daily-next" onClick={openNext}>
                  {!captainPack && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={WILD_PACK_ART} alt="" />
                  )}
                  <span>
                    <b>{captainPack ? 'Open your captain pack' : `Open pack ${step + 1} of ${SLOT_COUNT}`}</b>
                    <small>{left === 1 ? 'Last pack' : `${left} to go`}</small>
                  </span>
                </button>
              )}
            </div>
          </div>
          <KeyAside score={0} flavor={flavor} />
        </div>
      </div>

      {stage && (
        <PackStage
          stage={stage}
          tag={captainPack ? { text: 'Captain pack', captain: true } : null}
          wild={
            captainPack
              ? null
              : {
                  art: WILD_PACK_ART,
                  first: 'Wild',
                  rest: `Pack ${wildStep}`,
                  note: reserve ? 'Nothing here fit, so one card was swapped for a reserve' : undefined,
                }
          }
          blockedFor={blockedFor}
          chipFor={(p) => ruleChip(rule.id, p)}
          chemFor={chemShown ? (p) => dayChemPreview(rule.id, p, signed) : undefined}
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

function signedDelta(n: number): string {
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toLocaleString()}`
}

function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')
}

/** Everything turned over: the score, how it got there, and what you passed. */
function DailyRecap({
  state,
  result,
  other,
}: {
  state: DailyState
  result: DailyResult
  other: { href: string; label: string; done: boolean }
}) {
  const { rule, version } = state
  return (
    <div className="pe-draft">
      <div className="pe-recap landed" style={{ '--tc': '#4fc3b0' } as React.CSSProperties}>
        <div className="pe-kicker">§ {DIFFICULTY_LOOK[version].label} · {rule.title}</div>
        <div className="pe-recap-tier">
          {ordinal(result.rank)} of {result.entrants.toLocaleString()} today
        </div>
        <div className="pe-recap-score">{result.total.toLocaleString()}</div>
        <div className="pe-daily-sum">
          <span>
            <b>{result.cards.toLocaleString()}</b> Cards
          </span>
          <span>
            <b>{signedDelta(result.ruleDelta)}</b> Rule
          </span>
          <span>
            <b>{signedDelta(result.chem.total)}</b> Chemistry
          </span>
        </div>
        <div className="pe-recap-actions">
          <Link href={other.href} className="pe-btn">
            {other.done ? `See ${other.label}` : `Play ${other.label}`}
          </Link>
          <Link href="/games/pack-empire/daily/" className="pe-btn pe-btn--quiet">
            Top lineups
          </Link>
        </div>
      </div>

      <div className="pe-twoup">
        <div className="pe-versus-side">
          <LineupSheet name="Your Eleven" lineup={result.lineup} total={result.total} counted={result.counted} captain={result.captain} />
        </div>
        <div className="pe-panel">
          <div className="pe-kicker">Chemistry</div>
          <Bonds chem={result.chem} />
        </div>
      </div>

      <section className="pe-sec">
        <div className="pe-sec-head">
          <span className="pe-sec-num">§ Pack By Pack</span>
          <span className="pe-sec-title">What You Passed On</span>
        </div>
        <div className="pe-passed">
          {result.packs.map((pack, n) => {
            const kept = pack.cards.find((c) => c.id === pack.kept)
            const best = pack.cards.reduce((a, b) => (b.score > a.score ? b : a))
            return (
              <details key={n} className="pe-passed-pack" open={n === 0}>
                <summary>
                  <span>
                    Pack {n + 1}
                    {pack.reserve ? ' · Reserve' : ''}
                  </span>
                  <small>
                    {kept && `Kept ${shortName(kept.name)} ${kept.score.toLocaleString()}`}
                    {best.id === pack.kept ? ' · The best in the pack' : ` · Left ${shortName(best.name)} ${best.score.toLocaleString()}`}
                  </small>
                </summary>
                <div className="pe-passed-cards">
                  {pack.cards.map((c) => (
                    <div key={c.id} className={`pe-passed-card${c.id === pack.kept ? ' kept' : ''}`}>
                      <PackCard player={c} revealed still />
                      {c.id === pack.kept && <span className="pe-passed-tag">Kept</span>}
                    </div>
                  ))}
                </div>
              </details>
            )
          })}
        </div>
      </section>
    </div>
  )
}

