// Each game, drawn.
//
// Lived in MobileGames.tsx first, because a phone shows every game at once
// with no hover and no rail and the art was the only thing telling them
// apart. The desktop hub had the opposite problem for the opposite reason:
// five cards of title-plus-paragraph-plus-three-steps, identical in shape and
// length and voice, so the eye slid off all five. Same fix, so it's the same
// component — one mark per game, sized off a single font-size.
//
// The rule these follow: draw the MOMENT the game puts you in, not a symbol
// of its subject. The wheel is a landed spin, Guess the Draft is a redacted
// board, The Gauntlet is a fixture with the result withheld, the Over/Under
// is a quoted price, Redraft is being on the clock. Every one of them is a
// screenshot of the thing you are about to do.

import {
  ROSTER_ROULETTE,
  GUESS_THE_DRAFT,
  THE_GAUNTLET,
  OVER_UNDER,
  REDRAFT,
  MULTIVERSE_DRAFT,
  PACK_EMPIRE,
} from './gameDefs'
import { PACK_ART } from '@/lib/packEmpire/rules'
import s from './marks.module.css'

/**
 * The whole game, left to right, because a pack on its own doesn't say what
 * you do with it: open a pack, keep one of its five cards, build an eleven
 * and watch the total climb.
 *
 * The pack is the real one. The colours are the game's own rarity colours, and
 * the eleven are laid out the way the field is, line across the top. Names
 * nobody, for the reason every mark here doesn't: a face on the shelf would
 * date the game to whoever is in the pool this month.
 */
const RARITY_INK = ['#c87840', '#42c0f8', '#ffd700', '#e040ff', '#28dc78']

/** Who's on the field: an index into RARITY_INK, line first, then the skill
    players, then the backfield. Reads as a run that got lucky once or twice. */
const ELEVEN = [
  [1, 0, 2, 1, 0],
  [2, 1, 4, 1],
  [3, 1],
]

function PackMark() {
  return (
    <span className={s.story}>
      <span className={s.beat}>
        <span className={s.beatArt}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={PACK_ART.QB} alt="" className={s.beatPack} loading="lazy" />
        </span>
        <span className={s.beatCap}>
          <b>1</b> Open
        </span>
      </span>

      <span className={s.beat}>
        <span className={`${s.beatArt} ${s.beatFan}`}>
          {[-2, -1, 1, 2].map((n) => (
            <span key={n} className={s.fanCard} style={{ '--n': n } as React.CSSProperties} />
          ))}
          <span className={s.fanKeep}>
            <i />
            <b>5,600</b>
          </span>
        </span>
        <span className={s.beatCap}>
          <b>2</b> Keep one
        </span>
      </span>

      <span className={s.beat}>
        <span className={`${s.beatArt} ${s.beatField}`}>
          {ELEVEN.map((row, r) => (
            <span key={r} className={s.fieldRow}>
              {row.map((tone, i) => (
                <i key={i} style={{ '--rc': RARITY_INK[tone] } as React.CSSProperties} />
              ))}
            </span>
          ))}
          <span className={s.fieldTotal}>20,480</span>
        </span>
        <span className={s.beatCap}>
          <b>3</b> Build
        </span>
      </span>
    </span>
  )
}

/**
 * Names no team, and mustn't start again.
 *
 * It printed a real one first, lifted out of the site pool — a stranger's
 * private joke, meaningless to everyone not in that league. Replacing it with
 * an invented one only moved the problem: a made-up team on a site whose whole
 * promise is real history reads as a placeholder the moment anybody notices,
 * and "Milk Money" in particular sat close enough to PA Milk Society to look
 * like a mistake.
 *
 * A season and a record identify the landed squad without naming anybody, and
 * the slot row says what you actually do with it. Together they're the whole
 * game: the wheel stops somewhere real, you fill seven slots off it.
 */
function WheelMark() {
  const slots: [string, boolean][] = [
    ['QB', true],
    ['RB', true],
    ['RB', false],
    ['WR', true],
    ['WR', false],
    ['TE', false],
    ['FX', false],
  ]
  return (
    <>
      <span className={s.wheel}>
        <span className={s.wheelYear}>2021 season</span>
        <span className={s.wheelRec}>11-3</span>
      </span>
      <span className={s.slots}>
        {slots.map(([label, filled], i) => (
          <span key={`${label}-${i}`} className={filled ? s.slotOn : s.slot}>
            {label}
          </span>
        ))}
      </span>
    </>
  )
}

function RedactedMark() {
  const rows: [string, string, string][] = [
    ['R1', '78%', 'RB'],
    ['R2', '92%', 'WR'],
    ['R3', '64%', 'QB'],
  ]
  return (
    <span className={s.picks}>
      {rows.map(([rd, width, pos]) => (
        <span key={rd} className={s.pick}>
          <span className={s.pickRd}>{rd}</span>
          <span className={s.pickBar} style={{ width }} />
          <span className={s.pickPos}>{pos}</span>
        </span>
      ))}
    </span>
  )
}

function FixtureMark() {
  return (
    <span className={s.fix}>
      <span className={s.fixRow}>
        <span className={s.fixBar} style={{ width: '74%' }} />
        <span className={s.fixScore}>?</span>
      </span>
      <span className={s.fixVs}>vs</span>
      <span className={s.fixRow}>
        <span className={s.fixBar} style={{ width: '56%' }} />
        <span className={s.fixScore}>?</span>
      </span>
    </span>
  )
}

/** The number is invented and reads as one: any plausible-looking score here
    would be mistaken for a result rather than a line. */
function LineMark() {
  return (
    <span className={s.line}>
      <span className={s.lineNum}>118.5</span>
      <span className={s.lineCalls}>
        <span className={s.lineCall}>Over</span>
        <span className={s.lineCall}>Under</span>
      </span>
    </span>
  )
}

function ClockMark() {
  return (
    <>
      <span className={s.clock}>
        <span className={s.clockPick}>1.04</span>
        <span className={s.clockLabel}>On the clock</span>
      </span>
      <span className={s.clockRow}>
        <span className={s.clockDisc} />
        <span className={s.clockBar} style={{ width: '68%' }} />
      </span>
      <span className={s.clockRow}>
        <span className={s.clockDisc} />
        <span className={s.clockBar} style={{ width: '84%' }} />
      </span>
    </>
  )
}

/**
 * One card, which is one player, which is three numbers.
 *
 * Nobody is named. A real name would date the card to whatever the reader
 * knows about that player's actual years, and the whole point of the mark is
 * that the three seasons are interchangeable until the week rolls. The lit
 * band is the one that came up; the other two are just as available.
 */
function BandsMark() {
  const bands: [string, string, boolean][] = [
    ['2019', '21.4', false],
    ['2022', '12.1', true],
    ['2024', '17.8', false],
  ]
  return (
    <>
      <span className={s.bandsHead}>
        <span className={s.bandsPos}>RB</span>
        <span className={s.bandsLabel}>Three seasons</span>
      </span>
      {bands.map(([year, ppg, lit]) => (
        <span key={year} className={lit ? s.bandOn : s.band}>
          <span className={s.bandYear}>{year}</span>
          <span className={s.bandPpg}>{ppg}</span>
        </span>
      ))}
    </>
  )
}

function Art({ id }: { id: string }) {
  if (id === ROSTER_ROULETTE.id) return <WheelMark />
  if (id === GUESS_THE_DRAFT.id) return <RedactedMark />
  if (id === THE_GAUNTLET.id) return <FixtureMark />
  if (id === OVER_UNDER.id) return <LineMark />
  if (id === REDRAFT.id) return <ClockMark />
  if (id === MULTIVERSE_DRAFT.id) return <BandsMark />
  if (id === PACK_EMPIRE.id) return <PackMark />
  return null
}

/**
 * `pocket` is the phone's banner, `poster` the desktop rail's side plate, and
 * `lead` the same plate at the size the back page's top billing wants. The
 * only difference between them is the frame's font-size, which every piece of
 * art above is measured against — so a new mark is written once and fits all
 * three without being redrawn.
 */
export function GameMark({
  id,
  variant = 'pocket',
}: {
  id: string
  variant?: 'pocket' | 'poster' | 'lead'
}) {
  const frame =
    variant === 'lead'
      ? `${s.mark} ${s.lead}`
      : variant === 'poster'
        ? `${s.mark} ${s.poster}`
        : s.mark
  return (
    <span className={frame}>
      <Art id={id} />
    </span>
  )
}
