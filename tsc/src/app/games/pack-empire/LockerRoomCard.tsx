// The way into the Locker Room, on the Pack Empire front page. It's a different thing
// from the modes around it, so it doesn't look like one of them: the whole card is the
// room. The art is a 3D render made from the game's own packs and cards, so nothing on
// it is a mock-up of anything: scripts/pack-empire-locker-art holds the scene.

import Link from 'next/link'

const ART = '/games/pack-empire/locker-room'

export function LockerRoomSection() {
  return (
    <section className="pe-sec">
      <div className="pe-sec-head">
        <span className="pe-sec-num">§ 01 · The Locker Room</span>
        <span className="pe-sec-title">Cards You Keep</span>
        <span className="pe-sec-meta">New</span>
      </div>
      <Link href="/games/pack-empire/locker/" className="pe-lr">
        <picture className="pe-lr-art">
          <source media="(max-width: 700px)" srcSet={`${ART}-tall.webp`} />
          <img src={`${ART}-wide.webp`} alt="An open locker with packs on its shelves and foil cards flying out of it" draggable={false} />
        </picture>
        <span className="pe-lr-sheen" aria-hidden />
        <span className="pe-lr-body">
          <span className="pe-lr-kick">A Game Of Games</span>
          <span className="pe-lr-name">
            The Locker <em>Room</em>
          </span>
          <span className="pe-lr-line">Keep every card you pull. Build your decks, then take them into every game inside.</span>
          <span className="pe-lr-tags">
            <span>A Pack A Day</span>
            <span>Your Decks</span>
            <span>Live Head To Head</span>
          </span>
          <span className="pe-btn pe-lr-go">Enter</span>
        </span>
      </Link>
    </section>
  )
}
