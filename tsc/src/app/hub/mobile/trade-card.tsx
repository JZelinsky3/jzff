import { AdminDelete, Ballot, Headshot } from '../analyzer/analyzer-client'
import type { Docket, DocketTrade } from '../analyzer/board'
import { composeDuelVerdict } from '@/lib/hub/verdict'

// Pocket Clubhouse — the docket slip. A trade card designed for the phone
// instead of the desktop TradeCase squeezed into one column: a one-line
// case head (format only — no poster/date, and no "team trade" tag since
// the slip doesn't show rosters), GET over GIVE with the grade and side
// total on the side bar itself, a dotted "for" seam between them, and a
// footer where the editorial line and the sign/shred pill share one row
// (the verdict fills the space the pill would otherwise waste). A
// 1-for-1 slip is six lines tall; per-player values only appear when a
// side has more than one asset (otherwise the bar total already says it).

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
          <Headshot id={a.id} size={30} />
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
  isAdmin = false,
}: {
  t: DocketTrade
  docket: Docket
  signedIn: boolean
  isAdmin?: boolean
}) {
  // One editorial line per slip. Unlike the two-column desktop docket (a read
  // per side), the phone shows a single writeup, so it names BOTH sides by
  // their headline player and says who wins outright rather than leaning on an
  // ambiguous "this side." One sentence, so the vote pill sits clean beside it.
  const verdict = composeDuelVerdict({
    pct: t.delta_pct,
    getSide: t.side_b.assets,
    giveSide: t.side_a.assets,
  })

  return (
    <article className="mhb-tc">
      <div className="mhb-tc-head">
        <span>
          {MODE_LABEL[t.mode] ?? t.mode} · {t.qb_starters === 2 ? 'Superflex' : '1-QB'} · {t.team_count}-team
        </span>
        {isAdmin && <AdminDelete tradeId={t.id} />}
      </div>

      <Side kind="get" grade={t.grade_a} side={t.side_b} />
      <div className="mhb-tc-for" aria-hidden>for</div>
      <Side kind="give" grade={t.grade_b} side={t.side_a} />

      <div className="mhb-tc-foot">
        {verdict && <p className="mhb-tc-verdict">“{verdict}”</p>}
        <Ballot
          tradeId={t.id}
          initialCounts={docket.counts.get(t.id) ?? { sign: 0, shred: 0 }}
          initialMine={docket.myVotes.get(t.id) ?? null}
          signedIn={signedIn}
        />
      </div>
    </article>
  )
}
