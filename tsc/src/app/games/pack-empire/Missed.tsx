// A blind run in hindsight. The pack turns over for a moment as you leave it;
// this is the part you can sit and read once your own cards are up.

import { SLOTS, type MissCard, type Missed } from '@/lib/packEmpire/rules'

const line = (c: MissCard) => (c.year ? `${c.name} ${c.year}` : c.name)

export function MissedPanel({ missed, battled = false }: { missed: Missed; battled?: boolean }) {
  return (
    <div className="pe-panel pe-miss">
      <div className="pe-kicker">What You Missed</div>
      <div className="pe-miss-stats">
        <div className="pe-miss-stat">
          <b>
            {missed.hit}/{missed.packs}
          </b>
          <span>Best Card Taken</span>
        </div>
        <div className="pe-miss-stat">
          <b>{missed.score.toLocaleString()}</b>
          <span>Your Draft</span>
        </div>
        <div className="pe-miss-stat">
          <b>{missed.perfect.toLocaleString()}</b>
          <span>Perfect Draft</span>
        </div>
      </div>
      <p className="pe-note">
        Perfect is the best eleven in the packs you opened, chemistry included
        {battled ? ', before Battles' : ''}.
      </p>
      {missed.misses.length === 0 ? (
        <p className="pe-panel-text">You took the best card in every pack.</p>
      ) : (
        <ul className="pe-miss-list">
          {missed.misses.map(({ slot, kept, best }) => (
            <li key={slot} className="pe-miss-row">
              <span className="pe-miss-pos">{SLOTS[slot].short}</span>
              <div className="pe-miss-who">
                <b>{line(best)}</b>
                <small>
                  You took {line(kept)}, {kept.score.toLocaleString()}
                </small>
              </div>
              <div className="pe-miss-gap">
                <b>{best.score.toLocaleString()}</b>
                <small>−{(best.score - kept.score).toLocaleString()}</small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
