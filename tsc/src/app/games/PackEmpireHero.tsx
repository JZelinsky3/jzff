import Link from 'next/link'
import s from './hero.module.css'

// Pack Empire's cover on the Games Page, above the rest of the shelf. It's the
// game the page leads with, so it gets the Locker Room card's shape rather than
// a poster in the rail: the whole card is the picture, with the words over its
// dark side. The key art is the path-traced torn pack (scripts/pack-empire-fx/rip);
// on a desktop it's set wide and to the right, so the pack sits two thirds of the
// way across and the words take the empty table on the left. A phone stands it
// up and puts the words underneath.

const MODES = ['Empire Builder', 'The Daily', 'Versus', 'Mega Draft', 'League']

export function PackEmpireHero({ mobile = false }: { mobile?: boolean }) {
  return (
    <Link href="/games/pack-empire/" className={mobile ? `${s.hero} ${s.phone}` : s.hero}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/games/pack-empire/key-art-wide.webp" alt="A torn card pack with five player cards rising out of it" className={s.art} draggable={false} />
      <span className={s.sheen} aria-hidden />
      <span className={s.body}>
        <span className={s.kick}>The Card Game</span>
        <span className={s.name}>
          Pack <em>Empire</em>
        </span>
        <span className={s.line}>
          Rip packs of real NFL seasons, keep one card from each and build the best offense on the board. Alone, against a
          friend, or with your whole league.
        </span>
        <span className={s.modes}>
          {MODES.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </span>
        <span className={s.foot}>
          <span className={s.go}>Play Pack Empire</span>
          <span className={s.note}>No account needed</span>
        </span>
      </span>
    </Link>
  )
}
