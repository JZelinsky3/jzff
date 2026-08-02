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
} from './gameDefs'
import s from './marks.module.css'

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

function Art({ id }: { id: string }) {
  if (id === ROSTER_ROULETTE.id) return <WheelMark />
  if (id === GUESS_THE_DRAFT.id) return <RedactedMark />
  if (id === THE_GAUNTLET.id) return <FixtureMark />
  if (id === OVER_UNDER.id) return <LineMark />
  if (id === REDRAFT.id) return <ClockMark />
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
