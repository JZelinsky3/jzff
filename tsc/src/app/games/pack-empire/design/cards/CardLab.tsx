'use client'

import { useCallback, useEffect, useState } from 'react'
import { PACK_ART, teamLogo, type Player } from '@/lib/packEmpire/rules'
import { CantonPull, Enshrinement } from '../../canton'
import { useFace } from '../../faces'
import { SealedPack } from '../../rip'

export type Tier = 'common' | 'rare' | 'dynasty' | 'transcendent' | 'immortal' | 'canton'
/** `serial` is [the number you pulled, how many of this card exist]: Canton, binder. */
export type LabCard = { tier: Tier; player: Player; serial?: [number, number] }

const TIER_LABEL: Record<Tier, string> = {
  common: 'Common',
  rare: 'Rare',
  dynasty: 'Dynasty',
  transcendent: 'Transcendent',
  immortal: 'Immortal',
  canton: 'Canton',
}

const CONCEPTS = [
  { key: 'foil', name: 'Foil Stock', line: 'The standard card. Each rarity is a real material you could hold: paper, polished steel, polished gold, deep space, poured emerald glass, pearl.' },
  { key: 'prime', name: 'Prime Time', line: 'Saved for a future game or mode. Broadcast graphics in the team’s own colours, with the player breaking out of the frame.' },
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
  'New Orleans Saints': ['#101820', '#d3bc8d'],
  'Seattle Seahawks': ['#002244', '#69be28'],
  'Jacksonville Jaguars': ['#006778', '#d7a22a'],
  'Los Angeles Chargers': ['#0080c6', '#ffc20e'],
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

const SPARKLE = 'M12 .8C13.6 6.7 17.3 10.4 23.2 12 17.3 13.6 13.6 17.3 12 23.2 10.4 17.3 6.7 13.6.8 12 6.7 10.4 10.4 6.7 12 .8Z'

/** Ideas for Canton's shape, shown big on the page so they can be compared. */
const SHAPES: { name: string; art: React.ReactNode }[] = [
  { name: 'Thick Sparkle', art: <path d={SPARKLE} fill="currentColor" /> },
  {
    name: 'Football',
    art: (
      <>
        <path d="M3.2 20.8C2.2 12.6 12.6 2.2 20.8 3.2 21.8 11.4 11.4 21.8 3.2 20.8Z" fill="currentColor" />
        <path d="M8.6 15.4 15.4 8.6M10 10.2l3.8 3.8M11.8 8.6l3.6 3.6M8.6 11.8l3.6 3.6" stroke="#14100a" strokeWidth="1.15" strokeLinecap="round" fill="none" />
      </>
    ),
  },
  { name: 'Crown', art: <path d="M3 20h18l1.6-12.6-6 4.4L12 3.6 7.4 11.8l-6-4.4L3 20Z" fill="currentColor" /> },
  {
    name: 'Cut Diamond',
    art: (
      <>
        <path d="M6.2 3.5h11.6L23 9.8 12 21.5 1 9.8l5.2-6.3Z" fill="currentColor" />
        <path d="M1.6 9.8h20.8M8.4 9.8 12 21M15.6 9.8 12 21M8.4 9.8l3.6-6.2 3.6 6.2M6.2 3.5l2.2 6.3M17.8 3.5l-2.2 6.3" stroke="#14100a" strokeWidth=".8" fill="none" />
      </>
    ),
  },
]

function Gem({ tier }: { tier: Tier }) {
  const points: Record<Tier, string> = {
    common: '12,4 20,12 12,20 4,12',
    rare: '12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5',
    dynasty: '12,2.5 14.8,9 22,9.6 16.5,14.2 18.2,21.5 12,17.6 5.8,21.5 7.5,14.2 2,9.6 9.2,9',
    transcendent: '12,1.5 14.2,7.2 19.8,4.2 16.8,9.8 22.5,12 16.8,14.2 19.8,19.8 14.2,16.8 12,22.5 9.8,16.8 4.2,19.8 7.2,14.2 1.5,12 7.2,9.8 4.2,4.2 9.8,7.2',
    immortal: '12,1 13.8,6.3 18.4,3.2 17.2,8.6 22.8,8.4 18.2,11.6 22.8,15.6 17.2,15.4 18.4,20.8 13.8,17.7 12,23 10.2,17.7 5.6,20.8 6.8,15.4 1.2,15.6 5.8,11.6 1.2,8.4 6.8,8.6 5.6,3.2 10.2,6.3',
    canton: '',
  }
  return (
    <svg className="pc-gem" viewBox="0 0 24 24" aria-hidden>
      {tier === 'canton' ? (
        <path d={SPARKLE} fill="currentColor" />
      ) : (
        <polygon points={points[tier]} fill="currentColor" />
      )}
    </svg>
  )
}

/** Effects, all transform and opacity, mounted only for the tiers that earn them. */
function Under({ tier, standard = false }: { tier: Tier; standard?: boolean }) {
  return (
    <>
      {((tier === 'transcendent' && !standard) || tier === 'canton') && <span className="pc-holo" aria-hidden />}
      {standard && tier === 'transcendent' && (
        <>
          <span className="pc-nebula" aria-hidden />
          <span className="pc-stars" aria-hidden>
            <i />
          </span>
          <span className="pc-shoot" aria-hidden>
            <i />
            <i />
          </span>
        </>
      )}
      {standard && (tier === 'immortal' || tier === 'canton') && (
        <span className="pc-surge" aria-hidden>
          <i />
        </span>
      )}
      {standard && tier === 'immortal' && (
        <>
          <span className="pc-smoke" aria-hidden>
            <i />
          </span>
        </>
      )}
      {(tier === 'canton' || (tier === 'immortal' && !standard)) && (
        <span className="pc-rays" aria-hidden>
          <i />
        </span>
      )}
    </>
  )
}

function Over({ tier, standard = false }: { tier: Tier; standard?: boolean }) {
  return (
    <>
      {tier !== 'common' && !(standard && tier === 'rare') && (
        <span className="pc-sheen" aria-hidden>
          <i />
        </span>
      )}
      {(tier === 'dynasty' || tier === 'canton' || (standard && tier === 'transcendent')) && (
        <span className="pc-sparks" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
      )}
      {(tier === 'immortal' || (tier === 'canton' && !standard)) && (
        <span className="pc-embers" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
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
  const charged = tier === 'transcendent' || tier === 'canton'
  return (
    <div className="pa">
      <div className="pa-in">
      <div className="pa-ground" />
      <Under tier={tier} standard />
      <div className="pa-year" aria-hidden>
        {p.year}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {img && charged && <img className="pa-rim" src={img} alt="" draggable={false} />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {img && <img className="pa-photo" src={img} alt="" draggable={false} />}
      <div className="pa-top">
        <span className="pa-pos">{p.pos}</span>
        <span className="pa-rar">
          <Gem tier={tier} />
          {TIER_LABEL[tier]}
        </span>
      </div>
      {card.serial && (
        <div className="pa-serial">
          <b>{card.serial[0]}</b>/{card.serial[1]}
        </div>
      )}
      <div className="pa-season">{p.year}</div>
      <div className="pa-plate">
        <div className="pa-id">
          <div className="pa-who">
            <div className="pa-name" style={{ fontSize: fit(p.name, 5.1, 0.92) }}>
              {p.name}
            </div>
            <div className="pa-val" data-v={p.score.toLocaleString()}>
              {p.score.toLocaleString()}
            </div>
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
      <Over tier={tier} standard />
      </div>
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
          {String(p.year).slice(-2)}
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
          <div className="pb-tier">
            <b>{p.year}</b>
            {TIER_LABEL[tier]}
          </div>
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

/** The back of every card: midnight stock with a field pressed into it. The stock
    never changes, the frame gives the rarity away, by degrees, like the live game.
    Canton burns over the top of this: see .pc-blaze. */
function Back({ card }: { card: LabCard }) {
  const { tier } = card
  return (
    <div className="pa pk">
      <div className="pa-in">
        <div className="pk-stock" />
        {(tier === 'transcendent' || tier === 'immortal') && <span className="pk-leak" aria-hidden />}
        <span className="pk-line" aria-hidden />
        <div className="pk-mid">
          {/* the live back's football, kept just as faint */}
          <svg className="pk-ball" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9.5 38.5c-4-12 2-27 18-30.5 6-1.3 10.2-.6 11 .5.8 1.1 1.4 5.3.1 11.3-3.5 16-18.5 22-30.5 18-.2-.1-.3-.2-.4-.4-.1-.1-.2-.3-.2-.4z" />
            <path d="M17 31 31 17" />
            <path d="M21.2 24.6l2.2 2.2M24.4 21.4l2.2 2.2M27.6 18.2l2.2 2.2" />
          </svg>
          <div className="pk-tap">Tap to Reveal</div>
        </div>
        {(tier === 'dynasty' || tier === 'transcendent' || tier === 'immortal') && (
          <span className="pc-sheen" aria-hidden>
            <i />
          </span>
        )}
      </div>
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

function Card({ concept: picked, card, onOpen, size, down = false }: { concept: Concept; card: LabCard; onOpen?: () => void; size: string; down?: boolean }) {
  // Every design shares one back, in the standard frame.
  const concept: Concept = down ? 'foil' : picked
  const Face = down ? Back : concept === 'foil' ? Foil : concept === 'prime' ? Prime : Blackout
  const Tag = onOpen ? 'button' : 'div'
  return (
    <Tag
      {...(onOpen ? { type: 'button' as const, onClick: onOpen, 'aria-label': `Pull ${card.player.name}` } : {})}
      className={`pc pc--${concept} pc--${size}${down ? ' pc--back' : ''}`}
      data-tier={card.tier}
      onPointerMove={(e: React.PointerEvent<HTMLElement>) => lean(e.currentTarget, e)}
      onPointerLeave={(e: React.PointerEvent<HTMLElement>) => e.currentTarget.querySelector<HTMLElement>('.pc-lean')?.style.removeProperty('transform')}
    >
      <span className="pc-lean">
        {concept === 'foil' && (card.tier === 'transcendent' || card.tier === 'immortal' || card.tier === 'canton') && <span className="pc-aura" aria-hidden />}
        {concept === 'foil' && card.tier === 'immortal' && (
          <span className="pc-fire" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/games/pack-empire/fx/card-fire-immortal.webp" alt="" />
          </span>
        )}
        {concept === 'foil' && card.tier === 'canton' && (
          <>
            <span className="pc-prism" aria-hidden>
              <i />
            </span>
            <span className="pc-corona" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/games/pack-empire/fx/card-corona.webp" alt="" />
            </span>
          </>
        )}
        {(card.tier === 'transcendent' || card.tier === 'immortal' || card.tier === 'canton' || concept === 'blackout' || (concept === 'foil' && card.tier === 'dynasty')) && (
          <span className="pc-orbit" aria-hidden>
            <i />
            {concept === 'foil' && card.tier !== 'dynasty' && <i />}
          </span>
        )}
        <span className="pc-body">
          <Face card={card} />
        </span>
        {concept === 'foil' && card.tier === 'transcendent' && (
          <span className="pc-fire" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/games/pack-empire/fx/card-arcs.webp" alt="" />
          </span>
        )}
        {concept === 'foil' && card.tier === 'canton' && (
          <>
            {down && (
              <span className="pc-blaze" aria-hidden>
                {/* eslint-disable @next/next/no-img-element */}
                <img src="/games/pack-empire/fx/card-molten.webp" alt="" />
                <img src="/games/pack-empire/fx/card-molten.webp" alt="" />
                {/* eslint-enable @next/next/no-img-element */}
                <b>Tap to Reveal</b>
              </span>
            )}
            {!down && (
              <>
                <span className="pc-pave" aria-hidden />
                <span className="pc-pave-run" aria-hidden>
                  <i />
                </span>
                <span className="pc-glint" aria-hidden>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/games/pack-empire/fx/card-glint.webp" alt="" />
                </span>
              </>
            )}
          </>
        )}
        {concept === 'foil' && card.tier === 'dynasty' && (
          <span className="pc-corners" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
        )}
      </span>
    </Tag>
  )
}

/** Both faces of a card, held for a flip. */
function Faces({ concept, card }: { concept: Concept; card: LabCard }) {
  return (
    <>
      <Card concept={concept} card={card} size="stage" />
      <Card concept={concept} card={card} size="stage" down />
    </>
  )
}

/** The pull: the room goes dark, the card arrives the way its rarity earns. */
function Pull({ concept, card, onClose }: { concept: Concept; card: LabCard; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  if (card.tier === 'canton') {
    return (
      <Enshrinement player={card.player} onClose={onClose}>
        <Card concept={concept} card={card} size="stage" />
      </Enshrinement>
    )
  }
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
          <Faces concept={concept} card={card} />
        </span>
      </span>
      <span className="pl-name" data-tier={card.tier}>
        {TIER_LABEL[card.tier]}
      </span>
    </button>
  )
}

/** Canton's light in the pack: white gold. */
const CANTON_GLOW = '#ffe6a8'

/**
 * The whole pull, start to finish: the game's own wrapper and tear, in Canton's
 * light, then the Canton Pull where you find out. When it clears the five cards are
 * already down, ready to flip, with Canton burning among them. Any other card just
 * flips. A tap on Canton cuts straight to the doors.
 */
function PackOpen({ concept, cards, onAgain, onClose }: { concept: Concept; cards: LabCard[]; onAgain: () => void; onClose: () => void }) {
  const [banner, setBanner] = useState(false)
  const [laid, setLaid] = useState(false)
  const [up, setUp] = useState<boolean[]>(() => cards.map(() => false))
  const [pulling, setPulling] = useState<LabCard | null>(null)
  const onTorn = useCallback(() => setBanner(true), [])
  const layCards = useCallback(() => setLaid(true), [])
  const endBanner = useCallback(() => {
    setLaid(true)
    setBanner(false)
  }, [])
  const closePull = useCallback(() => setPulling(null), [])
  useEffect(() => {
    if (pulling) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [pulling, onClose])
  const flip = (i: number) => {
    if (up[i]) return
    if (cards[i].tier === 'canton') setPulling(cards[i])
    setUp((was) => was.map((v, at) => v || at === i))
  }
  const left = up.filter((v) => !v).length
  const status = !laid ? 'Swipe across the top, or tap, to rip it open' : left ? 'Tap a card to flip it' : 'All revealed'
  return (
    <>
      <div className={`pe-stage lab-pack${banner ? ' pulling cantoning' : ''}`} role="dialog" aria-modal="true" aria-label="QB pack">
        {banner && <CantonPull onWhite={layCards} onDone={endBanner} />}
        <div className={`pe-stage-head${banner ? ' wo' : ''}`}>
          <div className="pe-stage-norm">
            <div className="pe-stage-pos">
              QB <em>Pack</em>
            </div>
            <div className="pe-stage-status" aria-live="polite">
              {status}
            </div>
          </div>
        </div>
        {!laid && <SealedPack art={PACK_ART.QB} glow={CANTON_GLOW} tier={4} ready onTorn={onTorn} />}
        {laid && (
          <div className="pe-stage-cards">
            {cards.map((card, i) => (
              <button
                key={card.player.id}
                type="button"
                className={`pk-slot${up[i] ? ' up' : ''}`}
                onClick={() => flip(i)}
                aria-label={up[i] ? card.player.name : 'Flip this card'}
              >
                <span className="pk-shake" data-tier={up[i] ? undefined : card.tier}>
                  <span className="pk-flip">
                    {up[i] && <Card concept={concept} card={card} size="table" />}
                    <Card concept={concept} card={card} size="table" down />
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="pe-stage-foot">
          {laid && !banner && !left && (
            <button type="button" className="pe-btn pe-btn--ghost" onClick={onAgain}>
              Open Another
            </button>
          )}
          <button type="button" className="pe-btn pe-btn--quiet" onClick={onClose}>
            Back to the Lab
          </button>
        </div>
      </div>
      {pulling && <Pull concept={concept} card={pulling} onClose={closePull} />}
    </>
  )
}

export function CardLab({ cards, pack, binder }: { cards: LabCard[]; pack: LabCard[]; binder: LabCard[] }) {
  const [concept, setConcept] = useState<Concept>('foil')
  const [open, setOpen] = useState<LabCard | null>(null)
  const [opening, setOpening] = useState(false)
  const [deal, setDeal] = useState(0)
  const closePack = useCallback(() => setOpening(false), [])
  const active = CONCEPTS.find((c) => c.key === concept) ?? CONCEPTS[0]
  return (
    <div className="lab">
      <header className="lab-head">
        <div className="lab-kicker">Pack Empire · Dev Only</div>
        <h1>Card Lab</h1>
        <p>Three directions for the cards, plus Canton, a new tier above Immortal for 5,200+. Tap any card to play its pull, from the back.</p>
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

      <div className="lab-open">
        <button type="button" onClick={() => setOpening(true)}>
          Open a Pack
        </button>
        <span>The whole Canton pull: rip the pack, flip a few, then tap the card that’s burning.</span>
      </div>

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

      <h2 className="lab-h2">Card Backs</h2>
      <section className="lab-row" aria-label="The back of every tier">
        {cards.map((card) => (
          <Card key={card.tier} concept={concept} card={card} size="hero" down onOpen={() => setOpen(card)} />
        ))}
      </section>

      <h2 className="lab-h2">Backs At Table Size</h2>
      <section className="lab-row lab-row--small" aria-label="The back of every tier at the size a pack deals them">
        {cards.map((card) => (
          <Card key={card.tier} concept={concept} card={card} size="table" down />
        ))}
      </section>

      <h2 className="lab-h2">Canton In The Binder</h2>
      <p className="lab-line">Your number never changes, the total climbs as others pull the same card, and every Canton counts on its own. Example numbers.</p>
      <section className="lab-row" aria-label="Canton serial numbers in the binder">
        {binder.map((card) => (
          <Card key={card.player.id} concept="foil" card={card} size="hero" />
        ))}
      </section>

      <h2 className="lab-h2">Canton Shape Ideas</h2>
      <section className="lab-shapes" aria-label="Shape ideas for Canton">
        {SHAPES.map((s) => (
          <figure key={s.name}>
            <svg viewBox="0 0 24 24" aria-hidden>
              {s.art}
            </svg>
            <figcaption>{s.name}</figcaption>
          </figure>
        ))}
      </section>

      {open && <Pull concept={concept} card={open} onClose={() => setOpen(null)} />}
      {opening && <PackOpen key={deal} concept={concept} cards={pack} onAgain={() => setDeal((n) => n + 1)} onClose={closePack} />}
    </div>
  )
}
