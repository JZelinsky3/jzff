'use client'

// The pack waiting on a Season team: the one a game paid, or a trade's. It says
// what earned it and what it usually holds (Joey, 2026-11-07: not really sure
// what you're getting it for), and a game's pack can be pointed first at a play
// style or a position, never both, so two or three of its five fit. Opening it
// deals it on the server; every card shows what it would replace, with your
// starters along the bottom. The card kept goes to the bench.

import { useState } from 'react'
import { RARITIES, RARITY_LOOK, WILD_PACK_ART, surname, type Player, type Rarity } from '@/lib/packEmpire/rules'
import { BENCH_MAX, FOCUS_POSITIONS, REWARD_LOOK, STYLE_LOOK, type PackFocus, type PackStyle, type RewardTier } from '@/lib/packEmpire/seasonRules'
import type { MySeason, SeasonView } from '@/lib/packEmpire/season'
import { PackStage, usePackStage } from '../../stage'
import { seasonPost } from './api'
import { compareChip } from './compare'
import { TeamPeek } from './TeamPeek'

/** What a tier's pack usually holds, off its odds (seasonPacks REWARD_TABLE). */
const HOLDS: Record<RewardTier, string> = {
  league: 'Its best card is usually a rare, sometimes a dynasty.',
  starter: "Dealt off the captain's table: its best card is usually a dynasty or a transcendent.",
  rising: 'Its best card is usually a transcendent, and Immortals turn up.',
}

const POS_LABEL: Record<string, string> = { QB: 'QB', RB: 'HB', WR: 'WR', TE: 'TE', OT: 'OT', OG: 'OG', C: 'C' }

type Props = {
  leagueId: string
  me: MySeason
  busy: string | null
  act: (key: string, body: Record<string, unknown>) => Promise<boolean>
  onView: (v: SeasonView) => void
}

export function SeasonPack({ leagueId, me, busy, act, onView }: Props) {
  const p = me.pending!
  const full = me.bench.length >= BENCH_MAX
  const [focus, setFocus] = useState<PackFocus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { stage, open, tear, reveal, revealAll, skip, pick, dismiss } = usePackStage()

  const openIt = () => {
    setError(null)
    open(0, async () => {
      if (p.opened) return p.cards
      const { cards } = await seasonPost({ id: leagueId, action: 'rewardOpen', focus })
      if (!cards?.length) throw new Error('That pack would not open.')
      return cards
    })
  }

  const onCard = (i: number) => {
    if (!stage?.cards) return
    if (!stage.revealed[i]) {
      reveal(i)
      return
    }
    // The view only changes once the card has left the stage: swapping it in
    // mid-pick would take the stage down under the animation.
    let next: SeasonView | null = null
    pick(
      i,
      async (c: Player) => {
        next = (await seasonPost({ id: leagueId, action: 'keep', card: c.id })).view
      },
      -1
    ).then((ok) => {
      if (ok && next) onView(next)
    })
  }

  const before = p.trade ? RARITIES[RARITIES.indexOf(p.tier as Rarity) - 1] : null
  const why = p.trade
    ? `Three ${RARITY_LOOK[before ?? 'common'].label.toLowerCase()}s off your bench for three ${RARITY_LOOK[p.tier as Rarity].label.toLowerCase()}s to choose from.`
    : `${p.points != null && p.line != null ? `You scored ${p.points} against ${p.line}. ` : ''}${REWARD_LOOK[p.tier as RewardTier].line}`
  const holds = p.trade ? `Every card in it is a ${RARITY_LOOK[p.tier as Rarity].label}, at any position.` : HOLDS[p.tier as RewardTier]
  const pickStyle = (s: PackStyle) => setFocus(focus?.kind === 'style' && focus.style === s ? null : { kind: 'style', style: s })
  const pickPos = (pos: (typeof FOCUS_POSITIONS)[number]) => setFocus(focus?.kind === 'pos' && focus.pos === pos ? null : { kind: 'pos', pos })

  return (
    <section className="pe-sn-pk" style={{ '--rw': p.color } as React.CSSProperties}>
      <div className="pe-sn-pk-art" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={WILD_PACK_ART} alt="" draggable={false} />
        <span>{p.trade ? 'Trade' : p.label.split(' ')[0]}</span>
      </div>
      <div className="pe-sn-pk-body">
        <small className="pe-sn-pk-kick">{p.trade ? 'Your trade went through' : `Game ${p.week} paid a pack`}</small>
        <h2>{p.label}</h2>
        <p className="pe-sn-pk-why">{why}</p>
        <p className="pe-sn-pk-holds">{holds}</p>

        {!p.opened && !p.trade && (
          <div className="pe-sn-pk-focus">
            <small>Point it somewhere (optional): two or three of the five will fit</small>
            <div className="pe-sn-pk-row" role="group" aria-label="Play style">
              <i>Style</i>
              {(Object.keys(STYLE_LOOK) as PackStyle[]).map((s) => (
                <button key={s} type="button" aria-pressed={focus?.kind === 'style' && focus.style === s} onClick={() => pickStyle(s)}>
                  {STYLE_LOOK[s].name}
                </button>
              ))}
            </div>
            <div className="pe-sn-pk-row" role="group" aria-label="Position">
              <i>Position</i>
              {FOCUS_POSITIONS.map((pos) => (
                <button key={pos} type="button" aria-pressed={focus?.kind === 'pos' && focus.pos === pos} onClick={() => pickPos(pos)}>
                  {POS_LABEL[pos]}
                </button>
              ))}
            </div>
          </div>
        )}

        {full && !p.trade ? (
          <>
            <p className="pe-sn-pk-why">Your bench is full ({BENCH_MAX}). Let one go to make room, or pass on this pack.</p>
            <div className="pe-sn-release">
              {me.bench.map((b) => (
                <button key={b.id} type="button" className="pe-act pe-act--sm" disabled={!!busy} onClick={() => act('release', { action: 'release', bench: b.id })}>
                  Let {surname(b.name)} go
                </button>
              ))}
            </div>
            <button type="button" className="pe-act" disabled={!!busy} onClick={() => act('keep', { action: 'keep', card: null })}>
              Pass On This Pack
            </button>
          </>
        ) : (
          <button type="button" className="pe-push pe-sn-pk-go" disabled={!!busy || !!stage} onClick={openIt}>
            {p.opened ? 'Back To The Pack' : focus ? `Open It: ${focus.kind === 'style' ? STYLE_LOOK[focus.style].name : POS_LABEL[focus.pos]}` : 'Open It'}
          </button>
        )}
        {error && <div className="pe-error">{error}</div>}
      </div>
      {stage && (
        <PackStage
          stage={stage}
          tag={{ text: p.label, color: p.color }}
          onCard={onCard}
          onRevealAll={revealAll}
          onDismiss={dismiss}
          onTear={tear}
          onSkip={skip}
          wild={{ art: WILD_PACK_ART, first: p.trade ? 'Trade' : p.label.split(' ')[0], rest: 'Pack' }}
          chipFor={(c) => compareChip(c, me.lineup)}
          clock={<TeamPeek lineup={me.lineup} />}
        />
      )}
    </section>
  )
}
