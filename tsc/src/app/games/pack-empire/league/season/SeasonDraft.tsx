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
import { useCallback, useEffect, useState } from 'react'
import { RARITY_LOOK, SLOTS, WILD_PACK_ART, chemistryFor, seasonLabel, type Player } from '@/lib/packEmpire/rules'
import { BENCH_PACKS, PLAN_LOOK, draftGrade } from '@/lib/packEmpire/seasonRules'
import type { MySeason } from '@/lib/packEmpire/season'
import { Face, Field, FilledSlot, LeagueMark, type SlotView } from '../../cards'
import { PackStage, ScoreStrip, restoredStage, usePackStage, useStripOffset } from '../../stage'
import { Keepers } from './Keepers'
import { TeamPeek } from './TeamPeek'
import { seasonHref, seasonPost, type SeasonOut } from './api'
import { compareChip } from './compare'

/** Where a bench pack's card lands: past the eleven, so it never meets a slot. */
const BENCH_SLOT = 100
const PICKS = SLOTS.length + BENCH_PACKS
const ORDINAL = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`

export function SeasonDraft({ leagueId, initial, season = 1 }: { leagueId: string; initial: MySeason; season?: number }) {
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
  // The pick is in: each card kept is announced, Draft Day style, for a beat.
  const [called, setCalled] = useState<{ n: number; card: Player; bench: boolean } | null>(null)
  useEffect(() => {
    if (!called) return
    const t = window.setTimeout(() => setCalled(null), 2800)
    return () => window.clearTimeout(t)
  }, [called])

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
    const card = stage.cards[i]
    const n = me.lineup.filter(Boolean).length + me.benchPacks + 1
    const bench = kind === 'bench'
    pick(i, async (c) => void apply(await seasonPost({ id: leagueId, action: bench ? 'benchPick' : 'pick', card: c.id }))).then((ok) => {
      if (ok) setCalled({ n, card, bench })
    })
  }

  const fieldView = (i: number): SlotView => {
    const isFranchise = me.franchise === i
    const keeper = me.offseason?.kept.includes(me.lineup[i]?.id ?? '')
    return {
      flag: keeper ? { text: 'KEEPER', color: '#f4c06a' } : null,
      clickable: !busy && !stage && (me.step === 'franchise' || !me.lineup[i]),
      opening: kind === 'slot' && stage?.slot === i,
      // The Franchise patch: faint under the pointer while it's being placed.
      mark: isFranchise ? { color: me.special.color, label: me.special.label } : me.step === 'franchise' && !me.lineup[i] ? { color: me.special.color, label: me.special.label, ghost: true } : null,
      tone: isFranchise ? 'boosted' : null,
    }
  }

  const left = SLOTS.length - me.lineup.filter(Boolean).length

  if (me.step === 'keepers') return <Keepers me={me} season={season} busy={busy} onLock={(ids) => void act({ action: 'keepers', cards: ids })} />

  // The last pick finishes the team; the table stays up until its card has landed.
  if (me.step === 'season' && !stage && !called) return <DraftReport leagueId={leagueId} me={me} />

  return (
    <div className="pe-table">
      <ScoreStrip score={value + chem} filled={men.length} tier={{ label: 'Draft Day', color: me.special.color }} noTier extra={{ value: chem >= 0 ? `+${chem}` : `${chem}`, label: 'Chemistry' }} />

      <div className="pe-banner">
        <span>
          {me.step === 'franchise' ? (
            <>
              <b>Place your {me.special.label}.</b>{' '}
              {me.special.standings
                ? 'Your finish bought it. Tap the open spot it goes on.'
                : "Tap the slot it goes on: it deals off the captain's table, the best pack you'll open today."}
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

      {called && (
        <div className="pe-sn-call-in" key={called.n} role="status" style={{ '--rc': RARITY_LOOK[called.card.rarity].color } as React.CSSProperties}>
          <small>
            {ORDINAL(called.n)} pick of {PICKS} · {called.bench ? 'To the bench' : SLOTS.find((s) => s.pool === called.card.pos)?.label}
          </small>
          <b>The pick is in.</b>
          <span>
            <Face player={called.card} />
            <strong>{called.card.name}</strong>
            <em>
              {seasonLabel(called.card)} · {RARITY_LOOK[called.card.rarity].label} · {called.card.score.toLocaleString()}
            </em>
          </span>
        </div>
      )}

      {stage && (
        <PackStage
          stage={stage}
          tag={kind === 'slot' && me.franchise === stage.slot ? { text: me.special.label, color: me.special.color } : null}
          onCard={onCard}
          onRevealAll={revealAll}
          onDismiss={dismiss}
          onTear={tear}
          onSkip={skip}
          wild={kind === 'bench' ? { art: WILD_PACK_ART, first: 'Bench', rest: 'Pack' } : null}
          chipFor={kind === 'bench' ? (c) => compareChip(c, me.lineup) : undefined}
          clock={kind === 'bench' ? <TeamPeek lineup={me.lineup} /> : undefined}
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

/** Draft Day's last word: the grade, the best pick, the spot to fix, the bench,
    and what game one looks like. */
function DraftReport({ leagueId, me }: { leagueId: string; me: MySeason }) {
  const men = me.lineup.filter((p): p is Player => !!p)
  const value = men.reduce((n, p) => n + p.score, 0)
  const chem = chemistryFor(men, true).total
  const g = draftGrade(value)
  const best = men.reduce((a, b) => (b.score > a.score ? b : a), men[0])
  const weakAt = me.lineup.reduce((w, p, i) => (p && (!me.lineup[w] || p.score < me.lineup[w]!.score) ? i : w), 0)
  const weak = me.lineup[weakAt]
  const next = me.next
  const plan = next?.scouting.plans.find((r) => r.plan === next.scouting.best)
  return (
    <div className="pe-table">
      <section className="pe-sn-dr">
        <div className="pe-sn-dr-grade" data-grade={g.grade[0]}>
          <small>Draft grade</small>
          <b>{g.grade}</b>
        </div>
        <div className="pe-sn-dr-head">
          <div className="pe-kicker">Draft Day · The Report</div>
          <h2>{g.line}</h2>
          <div className="pe-sn-dr-nums">
            <span>
              <b>{value.toLocaleString()}</b>
              <small>Card value</small>
            </span>
            <span>
              <b>
                {chem >= 0 ? '+' : ''}
                {chem.toLocaleString()}
              </b>
              <small>Chemistry</small>
            </span>
            {me.profile && (
              <span>
                <b>{Math.round(me.profile.projected)}</b>
                <small>Points vs a plain defense, best call</small>
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="pe-sn-dr-picks">
        {best && (
          <div className="pe-sn-dr-pick" style={{ '--rc': RARITY_LOOK[best.rarity].color } as React.CSSProperties}>
            <small>Best pick</small>
            <Face player={best} />
            <b>{best.name}</b>
            <em>
              {RARITY_LOOK[best.rarity].label} · {best.score.toLocaleString()} · {me.styles[best.id]?.tag}
            </em>
          </div>
        )}
        {weak && (
          <div className="pe-sn-dr-pick" data-weak style={{ '--rc': RARITY_LOOK[weak.rarity].color } as React.CSSProperties}>
            <small>The spot to fix</small>
            <Face player={weak} />
            <b>
              {SLOTS[weakAt].short} · {weak.name}
            </b>
            <em>Point a game pack at {SLOTS[weakAt].pool === 'RB' ? 'HB' : SLOTS[weakAt].pool}, or trade up for him.</em>
          </div>
        )}
        {next && (
          <div className="pe-sn-dr-pick" data-next>
            <small>Game 1</small>
            <b>vs {next.defense.name}</b>
            <em>
              {next.line != null ? `${next.line} to beat. ` : ''}Coach likes {PLAN_LOOK[next.scouting.best].name}
              {plan ? `: about ${Math.round(plan.expected)} points.` : '.'}
            </em>
          </div>
        )}
      </div>

      <div className="pe-turf">
        <Field
          lineup={me.lineup}
          view={(i) => ({
            clickable: false,
            mark: me.franchise === i ? { color: me.special.color, label: me.special.label } : null,
            flag: me.offseason?.kept.includes(me.lineup[i]?.id ?? '') ? { text: 'KEEPER', color: '#f4c06a' } : null,
          })}
        />
      </div>

      <section className="pe-sn-bp pe-sn-bp--done" aria-label="Your bench">
        <div className="pe-sn-bp-head">
          <b>Your Bench</b>
          <small>Sub them in before any game. Every game pays another pack.</small>
        </div>
        <div className="pe-sn-bp-row">
          {me.bench.map((p) => (
            <div key={p.id} className="pe-sn-bp-spot">
              <FilledSlot player={p} />
              <span className="pe-sn-bp-tag">{me.styles[p.id]?.tag}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="pe-recap-actions pe-sn-dr-go">
        <Link href={seasonHref(leagueId)} className="pe-btn">
          To The Season
        </Link>
        <span className="pe-sn-dr-mark">
          <LeagueMark color={me.special.color} label={me.special.label} inline /> Your {me.special.label}
        </span>
      </div>
    </div>
  )
}
