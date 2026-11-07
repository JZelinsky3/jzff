'use client'

// Draft Day for a Season team (lib/packEmpire/season.ts), start to finish:
//
//   1. The Franchise Pack: tap the slot it goes on. It deals off the captain's
//      table, so it's the best pack you'll open all day.
//   2. The eleven: a League pack for every slot, opened in any order. Five cards,
//      keep one.
//   3. The bench: BENCH_PACKS wild packs, one position each, one card kept from
//      each. They start the season on the bench and sub in at their position.
//
// Every step is a server call and an open pack is kept server-side, so a refresh
// comes back to the same five cards.

import Link from 'next/link'
import { useCallback, useState } from 'react'
import { SLOTS, WILD_PACK_ART, chemistryFor, type Player } from '@/lib/packEmpire/rules'
import { BENCH_PACKS } from '@/lib/packEmpire/seasonRules'
import type { MySeason, SeasonView } from '@/lib/packEmpire/season'
import { Field, PackCard, type SlotView } from '../../cards'
import { PackStage, ScoreStrip, restoredStage, usePackStage, useStripOffset } from '../../stage'

type Out = { view: SeasonView; cards?: Player[] }

async function post(body: Record<string, unknown>): Promise<Out> {
  const res = await fetch('/api/games/pack-empire/season/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = await res.json().catch(() => null)
  if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Something went wrong.')
  return out as Out
}

const FRANCHISE_COLOR = '#42c0f8'

/** The bench pack's position: the first slot that position plays, for its art. */
const slotFor = (cards: Player[]) => Math.max(0, SLOTS.findIndex((s) => s.pool === cards[0]?.pos))

export function SeasonDraft({ leagueId, initial }: { leagueId: string; initial: MySeason }) {
  const [me, setMe] = useState<MySeason>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { stage, landing, open, tear, reveal, revealAll, skip, pick, dismiss, settle } = usePackStage(
    initial.openSlot != null && initial.openCards
      ? restoredStage(initial.openSlot, initial.openCards)
      : initial.benchOpen
        ? restoredStage(slotFor(initial.benchOpen), initial.benchOpen)
        : null
  )
  useStripOffset()

  const apply = (o: Out) => {
    if (o.view.me) setMe(o.view.me)
    return o
  }

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true)
      setError(null)
      try {
        return apply(await post({ id: leagueId, ...body }))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong.')
        return null
      } finally {
        setBusy(false)
      }
    },
    [leagueId]
  )

  const lineup = settle(me.lineup)
  const men = lineup.filter((p): p is Player => !!p)
  const chem = chemistryFor(men, true).total
  const value = men.reduce((n, p) => n + p.score, 0)
  const benchStep = me.step === 'bench'

  const tapSlot = (i: number) => {
    if (busy || stage) return
    if (me.step === 'franchise') {
      act({ action: 'franchise', slot: i })
      return
    }
    if (me.step !== 'packs' || me.lineup[i]) return
    open(i, async () => {
      const o = apply(await post({ id: leagueId, action: 'open', slot: i }))
      if (!o.cards) throw new Error('That pack would not open.')
      return o.cards
    })
  }

  const openBench = () => {
    if (busy || stage) return
    // The position isn't known until it's dealt; the stage takes any slot for the
    // rip and the cards say the rest.
    open(0, async () => {
      const o = apply(await post({ id: leagueId, action: 'benchOpen' }))
      if (!o.cards) throw new Error('That pack would not open.')
      return o.cards
    })
  }

  const onCard = (i: number) => {
    if (!stage?.cards) return
    if (!stage.revealed[i]) {
      reveal(i)
      return
    }
    if (benchStep) {
      // Nothing on the field to fly to: the card goes to the bench.
      pick(i, async (c) => void apply(await post({ id: leagueId, action: 'benchPick', card: c.id })), -1)
      return
    }
    pick(i, async (c) => void apply(await post({ id: leagueId, action: 'pick', card: c.id })))
  }

  const fieldView = (i: number): SlotView => {
    const isFranchise = me.franchise === i
    return {
      clickable: !busy && !stage && (me.step === 'franchise' || (me.step === 'packs' && !me.lineup[i])),
      opening: stage?.slot === i && !benchStep,
      badge: isFranchise && !me.lineup[i] ? { text: 'FRANCHISE', color: FRANCHISE_COLOR } : null,
      glow: isFranchise && !me.lineup[i] ? 'boost' : me.step === 'franchise' ? 'cap' : null,
      tone: isFranchise ? 'boosted' : null,
    }
  }

  const left = SLOTS.length - me.lineup.filter(Boolean).length

  if (me.step === 'season') {
    return (
      <div className="pe-table">
        <div className="pe-sn-done">
          <div className="pe-kicker">Draft Day · done</div>
          <h2 className="pe-sn-done-title">Your team is set.</h2>
          <p className="pe-panel-text">
            Eleven starters and {me.bench.length} on the bench. Eight games against the schedule, at your own pace.
          </p>
          <div className="pe-recap-actions">
            <Link href={`/games/pack-empire/league/season/${leagueId}/`} className="pe-btn">
              To The Season
            </Link>
          </div>
        </div>
        <div className="pe-turf">
          <Field lineup={me.lineup} view={() => ({ clickable: false })} />
        </div>
      </div>
    )
  }

  return (
    <div className="pe-table">
      <ScoreStrip score={value + chem} filled={men.length} tier={{ label: 'Draft Day', color: FRANCHISE_COLOR }} noTier extra={{ value: chem >= 0 ? `+${chem}` : `${chem}`, label: 'Chemistry' }} />

      <div className="pe-banner">
        <span>
          {me.step === 'franchise' && (
            <>
              <b>Place your Franchise Pack.</b> Tap the slot it goes on: it deals off the captain&apos;s table, the best pack you&apos;ll open today.
            </>
          )}
          {me.step === 'packs' && (
            <>
              <b>{left}</b> pack{left === 1 ? '' : 's'} to open. Five cards a pack, keep one.
            </>
          )}
          {benchStep && (
            <>
              <b>The bench:</b> {BENCH_PACKS - me.benchPacks} wild pack{BENCH_PACKS - me.benchPacks === 1 ? '' : 's'} left. Each is one position; the card you keep subs in there.
            </>
          )}
        </span>
      </div>

      {error && <div className="pe-error" style={{ maxWidth: 560, margin: '0 auto 1rem' }}>{error}</div>}

      <div className="pe-turf">
        <Field lineup={lineup} view={fieldView} onSlot={tapSlot} landing={benchStep ? null : landing} />
      </div>

      {benchStep && (
        <section className="pe-sn-benchday">
          <div className="pe-sn-head">
            <span className="pe-kicker">Bench</span>
            <span className="pe-sn-count">
              {me.benchPacks} of {BENCH_PACKS}
            </span>
          </div>
          {me.bench.length > 0 && (
            <div className="pe-sn-bench-row">
              {me.bench.map((p) => (
                <span key={p.id} className="pe-sn-bench-card">
                  <PackCard player={p} revealed index={0} still disabled />
                </span>
              ))}
            </div>
          )}
          <button type="button" className="pe-push" disabled={busy || !!stage} onClick={openBench}>
            Open Bench Pack {me.benchPacks + 1}
          </button>
        </section>
      )}

      {stage && (
        <PackStage
          stage={stage}
          tag={me.franchise === stage.slot && !benchStep ? { text: 'Franchise Pack', color: FRANCHISE_COLOR } : null}
          onCard={onCard}
          onRevealAll={revealAll}
          onDismiss={dismiss}
          onTear={tear}
          onSkip={skip}
          wild={benchStep ? { art: WILD_PACK_ART, first: 'Bench', rest: 'Pack' } : null}
          chemFor={(p) => {
            if (benchStep) return null
            const before = chemistryFor(men, true).total
            return chemistryFor([...men, p], true).total - before || null
          }}
        />
      )}
    </div>
  )
}
