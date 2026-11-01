// The top of the binder: who has collected the most, and the best cards anyone
// kept this week. Daily keeps count for neither, the same as the binder itself.

import { RARITY_LOOK } from '@/lib/packEmpire/rules'
import type { Leaders } from '@/lib/packEmpire/binder'
import { Face } from './cards'

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })

export function LeaderBoards({ data }: { data: Leaders }) {
  return (
    <div className="pe-lead">
      <div className="pe-lead-col">
        <div className="pe-lead-head">
          <h3>Top Collectors</h3>
          <span>Cards Kept</span>
        </div>
        {data.collectors.length === 0 ? (
          <p className="pe-lead-none">Nobody has filed a card yet.</p>
        ) : (
          data.collectors.map((c, i) => (
            <div key={c.name} className="pe-lead-row">
              <span className="pe-lead-rank">{i + 1}</span>
              <Face player={c.best} name={c.name} />
              <span className="pe-lead-who">
                <b>{c.name}</b>
                <small>
                  {c.cantons > 0 && <em style={{ color: RARITY_LOOK.canton.color }}>{c.cantons} Canton · </em>}
                  {c.immortals > 0 && <em style={{ color: RARITY_LOOK.immortal.color }}>{c.immortals} Immortal · </em>}
                  {c.best ? `Best: ${c.best.name} ${c.best.year ?? ''}`.trim() : ''}
                </small>
              </span>
              <span className="pe-lead-num">
                <b>{c.cards.toLocaleString()}</b>
              </span>
            </div>
          ))
        )}
      </div>

      <div className="pe-lead-col">
        <div className="pe-lead-head">
          <h3>Pulls Of The Week</h3>
          <span>Since Monday</span>
        </div>
        {data.pulls.length === 0 ? (
          <p className="pe-lead-none">Nothing pulled yet this week.</p>
        ) : (
          data.pulls.map((p, i) => (
            <div key={`${p.name}-${p.card.id}`} className="pe-lead-row">
              <span className="pe-lead-rank">{i + 1}</span>
              <Face player={p.card} />
              <span className="pe-lead-who">
                <b>{p.card.name}</b>
                <small>
                  {p.name} · {p.draft}
                  {p.total != null ? ` · ${p.total.toLocaleString()}` : ''} · {shortDate(p.at)}
                </small>
              </span>
              <span className="pe-lead-num" style={{ '--rc': RARITY_LOOK[p.card.rarity].color } as React.CSSProperties}>
                <b>{p.card.score.toLocaleString()}</b>
                <small>{p.card.year}</small>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
