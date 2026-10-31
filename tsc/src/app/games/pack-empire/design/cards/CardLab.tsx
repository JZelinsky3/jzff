'use client'

import { useEffect, useState } from 'react'
import { teamLogo, type Player } from '@/lib/packEmpire/rules'
import { useFace } from '../../faces'

export type Tier = 'common' | 'rare' | 'dynasty' | 'transcendent' | 'immortal' | 'pantheon'
export type LabCard = { tier: Tier; player: Player }

const TIER_LABEL: Record<Tier, string> = {
  common: 'Common',
  rare: 'Rare',
  dynasty: 'Dynasty',
  transcendent: 'Transcendent',
  immortal: 'Immortal',
  pantheon: 'Pantheon',
}

const CONCEPTS = [
  { key: 'foil', name: 'Foil Stock', line: 'Each rarity is a real material you could hold: matte paper, brushed steel, gold foil, holographic film, obsidian, pearl.' },
  { key: 'prime', name: 'Prime Time', line: 'Broadcast graphics in the team’s own colours, with the player breaking out of the frame. Rarity lives in the frame and the value block.' },
  { key: 'blackout', name: 'Blackout', line: 'One black slab where the number is the hero. A single line of light circles the card, and it speeds up and thickens by rarity.' },
] as const

type Concept = (typeof CONCEPTS)[number]['key']

/** Team colours, just for the cards on this page. */
const TEAM: Record<string, [string, string]> = {
  'Buffalo Bills': ['#00338d', '#c60c30'],
  'Chicago Bears': ['#0b162a', '#c83803'],
  'Carolina Panthers': ['#0085ca', '#101820'],
  'Cleveland Browns': ['#311d00', '#ff3c00'],
  'Kansas City Chiefs': ['#e31837', '#ffb81c'],
  'Baltimore Ravens': ['#241773', '#9e7c0c'],
}

/** The largest size a name fits at, off Barlow's rough letter widths in capitals. */
function fit(name: string, room: number, most: number): string {
  let width = 0
  for (const ch of name.toUpperCase()) width += 'MW'.includes(ch) ? 0.62 : "IJ.' -".includes(ch) ? 0.27 : 0.47
  return `${Math.min(most, room / width).toFixed(3)}em`
}

function stats(p: Player): { v: string; l: string }[][] {
  return p.accolades.slice(0, 2).map((line) =>
    line.split(' · ').map((part) => {
      const m = /^([\d,.]+)\s+(.+)$/.exec(part.trim())
      return { v: m?.[1] ?? part, l: (m?.[2] ?? '').replace('a game', 'ppg').toUpperCase() }
    })
  )
}

function Gem({ tier }: { tier: Tier }) {
  const points: Record<Tier, string> = {
    common: '12,4 20,12 12,20 4,12',
    rare: '12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5',
    dynasty: '12,2.5 14.8,9 22,9.6 16.5,14.2 18.2,21.5 12,17.6 5.8,21.5 7.5,14.2 2,9.6 9.2,9',
    transcendent: '12,1.5 14.2,7.2 19.8,4.2 16.8,9.8 22.5,12 16.8,14.2 19.8,19.8 14.2,16.8 12,22.5 9.8,16.8 4.2,19.8 7.2,14.2 1.5,12 7.2,9.8 4.2,4.2 9.8,7.2',
    immortal: '12,1 13.8,6.3 18.4,3.2 17.2,8.6 22.8,8.4 18.2,11.6 22.8,15.6 17.2,15.4 18.4,20.8 13.8,17.7 12,23 10.2,17.7 5.6,20.8 6.8,15.4 1.2,15.6 5.8,11.6 1.2,8.4 6.8,8.6 5.6,3.2 10.2,6.3',
    pantheon: '12,0.5 13.4,10.6 23.5,12 13.4,13.4 12,23.5 10.6,13.4 0.5,12 10.6,10.6',
  }
  return (
    <svg className="pc-gem" viewBox="0 0 24 24" aria-hidden>
      <polygon points={points[tier]} fill="currentColor" />
    </svg>
  )
}

/** Effects, all transform and opacity, mounted only for the tiers that earn them. */
function Under({ tier }: { tier: Tier }) {
  return (
    <>
      {(tier === 'transcendent' || tier === 'pantheon') && <span className="pc-holo" aria-hidden />}
      {(tier === 'pantheon' || tier === 'immortal') && (
        <span className="pc-rays" aria-hidden>
          <i />
        </span>
      )}
    </>
  )
}

function Over({ tier }: { tier: Tier }) {
  return (
    <>
      {tier !== 'common' && (
        <span className="pc-sheen" aria-hidden>
          <i />
        </span>
      )}
      {(tier === 'dynasty' || tier === 'pantheon') && (
        <span className="pc-sparks" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
      )}
      {(tier === 'immortal' || tier === 'pantheon') && (
        <span className="pc-embers" aria-hidden>
          {Array.from({ length: 7 }, (_, i) => (
            <i key={i} />
          ))}
        </span>
      )}
    </>
  )
}

function Foil({ card }: { card: LabCard }) {
  const { player: p, tier } = card
  const img = useFace(p)
  const logo = teamLogo(p)
  const [a, b] = stats(p)
  return (
    <div className="pa">
      <div className="pa-ground" />
      <Under tier={tier} />
      <div className="pa-year" aria-hidden>
        {p.year}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {img && <img className="pa-photo" src={img} alt="" draggable={false} />}
      <div className="pa-top">
        <span className="pa-pos">{p.pos}</span>
        <span className="pa-rar">
          <Gem tier={tier} />
          {TIER_LABEL[tier]}
        </span>
      </div>
      <div className="pa-plate">
        <div className="pa-id">
          <div className="pa-who">
            <div className="pa-name" style={{ fontSize: fit(p.name, 5.5, 0.92) }}>
              {p.name}
            </div>
            <div className="pa-val">{p.score.toLocaleString()}</div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo && <img className="pa-logo" src={logo} alt="" draggable={false} />}
        </div>
        <div className="pa-stats">
          {[...a, ...(b ?? [])].map((c, i) => (
            <span key={i}>
              <b>{c.v}</b>
              <em>{c.l}</em>
            </span>
          ))}
        </div>
      </div>
      <Over tier={tier} />
    </div>
  )
}

function Prime({ card }: { card: LabCard }) {
  const { player: p, tier } = card
  const img = useFace(p)
  const logo = teamLogo(p)
  const [a, b] = stats(p)
  const [one, two] = TEAM[p.team] ?? ['#222', '#555']
  const line = [...a.slice(0, 3)]
  const ppg = b?.find((c) => c.l === 'PPG')
  return (
    <div className="pb" style={{ '--c1': one, '--c2': two } as React.CSSProperties}>
      <div className="pb-frame">
        <div className="pb-ground" />
        <div className="pb-slash" />
        <Under tier={tier} />
        <div className="pb-year" aria-hidden>
          {p.year}
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {img && <img className="pb-photo" src={img} alt="" draggable={false} />}
      <div className="pb-corner">
        <span className="pb-pos">{p.pos}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo && <img className="pb-logo" src={logo} alt="" draggable={false} />}
      </div>
      <div className="pb-rar">
        <Gem tier={tier} />
      </div>
      <div className="pb-base">
        <div className="pb-namebar">
          <span style={{ fontSize: fit(p.name, 7.7, 1.04) }}>{p.name}</span>
        </div>
        <div className="pb-valbar">
          <div className="pb-val">{p.score.toLocaleString()}</div>
          <div className="pb-tier">{TIER_LABEL[tier]}</div>
        </div>
        <div className="pb-ticker">
          {line.map((c, i) => (
            <span key={i}>
              <b>{c.v}</b> {c.l}
            </span>
          ))}
          {ppg && (
            <span>
              <b>{ppg.v}</b> PPG
            </span>
          )}
        </div>
      </div>
      <Over tier={tier} />
    </div>
  )
}

function Blackout({ card }: { card: LabCard }) {
  const { player: p, tier } = card
  const img = useFace(p)
  const logo = teamLogo(p)
  const [a, b] = stats(p)
  const ppg = b?.find((c) => c.l === 'PPG')
  const games = b?.find((c) => c.l === 'G')
  return (
    <div className="pc3">
      <div className="pc3-ground" />
      <Under tier={tier} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {img && <img className="pc3-photo" src={img} alt="" draggable={false} />}
      <div className="pc3-fade" />
      <div className="pc3-head">
        <div className="pc3-val">{p.score.toLocaleString()}</div>
        <div className="pc3-sub">
          <span>
            {p.pos} · {p.year}
          </span>
          <span className="pc3-rar">
            <Gem tier={tier} />
            {TIER_LABEL[tier]}
          </span>
        </div>
      </div>
      <div className="pc3-foot">
        <div className="pc3-id">
          <div className="pc3-name" style={{ fontSize: fit(p.name, 6.1, 0.96) }}>
            {p.name}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo && <img className="pc3-logo" src={logo} alt="" draggable={false} />}
        </div>
        <div className="pc3-stats">
          {a.slice(0, 3).map((c, i) => (
            <span key={i}>
              <b>{c.v}</b>
              <em>{c.l}</em>
            </span>
          ))}
          {ppg && (
            <span>
              <b>{ppg.v}</b>
              <em>PPG</em>
            </span>
          )}
          {games && (
            <span>
              <b>{games.v}</b>
              <em>G</em>
            </span>
          )}
        </div>
      </div>
      <Over tier={tier} />
    </div>
  )
}

function lean(el: HTMLElement, e: React.PointerEvent) {
  if (e.pointerType !== 'mouse') return
  const r = el.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width
  const y = (e.clientY - r.top) / r.height
  const tilt = el.querySelector<HTMLElement>('.pc-lean')
  if (tilt) tilt.style.transform = `rotateX(${(0.5 - y) * 16}deg) rotateY(${(x - 0.5) * 20}deg)`
}

function Card({ concept, card, onOpen, size }: { concept: Concept; card: LabCard; onOpen?: () => void; size: string }) {
  const Face = concept === 'foil' ? Foil : concept === 'prime' ? Prime : Blackout
  const Tag = onOpen ? 'button' : 'div'
  return (
    <Tag
      {...(onOpen ? { type: 'button' as const, onClick: onOpen, 'aria-label': `Pull ${card.player.name}` } : {})}
      className={`pc pc--${concept} pc--${size}`}
      data-tier={card.tier}
      onPointerMove={(e: React.PointerEvent<HTMLElement>) => lean(e.currentTarget, e)}
      onPointerLeave={(e: React.PointerEvent<HTMLElement>) => e.currentTarget.querySelector<HTMLElement>('.pc-lean')?.style.removeProperty('transform')}
    >
      <span className="pc-lean">
        {(card.tier === 'transcendent' || card.tier === 'immortal' || card.tier === 'pantheon' || concept === 'blackout') && (
          <span className="pc-orbit" aria-hidden>
            <i />
          </span>
        )}
        <span className="pc-body">
          <Face card={card} />
        </span>
      </span>
    </Tag>
  )
}

/** The pull: the room goes dark, the card arrives the way its rarity earns. */
function Pull({ concept, card, onClose }: { concept: Concept; card: LabCard; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <button type="button" className="pl-stage" data-tier={card.tier} onClick={onClose} aria-label="Close">
      <span className="pl-veil" />
      <span className="pl-rays" aria-hidden>
        <i />
      </span>
      <span className="pl-ring" aria-hidden />
      <span className="pl-ring pl-ring--2" aria-hidden />
      <span className="pl-ring pl-ring--3" aria-hidden />
      <span className="pl-shards" aria-hidden>
        {Array.from({ length: 16 }, (_, i) => (
          <i key={i} style={{ '--a': `${i * 22.5}deg` } as React.CSSProperties} />
        ))}
      </span>
      <span className="pl-flash" aria-hidden />
      <span className="pl-card">
        <span className="pl-spin">
          <Card concept={concept} card={card} size="stage" />
        </span>
      </span>
      <span className="pl-name" data-tier={card.tier}>
        {TIER_LABEL[card.tier]}
      </span>
    </button>
  )
}

export function CardLab({ cards }: { cards: LabCard[] }) {
  const [concept, setConcept] = useState<Concept>('foil')
  const [open, setOpen] = useState<LabCard | null>(null)
  const active = CONCEPTS.find((c) => c.key === concept) ?? CONCEPTS[0]
  return (
    <div className="lab">
      <header className="lab-head">
        <div className="lab-kicker">Pack Empire · Dev Only</div>
        <h1>Card Lab</h1>
        <p>Three directions for the cards, plus a new tier above Immortal for 5,500+. Tap any card to play its pull.</p>
      </header>

      <div className="lab-tabs" role="tablist" aria-label="Concept">
        {CONCEPTS.map((c, i) => (
          <button key={c.key} type="button" role="tab" aria-selected={concept === c.key} className={concept === c.key ? 'on' : ''} onClick={() => setConcept(c.key)}>
            <em>{i + 1}</em>
            {c.name}
          </button>
        ))}
      </div>
      <p className="lab-line">{active.line}</p>

      <section className="lab-row" aria-label="Every tier">
        {cards.map((card) => (
          <Card key={card.tier} concept={concept} card={card} size="hero" onOpen={() => setOpen(card)} />
        ))}
      </section>

      <h2 className="lab-h2">At Table Size</h2>
      <section className="lab-row lab-row--small" aria-label="Every tier at the size a pack deals them">
        {cards.map((card) => (
          <Card key={card.tier} concept={concept} card={card} size="table" />
        ))}
      </section>

      {open && <Pull concept={concept} card={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
