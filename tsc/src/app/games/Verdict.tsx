// Right or wrong, said loudly.
//
// Both binary games announced the result in a hairline-bordered strip with the
// word set in 10px mono caps — technically present, easy to miss, and on a
// game whose whole loop is call/answer/call the answer is the payoff. If you
// have to look for it, the loop has no beat.
//
// So: a filled band, a struck disc, and the word at a size you read without
// aiming at it. Shared by The Gauntlet and the Over/Under rather than written
// twice, because two boards disagreeing about what "correct" looks like is
// exactly the kind of drift that makes a section feel assembled instead of
// designed.
//
// The marks are stroke SVGs, not glyph characters: a ✓ renders at a different
// weight and baseline in every font on the way to a phone, and this one has to
// land in the same place every time.

import s from './verdict.module.css'

function Tick() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
      <path
        d="M4 12.5l5.5 5.5L20 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Cross() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
      <path
        d="M6 6l12 12M18 6L6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Verdict({
  hit,
  headline,
  detail,
}: {
  hit: boolean
  /** One or two words. The band is read at a glance or not at all. */
  headline: string
  /** The supporting line — by how much, what they actually scored. */
  detail: React.ReactNode
}) {
  return (
    <div className={hit ? s.bandHit : s.bandMiss} role="status">
      <span className={s.disc}>{hit ? <Tick /> : <Cross />}</span>
      <span className={s.text}>
        <span className={s.headline}>{headline}</span>
        <span className={s.detail}>{detail}</span>
      </span>
    </div>
  )
}
