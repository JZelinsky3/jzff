import { Ballot, Headshot } from '../analyzer/analyzer-client'
import type { Docket, DocketTrade } from '../analyzer/board'

// Pocket Clubhouse — the docket slip. A trade card designed for the phone
// instead of the desktop TradeCase squeezed into one column: a one-line
// case head, GET over GIVE with the grade and side total on the side bar
// itself, a dotted "for" seam between them, one editorial line, and the
// sign/shred pill riding the bottom edge. A 1-for-1 slip is seven lines
// tall; per-player values only appear when a side has more than one
// asset (otherwise the bar total already says it).

const MODE_LABEL: Record<string, string> = { redraft: 'Redraft', keeper: 'Keeper', dynasty: 'Dynasty' }

function Side({
  kind,
  grade,
  side,
}: {
  kind: 'get' | 'give'
  grade: string
  side: { assets: DocketTrade['side_a']['assets']; total: number }
}) {
  const showRowValues = side.assets.length > 1
  return (
    <div className="mhb-tc-side">
      <div className="mhb-tc-bar">
        <span className={`mhb-tc-lbl ${kind}`}>{kind === 'get' ? 'You get' : 'You give'}</span>
        <span className={`hub-tr-grade g-${grade.replace('+', 'p').replace('-', 'm')}`}>{grade}</span>
        <span className="mhb-tc-total">{side.total.toLocaleString()}</span>
      </div>
      {side.assets.map((a) => (
        <div key={a.id} className="mhb-tc-row">
          <Headshot id={a.id} size={26} />
          <span className="hub-tr-pos">{a.position}</span>
          <span className="mhb-tc-name">{a.name}</span>
          {showRowValues && <span className="mhb-tc-val">{a.value.toLocaleString()}</span>}
        </div>
      ))}
    </div>
  )
}

export function MobileTradeCard({
  t,
  docket,
  signedIn,
}: {
  t: DocketTrade
  docket: Docket
  signedIn: boolean
}) {
  // One editorial line per slip — the You-side read, since votes are cast
  // from the You chair. Grades still show both sides of the argument.
  const verdict = t.verdict_a ?? t.verdict_b

  return (
    <article className="mhb-tc">
      <div className="mhb-tc-head">
        <span>
          {MODE_LABEL[t.mode] ?? t.mode} · {t.qb_starters === 2 ? 'Superflex' : '1-QB'} · {t.team_count}-team
          {t.uses_rosters ? ' · team trade' : ''}
        </span>
        <span>
          {docket.posterName.get(t.owner_id) ?? 'A member'} ·{' '}
          {new Date(t.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      </div>

      <Side kind="get" grade={t.grade_a} side={t.side_b} />
      <div className="mhb-tc-for" aria-hidden>for</div>
      <Side kind="give" grade={t.grade_b} side={t.side_a} />

      {verdict && <p className="mhb-tc-verdict">“{verdict}”</p>}

      <Ballot
        tradeId={t.id}
        initialCounts={docket.counts.get(t.id) ?? { sign: 0, shred: 0 }}
        initialMine={docket.myVotes.get(t.id) ?? null}
        signedIn={signedIn}
      />
    </article>
  )
}
