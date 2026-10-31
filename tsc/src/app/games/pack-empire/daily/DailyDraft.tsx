'use client'

// The Daily's table.
//
// The server holds the run, so this only ever shows what it's handed and sends
// back one choice at a time. There's nothing here worth saving on the device:
// coming back on another phone finds the same pack waiting.

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { dayChemPreview, dayChemTotal, ruleChip } from '@/lib/packEmpire/dayRules'
import {
  DIFFICULTY_LOOK,
  PACK_ART,
  SALARY_CAP,
  SLOTS,
  SLOT_COUNT,
  WILD_PACK_ART,
  shortName,
  signingPrice,
  slotForCard,
  type Player,
} from '@/lib/packEmpire/rules'
import type { DailyResult, DailyState } from '@/lib/packEmpire/daily'
import { guestPoster, readGuest, rememberGuest } from '../../runBank'
import { KeyAside, KeyButton, type KeyFlavor } from '../DraftKey'
import { GuestName } from '../GuestName'
import { ShareButton } from '../share'
import { Bonds, CaptainMark, Field, LineupSheet, PackCard, blindTotal, type SlotView } from '../cards'
import { PackStage, ScoreStrip, restoredStage, usePackStage, useStripOffset } from '../stage'

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

/** The shot clock. Its own component so the seconds re-render this and not
    every card on the stage, and the bar runs on a transform alone. */
function PackClock({ seconds, onOut }: { seconds: number; onOut: () => void }) {
  const [left, setLeft] = useState(seconds)
  const ends = useRef(0)
  const out = useRef(onOut)
  useEffect(() => {
    out.current = onOut
  }, [onOut])
  useEffect(() => {
    ends.current = Date.now() + seconds * 1000
    let fired = false
    const t = window.setInterval(() => {
      const n = Math.max(0, Math.ceil((ends.current - Date.now()) / 1000))
      setLeft(n)
      if (n === 0 && !fired) {
        fired = true
        window.clearInterval(t)
        out.current()
      }
    }, 200)
    return () => window.clearInterval(t)
  }, [seconds])
  return (
    <div className={`pe-shot${left <= 5 ? ' low' : ''}`} role="timer" aria-label={`${left} seconds left`}>
      <span className="pe-shot-n">{left}</span>
      <span className="pe-shot-bar" aria-hidden>
        <i style={{ animationDuration: `${seconds}s` }} />
      </span>
    </div>
  )
}

export function DailyDraft({ initial, other }: { initial: DailyState; other: { href: string; label: string; done: boolean } }) {
  const [state, setState] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // A finished run read from the page goes straight to the recap; one finished
  // here waits for its last card to land.
  const [turned, setTurned] = useState(initial.done)
  // Left a pack open and came back: it's still open, on the same clock.
  const { stage, landing, open, tear, reveal, revealAll, skip, pick, dismiss, settle } = usePackStage(
    initial.pack ? restoredStage(initial.captain != null && initial.step === 0 ? initial.captain : initial.step, initial.pack) : null
  )
  const [clockNote, setClockNote] = useState<string | null>(null)
  /** A pick is on its way to the server. */
  const [saving, setSaving] = useState(false)
  useStripOffset()

  const { version, rule, captain, step, pack, reserve, capLeft } = state
  const flavor: KeyFlavor = { difficulty: version, even: false, daily: true, salaryCap: rule.salaryCap }
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
    if (stage) return
    setClockNote(null)
    open(captainPack && captain != null ? captain : step, async () => {
      const next = await call({ action: 'open', version })
      setState(next)
      if (!next.pack) throw new Error('The pack would not open. Try again.')
      return next.pack
    })
  }, [stage, open, captainPack, captain, step, version])

  const timeUp = useCallback(async () => {
    try {
      const next = await call({ action: 'expire', version })
      if (!next.timedOut) return
      dismiss()
      setState(next)
      setClockNote(`Time ran out. ${next.timedOut} signed.`)
      if (next.done) setTurned(true)
    } catch {
      // The next thing you do settles it: the server's clock is the real one.
    }
  }, [version, dismiss])

  const blockedFor = useCallback(
    (p: Player): string | null => {
      if (!captainPack && slotForCard(p.pos, filled) < 0) return 'No slot'
      if (capLeft == null || !pack) return null
      const usable = pack.filter((c) => captainPack || slotForCard(c.pos, filled) >= 0)
      return signingPrice(p, usable, capLeft) == null ? 'Over cap' : null
    },
    // `filled` is rebuilt every render from `lineup`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [captainPack, lineup, capLeft, pack]
  )

  const skint =
    capLeft != null &&
    !!pack &&
    pack.filter((c) => captainPack || slotForCard(c.pos, filled) >= 0).every((c) => (c.salary ?? 0) > capLeft)

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
      // The card flies now and the server catches up. If it refuses (a clock
      // that ran out on it, a dropped connection), what comes back is the truth.
      const price = card.salary ?? 0
      pick(
        i,
        async () => {
          setSaving(true)
          setState((s) => {
            const lineup = [...s.lineup]
            lineup[to] = card
            const usable = capLeft != null && price > capLeft
            return { ...s, lineup, capLeft: s.capLeft == null ? null : s.capLeft - (usable ? 0 : price) }
          })
          try {
            const next = await call({ action: 'pick', version, id: card.id })
            finished = next.done
            if (next.timedOut) setClockNote(`Too late. ${next.timedOut} signed.`)
            setState(next)
          } catch (e) {
            setError(e instanceof Error ? e.message : 'That pick did not save.')
            const res = await fetch(`/api/games/pack-empire/daily/?v=${version}`, { cache: 'no-store' })
            const out = await res.json().catch(() => null)
            if (out?.state) setState(out.state)
          } finally {
            setSaving(false)
          }
        },
        to,
        true
      ).then((landed) => {
        if (landed && finished) window.setTimeout(() => setTurned(true), 900)
      })
    },
    // `filled` is rebuilt every render from `lineup`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stage, reveal, blockedFor, captainPack, captain, pick, version, lineup, capLeft]
  )

  if (state.done && turned && state.result) {
    return <DailyRecap state={state} result={state.result} other={other} onNamed={setState} />
  }

  const view = (i: number): SlotView => {
    if (!state.started) {
      return { clickable: !busy && !rule.noCaptain, captain: captain === i, capHint: !busy && !rule.noCaptain, empty: true }
    }
    return { clickable: false, captain: captain === i, opening: !!stage && captainPack && captain === i, empty: true }
  }

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
            range ? { value: blindTotal(lo, hi), label: 'Could be' } : { value: '?', label: 'Hidden' }
          }
          capLeft={capLeft}
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
      {clockNote && (
        <p className="pe-note" style={{ textAlign: 'center', marginBottom: '0.8rem' }}>
          {clockNote}
        </p>
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
              {state.started && !state.done && !stage && (
                <button type="button" className="pe-nextpack" onClick={openNext} disabled={saving}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="pe-nextpack-art"
                    src={captainPack && captain != null ? PACK_ART[SLOTS[captain].pool] : WILD_PACK_ART}
                    alt=""
                    draggable={false}
                  />
                  <span className="pe-nextpack-body">
                    <b>{captainPack ? 'Captain Pack' : `Pack ${step + 1} of ${SLOT_COUNT}`}</b>
                    <span className="pe-nextpack-pips" aria-hidden>
                      {Array.from({ length: SLOT_COUNT }, (_, i) => (
                        <i key={i} className={i < step ? 'done' : i === step ? 'now' : undefined} />
                      ))}
                    </span>
                  </span>
                  <span className="pe-nextpack-go">Open</span>
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
          note={skint ? 'You can’t afford anyone here, so the cheapest card signs for free' : null}
          clock={
            state.secondsLeft != null && stage.cards && !stage.pickedId ? (
              <PackClock key={step} seconds={state.secondsLeft} onOut={timeUp} />
            ) : null
          }
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

/** No account, at the end of a run: a name puts it on today's board. A browser
    that's posted a name before doesn't get asked twice. */
function NameYourRun({ version, onNamed }: { version: DailyState['version']; onNamed: (state: DailyState) => void }) {
  const [error, setError] = useState<string | null>(null)

  const post = useCallback(
    async (name: string) => {
      const guest = guestPoster(name)
      try {
        const next = await call({ action: 'name', version, name, key: guest.key })
        rememberGuest(guest)
        onNamed(next)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save that name.')
      }
    },
    [version, onNamed]
  )

  useEffect(() => {
    const known = readGuest()
    if (!known) return
    const t = window.setTimeout(() => void post(known.name), 0)
    return () => window.clearTimeout(t)
  }, [post])

  return (
    <div style={{ marginTop: '0.9rem' }}>
      <p className="pe-recap-post">Add your name to go on today&apos;s board.</p>
      <GuestName
        error={error}
        onPost={post}
        signIn={`/login?mode=signup&next=${encodeURIComponent(`/games/pack-empire/daily/play/?v=${version}`)}`}
      />
    </div>
  )
}

/** Everything turned over: the score, how it got there, and what you passed. */
function DailyRecap({
  state,
  result,
  other,
  onNamed,
}: {
  state: DailyState
  result: DailyResult
  other: { href: string; label: string; done: boolean }
  onNamed: (state: DailyState) => void
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
          {result.spent != null ? (
            <span>
              <b>${result.spent}M</b> of ${SALARY_CAP.shared}M
            </span>
          ) : (
            <span>
              <b>{signedDelta(result.ruleDelta)}</b> Rule
            </span>
          )}
          <span>
            <b>{signedDelta(result.chem.total)}</b> Chemistry
          </span>
        </div>
        {!result.named && <NameYourRun version={version} onNamed={onNamed} />}
        <div className="pe-recap-actions">
          <Link href={other.href} className="pe-btn">
            {other.done ? `See ${other.label}` : `Play ${other.label}`}
          </Link>
          {result.share && (
            <ShareButton
              path={`/games/pack-empire/daily/?r=${encodeURIComponent(result.share)}`}
              text={`${result.total.toLocaleString()} on today's Daily. Same packs, one try.`}
            />
          )}
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

