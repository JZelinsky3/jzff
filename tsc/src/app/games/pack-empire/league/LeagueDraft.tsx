'use client'

// A League Mode week, start to finish:
//
//   1. Boost: if last week earned a better pack, pick the slot it goes on
//      (or pass). Committed before a single pack is dealt.
//   2. Packs: one for every slot you haven't locked. Locked keepers stand in
//      their slots already. Every revealed card shows what it would do to
//      your chemistry.
//   3. Submit: raw accolades plus chemistry is the week's score.
//   4. Lock: keep one player from this week for the rest of the season.
//
// Every step is a server call. An open pack is recorded server-side, so a
// refresh comes back to the same five cards, and a second pack can't be
// opened until one of them is taken.

import Link from 'next/link'
import { useCallback, useState } from 'react'
import {
  PACK_TIER_COLOR,
  PACK_TIER_LABEL,
  PHASE_LABEL,
  RARITY_LOOK,
  SLOTS,
  chemistryFor,
  chemistryPreview,
  lineupScore,
  tierFor,
  type Player,
} from '@/lib/packEmpire/rules'
import type { DraftView } from '@/lib/packEmpire/league'
import { Field, LockGlyph, type SlotView } from '../cards'
import { ImmortalFlash, PackStage, ScoreStrip, usePackStage, useStripOffset } from '../stage'

async function post(body: Record<string, unknown>): Promise<DraftView> {
  const res = await fetch('/api/games/pack-empire/league/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = await res.json().catch(() => null)
  if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Something went wrong.')
  return out.view as DraftView
}

function Bonds({ chem }: { chem: NonNullable<DraftView['chemistry']> }) {
  if (!chem.bonds.length) return <p className="pe-note">No chemistry either way this week.</p>
  return (
    <div className="pe-chem">
      {chem.bonds.map((b, i) => (
        <div key={i} className={`pe-bond ${b.type}`}>
          <span>
            {b.aName} and {b.bName}
            <small>{b.reason}</small>
          </span>
          <b>
            {b.points > 0 ? '+' : ''}
            {b.points}
          </b>
        </div>
      ))}
    </div>
  )
}

export function LeagueDraft({ leagueId, initial }: { leagueId: string; initial: DraftView }) {
  const [view, setView] = useState<DraftView>(initial)
  const [boost, setBoost] = useState<number | null>(null)
  const [lockPick, setLockPick] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A pack left open before a refresh is waiting on the stage, face down.
  const { stage, flash, open, reveal, revealAll, pick, dismiss } = usePackStage(
    initial.status === 'drafting' && initial.openSlot != null && initial.openCards
      ? {
          slot: initial.openSlot,
          cards: initial.openCards,
          revealed: initial.openCards.map(() => false),
          pickedId: null,
          error: null,
          leaving: false,
        }
      : null
  )

  useStripOffset()

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true)
      setError(null)
      try {
        const v = await post({ id: leagueId, ...body })
        setView(v)
        return v
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong.')
        return null
      } finally {
        setBusy(false)
      }
    },
    [leagueId]
  )

  const roster = view.lineup.filter((p): p is Player => !!p)
  const filled = roster.length
  const score = lineupScore(view.lineup)
  const chem = chemistryFor(roster)
  const tier = tierFor(score + chem.total)
  const carried = new Set(view.carried)
  const tierColor = PACK_TIER_COLOR[view.tier]

  const openSlot = (i: number) => {
    if (stage || busy || view.lineup[i] || view.status !== 'drafting') return
    open(i, async () => {
      const v = await post({ id: leagueId, action: 'open', slot: i })
      setView(v)
      if (!v.openCards) throw new Error('That pack would not open.')
      return v.openCards
    })
  }

  const onCard = (i: number) => {
    if (!stage?.cards) return
    if (!stage.revealed[i]) {
      reveal(i)
      return
    }
    pick(i, async (card) => {
      const v = await post({ id: leagueId, action: 'pick', card: card.id })
      setView(v)
    })
  }

  const phaseLine =
    view.league.phase === 'regular' ? `Week ${view.league.week}` : PHASE_LABEL[view.league.phase]

  // ── Step 1: the boost ─────────────────────────────────────────
  if (view.status === 'not_started' && view.needsBoost) {
    const choose = (i: number) => {
      if (carried.has(i)) return
      setBoost(i)
    }
    return (
      <div className="pe-table">
        <div className="pe-table-head">
          <div className="pe-kicker">★ {phaseLine} · your boosted pack ★</div>
          <h1 className="pe-table-title" style={{ color: tierColor }}>
            {PACK_TIER_LABEL[view.tier]}
          </h1>
          <p className="pe-table-sub">
            Last week bought you a better pack. Choose the position it goes on before anything is dealt. The
            rest of your packs open standard.
          </p>
        </div>
        <div className="pe-turf">
          <Field
            lineup={view.lineup}
            view={(i): SlotView => ({
              clickable: !carried.has(i),
              dim: carried.has(i),
              badge: boost === i ? { text: 'BOOST', color: tierColor } : null,
              glow: boost === i ? 'boost' : null,
              tone: carried.has(i) ? 'locked' : boost === i ? 'boosted' : null,
              flag: carried.has(i) ? { text: 'LOCKED', color: '#c8a020' } : null,
            })}
            onSlot={choose}
          />
        </div>
        <div className="pe-recap-actions">
          <button
            type="button"
            className="pe-btn"
            disabled={boost == null || busy}
            onClick={() => act({ action: 'begin', boostSlot: boost })}
          >
            {boost == null ? 'Tap a slot' : `Boost the ${SLOTS[boost].label.toLowerCase()} pack`}
          </button>
          <button type="button" className="pe-btn pe-btn--quiet" disabled={busy} onClick={() => act({ action: 'begin', boostSlot: -1 })}>
            Open everything standard
          </button>
        </div>
        {error && <div className="pe-error" style={{ maxWidth: 560, margin: '1rem auto 0' }}>{error}</div>}
      </div>
    )
  }

  // ── Steps 3 and 4: in, and the keeper ─────────────────────────
  if (view.status === 'submitted') {
    const lockable = view.canLock
    return (
      <div className="pe-table">
        <div className="pe-recap" style={{ '--tc': tierFor(view.finalScore ?? 0).color } as React.CSSProperties}>
          <div className="pe-kicker">§ {phaseLine} · your lineup is in</div>
          <div className="pe-recap-tier">{tierFor(view.finalScore ?? 0).label}</div>
          <div className="pe-recap-score">{(view.finalScore ?? 0).toLocaleString()}</div>
          <div className="pe-recap-lbl pe-note">
            {(view.draftScore ?? 0).toLocaleString()} accolades{' '}
            {(view.chemistry?.total ?? 0) >= 0 ? '+' : '−'} {Math.abs(view.chemistry?.total ?? 0).toLocaleString()} chemistry
          </div>
          <p className="pe-recap-post">
            Nobody else sees it until the commissioner closes the week.
          </p>
        </div>

        {lockable ? (
          <div className="pe-panel" style={{ marginBottom: '1.2rem' }}>
            <div className="pe-kicker">Lock a player</div>
            <div className="pe-panel-title">Who do you keep for the season?</div>
            <p className="pe-panel-text" style={{ marginBottom: '0.9rem' }}>
              He fills his slot every week from here on and that pack never has to be opened again. You get one
              lock a week, and it can&apos;t be undone.
            </p>
            <div className="pe-lock-grid">
              {roster
                .filter((p) => !view.lockedIds.includes(p.id))
                .sort((a, b) => b.score - a.score)
                .map((p) => {
                  const rc = RARITY_LOOK[p.rarity]
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`pe-lock-opt${lockPick === p.id ? ' on' : ''}`}
                      style={{ '--rc': rc.color } as React.CSSProperties}
                      onClick={() => setLockPick(p.id)}
                    >
                      <span className="pe-lock-pos">{p.pos}</span>
                      <span className="pe-lock-name">{p.name}</span>
                      <span className="pe-lock-score">{p.score.toLocaleString()}</span>
                    </button>
                  )
                })}
            </div>
            <div className="pe-recap-actions" style={{ justifyContent: 'flex-start' }}>
              <button
                type="button"
                className="pe-btn"
                disabled={!lockPick || busy}
                onClick={() => act({ action: 'lock', player: lockPick })}
              >
                <LockGlyph />
                Lock him
              </button>
            </div>
          </div>
        ) : (
          <div className="pe-recap-actions" style={{ marginBottom: '1.2rem' }}>
            <Link href={`/games/pack-empire/league/${leagueId}/`} className="pe-btn">
              Back to the league
            </Link>
          </div>
        )}
        {error && <div className="pe-error" style={{ marginBottom: '1rem' }}>{error}</div>}

        <div className="pe-recap-grid">
          <div className="pe-turf">
            <Field
              lineup={view.lineup}
              view={(i): SlotView => {
                const p = view.lineup[i]
                const locked = !!p && (view.lockedIds.includes(p.id) || view.locked === p.id)
                return { clickable: false, flag: locked ? { text: 'LOCKED', color: '#c8a020' } : null, tone: locked ? 'locked' : null }
              }}
            />
          </div>
          <div className="pe-panel">
            <div className="pe-kicker">Chemistry</div>
            {view.chemistry && <Bonds chem={view.chemistry} />}
          </div>
        </div>
      </div>
    )
  }

  // ── Step 2: the packs ─────────────────────────────────────────
  const fieldView = (i: number): SlotView => {
    const isCarried = carried.has(i)
    const isBoost = view.boostedSlot === i && view.tier !== 'standard_pack'
    return {
      clickable: !stage && !busy && !view.lineup[i] && view.status === 'drafting',
      opening: stage?.slot === i,
      badge: isBoost && !view.lineup[i] ? { text: PACK_TIER_LABEL[view.tier].toUpperCase(), color: tierColor } : null,
      glow: isBoost && !view.lineup[i] ? 'boost' : null,
      tone: isCarried ? 'locked' : isBoost ? 'boosted' : null,
      flag: isCarried ? { text: 'LOCKED', color: '#c8a020' } : null,
    }
  }

  const toOpen = SLOTS.length - filled

  return (
    <div className="pe-table">
      {flash && <ImmortalFlash />}
      <ScoreStrip
        score={score + chem.total}
        filled={filled}
        tier={tier}
        extra={{ value: `${chem.total >= 0 ? '+' : ''}${chem.total}`, label: 'Chemistry' }}
      />

      {view.status === 'drafting' && toOpen > 0 && (
        <div className="pe-banner">
          <span>
            {phaseLine}: <b>{toOpen}</b> pack{toOpen === 1 ? '' : 's'} to open
            {view.carried.length ? `, ${view.carried.length} locked in` : ''}.
            {view.boostedSlot != null && view.boostedSlot >= 0 && !view.lineup[view.boostedSlot]
              ? ` Your ${PACK_TIER_LABEL[view.tier]} is on the ${SLOTS[view.boostedSlot].label.toLowerCase()}.`
              : ''}
          </span>
        </div>
      )}

      {error && <div className="pe-error" style={{ maxWidth: 560, margin: '0 auto 1rem' }}>{error}</div>}

      <div className="pe-turf">
        <Field lineup={view.lineup} view={fieldView} onSlot={openSlot} />
      </div>

      {view.status === 'drafting' && toOpen === 0 && (
        <div className="pe-panel" style={{ marginTop: '1.2rem' }}>
          <div className="pe-kicker">Ready</div>
          <div className="pe-panel-title">
            {score.toLocaleString()} accolades, {chem.total >= 0 ? '+' : '−'}
            {Math.abs(chem.total).toLocaleString()} chemistry
          </div>
          <Bonds chem={chem} />
          <div className="pe-recap-actions" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="pe-btn" disabled={busy} onClick={() => act({ action: 'submit' })}>
              Submit {(score + chem.total).toLocaleString()}
            </button>
          </div>
        </div>
      )}

      {stage && (
        <PackStage
          stage={stage}
          tag={
            view.boostedSlot === stage.slot && view.tier !== 'standard_pack'
              ? { text: PACK_TIER_LABEL[view.tier], color: tierColor }
              : null
          }
          onCard={onCard}
          onRevealAll={revealAll}
          onDismiss={dismiss}
          chemFor={(p) => chemistryPreview(p, roster)}
        />
      )}
    </div>
  )
}
