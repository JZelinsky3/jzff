'use client'

import { useState } from 'react'
import { TEAM_COLORS, teamLogo } from '@/lib/packEmpire/rules'
import { useFace } from '../../faces'
import { Gem } from '../cards/CardLab'

type Tier = 'dynasty' | 'transcendent' | 'immortal'

/** A candidate as moments.py writes it. */
export type Moment = {
  id: string
  kind: 'game' | 'streak'
  name: string
  pos: string
  team: string
  abbr: string
  img: string | null
  face: 'new' | 'light' | 'known'
  year: number
  value: number
  rarity: Tier | 'canton'
  line: string
  // a game
  week?: number
  round?: string | null
  opp?: string
  oppAbbr?: string
  pts?: number
  // a streak
  weeks?: [number, number]
  games?: number[]
  gameWeeks?: number[]
  avg?: number
  seasonPpg?: number
}

/** Their own names on the rarities that already exist. */
const NAMES: Record<Moment['kind'], Record<Tier, string>> = {
  game: { dynasty: 'Statement', transcendent: 'Takeover', immortal: 'Instant Classic' },
  streak: { dynasty: 'Hot Hand', transcendent: 'Heater', immortal: 'Wildfire' },
}

const ROUND_SHORT: Record<string, string> = { 'Wild Card': 'WC', Divisional: 'DIV', 'Conference Championship': 'CONF', 'Super Bowl': 'SB' }
const ROUND_CARD: Record<string, string> = { 'Wild Card': 'Wild Card', Divisional: 'Divisional', 'Conference Championship': 'Conf. Title', 'Super Bowl': 'Super Bowl' }

const CONCEPTS = [
  {
    key: 'lights',
    name: 'Under The Lights',
    line: 'New. One night in one stadium: light towers in the corners, the scoreboard holding that day’s numbers, and the crowd’s camera flashes behind him. Higher tiers turn the beams on and run the ribbon board round the frame.',
  },
  {
    key: 'prime',
    name: 'Prime Time',
    line: 'The broadcast card you saved for a future mode, in the team’s colours with the player breaking out of the frame, carrying the game instead of the season.',
  },
] as const
type Concept = (typeof CONCEPTS)[number]['key']

const tierOf = (m: Moment): Tier => (m.rarity === 'canton' ? 'immortal' : m.rarity)

function fit(name: string, room: number, most: number): string {
  let width = 0
  for (const ch of name.toUpperCase()) width += 'MW'.includes(ch) ? 0.62 : "IJ.' -".includes(ch) ? 0.27 : 0.47
  return `${Math.min(most, room / width).toFixed(3)}em`
}

/** "251 rush · 4 TD · 4-21" into cells; a bare "4-21" is catches-yards. */
function cells(line: string): { v: string; l: string }[] {
  return line.split(' · ').map((part) => {
    const m = /^([\d,.-]+)\s*(.*)$/.exec(part.trim())
    const v = m?.[1] ?? part
    return { v, l: (m?.[2] || (v.includes('-') ? 'rec' : '')).toUpperCase() }
  })
}

/** Prime Time's slot beside the value only holds about what "2019" did. */
/** Four long cells (Fields' pass, TD, rush, rush TD) need a smaller row. */
const tight = (line: string) => cells(line).slice(0, 4).reduce((n, c) => n + c.v.length + c.l.length, 0) > 21

const whenShort = (m: Moment) => (m.kind === 'streak' ? `W${m.weeks![0]}-${m.weeks![1]}` : m.round ? ROUND_SHORT[m.round] : `W${m.week}`)
const whenLong = (m: Moment) => (m.kind === 'streak' ? `Weeks ${m.weeks![0]}-${m.weeks![1]}` : m.round ? ROUND_CARD[m.round] : `Week ${m.week}`)
const shown = (m: Moment) => (m.kind === 'game' ? m.pts! : m.avg!).toFixed(1)

/* ── Under The Lights ────────────────────────────────────── */

/** The LED band in the frame, running round the card. Its text is the card's own. */
function Ribbon({ m, sides }: { m: Moment; sides: boolean }) {
  const one = `${NAMES[m.kind][tierOf(m)]} ★ ${shown(m)} ${m.kind === 'game' ? 'PTS' : 'A GAME'} ★ ${m.name} ★ ${whenLong(m)} ${m.year} ★ `
  const run = one.repeat(3)
  const strip = (cls: string) => (
    <span className={`ul-rib ${cls}`} aria-hidden>
      <i>
        {run}
        {run}
      </i>
    </span>
  )
  return (
    <>
      {strip('ul-rib--top')}
      {strip('ul-rib--bot')}
      {sides && strip('ul-rib--l')}
      {sides && strip('ul-rib--r')}
    </>
  )
}

function Lights({ m }: { m: Moment }) {
  const tier = tierOf(m)
  const img = useFace({ id: m.id, img: m.img })
  const logo = teamLogo({ team: m.team })
  const opp = m.opp ? teamLogo({ team: m.opp }) : null
  const flashes = tier === 'immortal' ? 10 : tier === 'transcendent' ? 6 : 0
  const beams = tier === 'immortal' ? 4 : tier === 'transcendent' ? 2 : 0
  return (
    <div className="ul">
      {tier !== 'dynasty' && <Ribbon m={m} sides={tier === 'immortal'} />}
      <div className="ul-in">
        <div className="ul-sky" />
        <span className="ul-flashes" aria-hidden>
          {Array.from({ length: flashes }, (_, i) => (
            <i key={i} />
          ))}
        </span>
        <span className="ul-glare ul-glare--l" aria-hidden />
        <span className="ul-glare ul-glare--r" aria-hidden />
        <span className="ul-beams" aria-hidden>
          {Array.from({ length: beams }, (_, i) => (
            <i key={i} />
          ))}
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {img && <img className="ul-photo" src={img} alt="" draggable={false} />}
        <span className="ul-bank ul-bank--l" aria-hidden />
        <span className="ul-bank ul-bank--r" aria-hidden />
        <div className="ul-top">
          <span className="ul-pos">{m.pos}</span>
          <span className="ul-rar">
            <Gem tier={tier} />
            {NAMES[m.kind][tier]}
          </span>
        </div>
        <div className="ul-board">
          <div className="ul-when">
            {whenLong(m)} · {m.year}
          </div>
          {m.kind === 'game' ? (
            <div className="ul-game">
              <div className="ul-vs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logo ? <img src={logo} alt="" draggable={false} /> : <b>{m.abbr}</b>}
                <em>vs</em>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {opp ? <img src={opp} alt="" draggable={false} /> : <b>{m.oppAbbr}</b>}
              </div>
              <div className="ul-score" data-v={shown(m)}>
                <b>{shown(m)}</b>
                <em>PTS</em>
              </div>
            </div>
          ) : (
            <div className="ul-line">
              {m.games!.map((g, i) => (
                <span key={i}>
                  <em>W{m.gameWeeks![i]}</em>
                  <b>{g.toFixed(1)}</b>
                </span>
              ))}
              <span className="ul-avg">
                <em>AVG</em>
                <b>{shown(m)}</b>
              </span>
            </div>
          )}
        </div>
        <div className="ul-plate">
          <div className="ul-id">
            <div className="ul-name" style={{ fontSize: fit(m.name, 5.6, 0.9) }}>
              {m.name}
            </div>
            <div className="ul-val">{m.value.toLocaleString()}</div>
          </div>
          <div className={`ul-stats${tight(m.line) ? ' ul-stats--tight' : ''}`}>
            {cells(m.line)
              .slice(0, 4)
              .map((c, i) => (
                <span key={i}>
                  <b>{c.v}</b>
                  <em>{c.l}</em>
                </span>
              ))}
          </div>
        </div>
        <span className="pc-sheen" aria-hidden>
          <i />
        </span>
      </div>
    </div>
  )
}

/* ── Prime Time, carrying a game ─────────────────────────── */

function Prime({ m }: { m: Moment }) {
  const tier = tierOf(m)
  const img = useFace({ id: m.id, img: m.img })
  const logo = teamLogo({ team: m.team })
  const [one, two] = TEAM_COLORS[m.team] ?? ['#222', '#555']
  const line = cells(m.line).slice(0, 3)
  return (
    <div className="pb" style={{ '--c1': one, '--c2': two } as React.CSSProperties}>
      <div className="pb-frame">
        <div className="pb-ground" />
        <div className="pb-slash" />
        {tier === 'transcendent' && <span className="pc-holo" aria-hidden />}
        {tier === 'immortal' && (
          <span className="pc-rays" aria-hidden>
            <i />
          </span>
        )}
        <div className="pb-year" aria-hidden>
          {String(m.year).slice(-2)}
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {img && <img className="pb-photo" src={img} alt="" draggable={false} />}
      <div className="pb-corner">
        <span className="pb-pos">{m.pos}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo && <img className="pb-logo" src={logo} alt="" draggable={false} />}
      </div>
      <div className="pb-rar">
        <Gem tier={tier} />
      </div>
      <div className="pb-base">
        <div className="pb-namebar">
          <span style={{ fontSize: fit(m.name, 7.7, 1.04) }}>{m.name}</span>
        </div>
        <div className="pb-valbar">
          <div className="pb-val">{m.value.toLocaleString()}</div>
          <div className="pb-tier">
            <b>{whenShort(m)}</b>
            {NAMES[m.kind][tier]}
          </div>
        </div>
        <div className="pb-ticker">
          {line.map((c, i) => (
            <span key={i}>
              <b>{c.v}</b> {c.l}
            </span>
          ))}
          <span>{m.kind === 'game' ? <>vs <b>{m.oppAbbr}</b></> : <><b>{shown(m)}</b> PPG</>}</span>
        </div>
      </div>
      <span className="pc-sheen" aria-hidden>
        <i />
      </span>
      {tier === 'dynasty' && (
        <span className="pc-sparks" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
      )}
      {tier === 'immortal' && (
        <span className="pc-embers" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <i key={i} />
          ))}
        </span>
      )}
    </div>
  )
}

/* ── The card + the page ─────────────────────────────────── */

function lean(el: HTMLElement, e: React.PointerEvent) {
  if (e.pointerType !== 'mouse') return
  const r = el.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width
  const y = (e.clientY - r.top) / r.height
  const tilt = el.querySelector<HTMLElement>('.pc-lean')
  if (tilt) tilt.style.transform = `rotateX(${(0.5 - y) * 16}deg) rotateY(${(x - 0.5) * 20}deg)`
}

function Card({ concept, m, size }: { concept: Concept; m: Moment; size: 'hero' | 'table' }) {
  const tier = tierOf(m)
  // Prime Time's top two carry the light that circles the card, as in the Card Lab.
  const orbit = concept === 'prime' && tier !== 'dynasty'
  return (
    <div
      className={`pc pc--${concept} pc--${size}`}
      data-tier={tier}
      data-kind={m.kind}
      onPointerMove={(e) => lean(e.currentTarget, e)}
      onPointerLeave={(e) => e.currentTarget.querySelector<HTMLElement>('.pc-lean')?.style.removeProperty('transform')}
    >
      <span className="pc-lean">
        {orbit && (
          <span className="pc-orbit" aria-hidden>
            <i />
          </span>
        )}
        <span className="pc-body">{concept === 'lights' ? <Lights m={m} /> : <Prime m={m} />}</span>
      </span>
    </div>
  )
}

function Row({ concept, list, size }: { concept: Concept; list: Moment[]; size: 'hero' | 'table' }) {
  return (
    <section className={`ml-row${size === 'table' ? ' ml-row--small' : ''}`}>
      {list.map((m) => (
        <figure key={m.id}>
          <Card concept={concept} m={m} size={size} />
          {size === 'hero' && (
            <figcaption>
              <b>{m.name}</b> {m.face === 'new' ? 'No season card yet' : m.face === 'light' ? 'Only a common or rare season' : 'Has a top season card'}
            </figcaption>
          )}
        </figure>
      ))}
    </section>
  )
}

export function MomentLab({ games, streaks, more }: { games: Moment[]; streaks: Moment[]; more: Moment[] }) {
  const [concept, setConcept] = useState<Concept>('lights')
  const active = CONCEPTS.find((c) => c.key === concept) ?? CONCEPTS[0]
  return (
    <div className="lab">
      <header className="lab-head">
        <div className="lab-kicker">Pack Empire · Dev Only</div>
        <h1>Moments Lab</h1>
        <p>Game and streak cards, a future update. They sit on Dynasty, Transcendent and Immortal for value and odds, under names of their own, so they never get mistaken for a season.</p>
      </header>

      <div className="lab-tabs" role="tablist" aria-label="Design">
        {CONCEPTS.map((c, i) => (
          <button key={c.key} type="button" role="tab" aria-selected={concept === c.key} className={concept === c.key ? 'on' : ''} onClick={() => setConcept(c.key)}>
            <em>{i + 1}</em>
            {c.name}
          </button>
        ))}
      </div>
      <p className="lab-line">{active.line}</p>

      <h2 className="lab-h2">Single Games · Statement, Takeover, Instant Classic</h2>
      <Row concept={concept} list={games} size="hero" />

      <h2 className="lab-h2">Four-Game Streaks · Hot Hand, Heater, Wildfire</h2>
      <Row concept={concept} list={streaks} size="hero" />

      <h2 className="lab-h2">At Table Size</h2>
      <Row concept={concept} list={[...games, ...streaks]} size="table" />

      <h2 className="lab-h2">More From The First Draft</h2>
      <Row concept={concept} list={more} size="table" />
    </div>
  )
}
