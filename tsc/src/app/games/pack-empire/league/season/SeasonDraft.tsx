'use client'

// Draft Day for a Season team (lib/packEmpire/season.ts):
//
//   1. The Franchise Pack: tap the slot it goes on. It deals off the captain's
//      table, so it's the best pack you'll open all day.
//   2. The eleven: a pack for every slot, opened in any order. Five cards, keep
//      one. Some packs run hotter than others; nothing says which.
//   3. The bench: BENCH_PACKS packs with no position, five cards at five
//      positions, one kept from each. They sit under the field from the start
//      (Joey: not a surprise at the end) and open whenever you like.
//
// Every step is a server call and an open pack is kept server-side, so a refresh
// comes back to the same five cards.

import Link from 'next/link'
import { useCallback, useState } from 'react'
import { SLOTS, WILD_PACK_ART, chemistryFor, type Player } from '@/lib/packEmpire/rules'
import { BENCH_PACKS } from '@/lib/packEmpire/seasonRules'
import type { MySeason } from '@/lib/packEmpire/season'
import { Field, FilledSlot, type SlotView } from '../../cards'
import { PackStage, ScoreStrip, restoredStage, usePackStage, useStripOffset } from '../../stage'
import { seasonHref, seasonPost, type SeasonOut } from './api'

const FRANCHISE_COLOR = '#42c0f8'

/** Where a bench pack's card lands: past the eleven, so it never meets a slot. */
const BENCH_SLOT = 100

export function SeasonDraft({ leagueId, initial }: { leagueId: string; initial: MySeason }) {
  const [me, setMe] = useState<MySeason>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // What's on the stage: a slot's pack, or a bench pack.
  const [kind, setKind] = useState<'slot' | 'bench'>(initial.openSlot == null && initial.benchOpen ? 'bench' : 'slot')
  const { stage, landing, open, tear, reveal, revealAll, skip, pick, dismiss, settle } = usePackStage(
    initial.openSlot != null && initial.openCards
      ? restoredStage(initial.openSlot, initial.openCards)
      : initial.benchOpen
        ? restoredStage(BENCH_SLOT + initial.benchPacks, initial.benchOpen)
        : null
  )
  useStripOffset()

  const apply = (o: SeasonOut) => {
    if (o.view?.me) setMe(o.view.me)
    return o
  }

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true)
      setError(null)
      try {
        return apply(await seasonPost({ id: leagueId, ...body }))
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
  const benchLeft = BENCH_PACKS - me.benchPacks

  const tapSlot = (i: number) => {
    if (busy || stage) return
    if (me.step === 'franchise') {
      act({ action: 'franchise', slot: i })
      return
    }
    if (me.lineup[i]) return
    setKind('slot')
    open(i, async () => {
      const o = apply(await seasonPost({ id: leagueId, action: 'open', slot: i }))
      if (!o.cards) throw new Error('That pack would not open.')
      return o.cards
    })
  }

  const openBench = () => {
    if (busy || stage || benchLeft <= 0) return
    setKind('bench')
    open(BENCH_SLOT + me.benchPacks, async () => {
      const o = apply(await seasonPost({ id: leagueId, action: 'benchOpen' }))
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
    if (kind === 'bench') {
      pick(i, async (c) => void apply(await seasonPost({ id: leagueId, action: 'benchPick', card: c.id })))
      return
    }
    pick(i, async (c) => void apply(await seasonPost({ id: leagueId, action: 'pick', card: c.id })))
  }

  const fieldView = (i: number): SlotView => {
    const isFranchise = me.franchise === i
    return {
      clickable: !busy && !stage && (me.step === 'franchise' || !me.lineup[i]),
      opening: kind === 'slot' && stage?.slot === i,
      badge: isFranchise && !me.lineup[i] ? { text: 'FRANCHISE', color: FRANCHISE_COLOR } : null,
      glow: isFranchise && !me.lineup[i] ? 'boost' : me.step === 'franchise' ? 'cap' : null,
      tone: isFranchise ? 'boosted' : null,
    }
  }

  const left = SLOTS.length - me.lineup.filter(Boolean).length

  // The last pick finishes the team; the table stays up until its card has landed.
  if (me.step === 'season' && !stage) {
    return (
      <div className="pe-table">
        <div className="pe-sn-done">
          <div className="pe-kicker">Draft Day · done</div>
          <h2 className="pe-sn-done-title">Your team is set.</h2>
          <p className="pe-panel-text">Eleven starters and {me.bench.length} on the bench. Eight games against the schedule, at your own pace.</p>
          <div className="pe-recap-actions">
            <Link href={seasonHref(leagueId)} className="pe-btn">
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
          {me.step === 'franchise' ? (
            <>
              <b>Place your Franchise Pack.</b> Tap the slot it goes on: it deals off the captain&apos;s table, the best pack you&apos;ll open today.
            </>
          ) : left > 0 ? (
            <>
              <b>{left}</b> pack{left === 1 ? '' : 's'} on the field{benchLeft > 0 ? ` and ${benchLeft} on the bench` : ''}. Five cards a pack, keep one.
            </>
          ) : (
            <>
              <b>The eleven are in.</b> {benchLeft} bench pack{benchLeft === 1 ? '' : 's'} left.
            </>
          )}
        </span>
      </div>

      {error && <div className="pe-error" style={{ maxWidth: 560, margin: '0 auto 1rem' }}>{error}</div>}

      <div className="pe-turf">
        <Field lineup={lineup} view={fieldView} onSlot={tapSlot} landing={kind === 'slot' ? landing : null} />
      </div>

      <section className="pe-sn-bp" aria-label="Bench packs">
        <div className="pe-sn-bp-head">
          <b>Bench Packs</b>
          <small>Five cards, five positions. Keep one each, to sub in later.</small>
        </div>
        <div className="pe-sn-bp-row">
          {Array.from({ length: BENCH_PACKS }, (_, n) => {
            const kept = me.bench[n]
            const at = BENCH_SLOT + n
            const opening = kind === 'bench' && stage?.slot === at
            const nextUp = n === me.benchPacks && !opening
            return (
              <div key={n} className="pe-sn-bp-spot" data-pe-slot={at}>
                {kept ? (
                  <FilledSlot player={kept} landing={landing?.slot === at ? landing.phase : null} />
                ) : opening ? (
                  <div className="pe-fsl active">
                    <div className="pe-fsl-locked">
                      <div className="pe-fsl-pos-small">BENCH</div>
                      <div className="pe-fsl-opening">OPENING</div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={`pe-sn-bp-pack${nextUp ? ' up' : ''}`}
                    disabled={!nextUp || busy || !!stage}
                    onClick={openBench}
                    aria-label={`Open bench pack ${n + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={WILD_PACK_ART} alt="" draggable={false} />
                    <span>Bench {n + 1}</span>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {stage && (
        <PackStage
          stage={stage}
          tag={kind === 'slot' && me.franchise === stage.slot ? { text: 'Franchise Pack', color: FRANCHISE_COLOR } : null}
          onCard={onCard}
          onRevealAll={revealAll}
          onDismiss={dismiss}
          onTear={tear}
          onSkip={skip}
          wild={kind === 'bench' ? { art: WILD_PACK_ART, first: 'Bench', rest: 'Pack' } : null}
          chemFor={(p) => {
            if (kind === 'bench') return null
            const before = chemistryFor(men, true).total
            return chemistryFor([...men, p], true).total - before || null
          }}
        />
      )}
    </div>
  )
}
