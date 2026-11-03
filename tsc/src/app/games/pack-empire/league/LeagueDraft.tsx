'use client'

// A League Mode week, start to finish:
//
//   1. The Standings Pack: last week's finish set how good it is; pick the slot
//      it goes on before a single pack is dealt. Locks that still hold their
//      slots stand in them, and any of them can be let go here first.
//   2. Packs: one for every slot not locked. The week's twist is up top and
//      marked on the cards it touches. With a mulligan (the bottom half of the
//      table gets one), one opened pack can go back for a fresh one. The bottom
//      quarter also has the redraft: once every pack is open, one slot goes
//      back and gets a fresh pack.
//   3. Submit: the cards under the twist, plus chemistry.
//   4. Lock: keep one man from this week, or pass. He holds his slot for the
//      next LOCK_WEEKS weeks. Either way the league sees this team is done,
//      and this team can open the lineups of everyone else who is.
//
// Every step is a server call. An open pack is kept server-side, so a refresh
// comes back to the same five cards, and a second pack can't be opened until
// one of them is taken.

import Link from 'next/link'
import { useCallback, useState } from 'react'
import { ruleChip } from '@/lib/packEmpire/dayRules'
import { weekChemPreview, weekScore } from '@/lib/packEmpire/leagueWeek'
import {
  LOCK_WEEKS,
  PACK_TIER_COLOR,
  PACK_TIER_LABEL,
  PHASE_LABEL,
  RARITY_LOOK,
  SLOTS,
  tierFor,
  type Player,
} from '@/lib/packEmpire/rules'
import type { DraftView } from '@/lib/packEmpire/league'
import { Field, LineupSheet, LockGlyph, type SlotView } from '../cards'
import { DraftReport } from '../report'
import { PackStage, ScoreStrip, restoredStage, usePackStage, useStripOffset } from '../stage'

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

function signed(n: number): string {
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toLocaleString()}`
}

function RuleBar({ rule }: { rule: DraftView['rule'] }) {
  if (!rule) return null
  return (
    <div className="pe-rulebar">
      <span className="pe-rulebar-tag">{rule.title}</span>
      <span>{rule.line}</span>
    </div>
  )
}

export function LeagueDraft({ leagueId, initial }: { leagueId: string; initial: DraftView }) {
  const [view, setView] = useState<DraftView>(initial)
  const [slotPick, setSlotPick] = useState<number | null>(null)
  const [lockPick, setLockPick] = useState<string | null>(null)
  const [letGo, setLetGo] = useState<string | null>(null)
  const [redrafting, setRedrafting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A pack left open before a refresh is waiting on the stage, face down.
  const { stage, landing, open, tear, reveal, revealAll, skip, pick, dismiss, settle } = usePackStage(
    initial.status === 'drafting' && initial.openSlot != null && initial.openCards
      ? restoredStage(initial.openSlot, initial.openCards)
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
  // What the strip shows: a card in the air hasn't landed, chemistry and all.
  const settled = settle(view.lineup)
  const filled = settled.filter(Boolean).length
  const live = weekScore(settled, view.boostedSlot, view.ruleId)
  const tier = tierFor(live.total)
  const carried = new Set(view.carried)
  const packColor = PACK_TIER_COLOR[view.tier]
  const packLabel = PACK_TIER_LABEL[view.tier]
  const regular = view.league.phase === 'regular'
  const phaseLine = regular ? `Week ${view.league.week}` : PHASE_LABEL[view.league.phase]

  const openSlot = (i: number) => {
    if (redrafting) {
      redraft(i)
      return
    }
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

  // The open pack goes back and a fresh one comes up in its place, torn open
  // like any other.
  const canMulligan =
    view.mulligan.has && view.mulligan.usedOn == null && !!stage?.cards && !stage.pickedId && stage.slot === view.openSlot
  const mulligan = () => {
    if (!stage || !canMulligan) return
    open(stage.slot, async () => {
      const v = await post({ id: leagueId, action: 'mulligan' })
      setView(v)
      if (!v.openCards) throw new Error('That pack would not go back.')
      return v.openCards
    })
  }

  // The redraft: a filled slot goes back, and its fresh pack opens like any other.
  const redraft = (i: number) => {
    if (stage || busy || !view.mulligan.canRedraft || carried.has(i) || !view.lineup[i]) return
    setRedrafting(false)
    open(i, async () => {
      const v = await post({ id: leagueId, action: 'redraft', slot: i })
      setView(v)
      if (!v.openCards) throw new Error('That slot would not go back.')
      return v.openCards
    })
  }

  // ── Step 1: the Standings Pack ────────────────────────────────
  if (view.status === 'not_started') {
    const choose = (i: number) => {
      if (carried.has(i)) return
      setSlotPick(i)
    }
    const firstWeek = regular && view.league.week === 1
    return (
      <div className="pe-table">
        <div className="pe-table-head">
          <div className="pe-kicker">{phaseLine} · your Standings Pack</div>
          <h1 className="pe-table-title" style={{ color: packColor }}>
            {packLabel}
          </h1>
          <p className="pe-table-sub">
            {firstWeek
              ? 'Everyone opens a Starter Pack in week one. Win a week and the next one is better.'
              : 'Where you finished last week bought this. Pick the position it goes on before anything is dealt.'}
          </p>
        </div>

        <RuleBar rule={view.rule} />

        {view.mulligan.has && (
          <p className="pe-lg-note">
            {view.mulligan.redraft ? (
              <>
                <b>Mulligan and redraft.</b> You&apos;re in the bottom quarter of the table: throw one opened pack back for
                a fresh one, and once every pack is open, send your weakest slot back for a fresh pack too.
              </>
            ) : (
              <>
                <b>Mulligan.</b> You&apos;re in the bottom half of the table, so this week you can throw one opened pack
                back for a fresh one.
              </>
            )}
          </p>
        )}

        {view.locks.length > 0 && (
          <div className="pe-panel pe-lg-locks">
            <div className="pe-kicker">Your locks</div>
            <ul>
              {view.locks.map((l) => (
                <li key={l.player.id}>
                  <span className="pe-lg-lock-pos">{SLOTS[l.slot].short}</span>
                  <span className="pe-lg-lock-name">{l.player.name}</span>
                  <span className="pe-lg-lock-score">{l.player.score.toLocaleString()}</span>
                  <span className="pe-lg-lock-until">{l.until ? `Through week ${l.until}` : 'All season'}</span>
                  {view.canRelease && (
                    <button
                      type="button"
                      className="pe-act pe-act--sm"
                      disabled={busy}
                      onClick={() => {
                        if (letGo !== l.player.id) {
                          setLetGo(l.player.id)
                          return
                        }
                        setLetGo(null)
                        act({ action: 'release', player: l.player.id })
                      }}
                    >
                      {letGo === l.player.id ? 'Tap again' : 'Let go'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pe-turf">
          <Field
            lineup={view.lineup}
            view={(i): SlotView => ({
              clickable: !carried.has(i),
              dim: carried.has(i),
              badge: slotPick === i ? { text: packLabel.toUpperCase(), color: packColor } : null,
              glow: slotPick === i ? 'boost' : null,
              tone: carried.has(i) ? 'locked' : slotPick === i ? 'boosted' : null,
              flag: carried.has(i) ? { text: 'LOCKED', color: '#c8a020' } : null,
            })}
            onSlot={choose}
          />
        </div>
        <div className="pe-recap-actions">
          <button
            type="button"
            className="pe-push"
            disabled={slotPick == null || busy}
            onClick={() => act({ action: 'begin', boostSlot: slotPick })}
          >
            {slotPick == null ? 'Tap a slot for it' : `Start the week, ${packLabel} at ${SLOTS[slotPick].short}`}
          </button>
        </div>
        {error && <div className="pe-error" style={{ maxWidth: 560, margin: '1rem auto 0' }}>{error}</div>}
      </div>
    )
  }

  // ── Steps 3 and 4: in, and the keeper ─────────────────────────
  if (view.status === 'submitted') {
    const full = view.lineup.filter((p): p is Player => !!p)
    const final = weekScore(view.lineup, view.boostedSlot, view.ruleId)
    const total = view.finalScore ?? final.total
    const until = view.league.week + LOCK_WEEKS
    return (
      <div className="pe-draft">
        <div className="pe-recap landed" style={{ '--tc': tierFor(total).color } as React.CSSProperties}>
          <div className="pe-kicker">
            § {phaseLine} · {view.rule ? view.rule.title : 'Your lineup is in'}
          </div>
          <div className="pe-recap-tier">{tierFor(total).label}</div>
          <div className="pe-recap-score">{total.toLocaleString()}</div>
          <div className="pe-daily-sum">
            <span>
              <b>{final.cards.toLocaleString()}</b> Cards
            </span>
            {final.ruleDelta !== 0 && (
              <span>
                <b>{signed(final.ruleDelta)}</b> Twist
              </span>
            )}
            <span>
              <b>{signed(final.chem.total)}</b> Chemistry
            </span>
          </div>
          <p className="pe-recap-post">
            Only teams whose lineups are in can see it before the week closes, and now you can see theirs.
          </p>
          {!view.canLock && (
            <div className="pe-recap-actions">
              <Link href={`/games/pack-empire/league/${leagueId}/`} className="pe-push">
                See who else is in
              </Link>
            </div>
          )}
        </div>

        {view.canLock && (
          <div className="pe-panel" style={{ marginBottom: '1.2rem' }}>
            <div className="pe-kicker">Lock a player</div>
            <div className="pe-panel-title">Who do you keep?</div>
            <p className="pe-panel-text" style={{ marginBottom: '0.9rem' }}>
              He holds his slot through week {until}, so that pack doesn&apos;t get opened, then the slot opens again. A
              Canton holds his all season. One lock a week, and you can let him go before any draft.
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
                      <span className="pe-lock-name">
                        {p.name}
                        {p.rarity === 'canton' ? ' · all season' : ''}
                      </span>
                      <span className="pe-lock-score">{p.score.toLocaleString()}</span>
                    </button>
                  )
                })}
            </div>
            <div className="pe-recap-actions" style={{ justifyContent: 'flex-start' }}>
              <button
                type="button"
                className="pe-push"
                disabled={!lockPick || busy}
                onClick={() => act({ action: 'lock', player: lockPick })}
              >
                <LockGlyph />
                Lock him
              </button>
              <button type="button" className="pe-act" disabled={busy} onClick={() => act({ action: 'pass' })}>
                No lock this week
              </button>
            </div>
          </div>
        )}
        {error && <div className="pe-error" style={{ marginBottom: '1rem' }}>{error}</div>}

        <DraftReport
          lineup={full}
          chem={view.chemistry ?? final.chem}
          captain={null}
          counted={{ cards: final.cards, rule: final.ruleDelta !== 0 ? final.ruleDelta : null, total }}
          sheet={<LineupSheet name="Your Eleven" lineup={view.lineup} total={total} counted={final.counted} />}
        />
      </div>
    )
  }

  // ── Step 2: the packs ─────────────────────────────────────────
  const fieldView = (i: number): SlotView => {
    const isCarried = carried.has(i)
    const isPack = view.boostedSlot === i
    const redraftable = redrafting && !isCarried && !!view.lineup[i]
    return {
      clickable: redraftable || (!stage && !busy && !view.lineup[i] && view.status === 'drafting'),
      opening: stage?.slot === i,
      badge: isPack && !view.lineup[i] ? { text: packLabel.toUpperCase(), color: packColor } : null,
      glow: isPack && !view.lineup[i] ? 'boost' : null,
      tone: isCarried ? 'locked' : isPack ? 'boosted' : null,
      flag: isCarried
        ? { text: 'LOCKED', color: '#c8a020' }
        : view.mulligan.redraftOn === i
          ? { text: 'REDRAFT', color: '#7fd3fa' }
          : view.mulligan.usedOn === i
            ? { text: 'MULLIGAN', color: '#7fd3fa' }
            : null,
    }
  }

  const toOpen = SLOTS.length - filled
  const mullLeft = view.mulligan.has && view.mulligan.usedOn == null

  return (
    <div className="pe-table">
      <ScoreStrip
        score={live.total}
        filled={filled}
        tier={tier}
        extra={{ value: signed(live.chem.total), label: 'Chemistry' }}
      />

      <RuleBar rule={view.rule} />

      {view.status === 'drafting' && toOpen > 0 && (
        <div className="pe-banner">
          <span>
            {phaseLine}: <b>{toOpen}</b> pack{toOpen === 1 ? '' : 's'} to open
            {view.carried.length ? `, ${view.carried.length} locked in` : ''}.
            {view.boostedSlot != null && view.boostedSlot >= 0 && !view.lineup[view.boostedSlot]
              ? ` Your ${packLabel} is at ${SLOTS[view.boostedSlot].short}.`
              : ''}
            {mullLeft ? ' Mulligan ready.' : ''}
          </span>
        </div>
      )}

      {error && <div className="pe-error" style={{ maxWidth: 560, margin: '0 auto 1rem' }}>{error}</div>}

      <div className="pe-turf">
        <Field lineup={view.lineup} view={fieldView} onSlot={openSlot} landing={landing} />
      </div>

      {view.status === 'drafting' && toOpen === 0 && (
        <div className="pe-panel" style={{ marginTop: '1.2rem' }}>
          <div className="pe-kicker">Ready</div>
          <div className="pe-panel-title">
            {(live.cards + live.ruleDelta).toLocaleString()} from the cards, {signed(live.chem.total)} chemistry
          </div>
          {redrafting && (
            <p className="pe-panel-text" style={{ margin: '0.6rem 0 0' }}>
              Tap the slot to send back. Its card goes with it, and you open a fresh pack for that position.
            </p>
          )}
          <div className="pe-recap-actions" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="pe-push" disabled={busy || redrafting} onClick={() => act({ action: 'submit' })}>
              Submit {live.total.toLocaleString()}
            </button>
            {view.mulligan.canRedraft && (
              <button type="button" className="pe-act" disabled={busy} onClick={() => setRedrafting((r) => !r)}>
                {redrafting ? 'Keep them all' : 'Use your redraft'}
              </button>
            )}
          </div>
        </div>
      )}

      {stage && (
        <PackStage
          stage={stage}
          tag={view.boostedSlot === stage.slot ? { text: packLabel, color: packColor } : null}
          onCard={onCard}
          onRevealAll={revealAll}
          onDismiss={dismiss}
          onTear={tear}
          onSkip={skip}
          chemFor={(p) => weekChemPreview(view.ruleId, p, roster)}
          chipFor={(p) => ruleChip(view.ruleId, p)}
          clock={
            canMulligan ? (
              <button type="button" className="pe-act pe-act--sm pe-lg-mull" onClick={mulligan}>
                Mulligan: throw this pack back
              </button>
            ) : null
          }
        />
      )}
    </div>
  )
}
