// Shared docket pieces for the Trade Room: the data fetch and the case
// card. Used by the main page (top of the docket) and /hub/analyzer/docket
// (the full board) so the two never drift.

import { createAdminClient } from '@/lib/supabase/admin'
import { Ballot, Headshot } from './analyzer-client'

export type DocketAsset = { id: string; name: string; position: string; team: string | null; value: number }
export type DocketRosterPlayer = { name: string; position: string }
export type DocketTrade = {
  id: string
  owner_id: string
  mode: string
  qb_starters: number
  team_count: number
  uses_rosters: boolean
  side_a: { assets: DocketAsset[]; total: number }
  side_b: { assets: DocketAsset[]; total: number }
  roster_a: { players: DocketRosterPlayer[] } | null
  roster_b: { players: DocketRosterPlayer[] } | null
  delta_pct: number
  grade_a: string
  grade_b: string
  verdict_a: string | null
  verdict_b: string | null
  created_at: string
}

export type Docket = {
  trades: DocketTrade[]
  counts: Map<string, { sign: number; shred: number }>
  myVotes: Map<string, 'sign' | 'shred'>
  posterName: Map<string, string>
  /** trades sorted hottest-first (most total votes, then newest) */
  hottest: DocketTrade[]
}

const MODE_LABEL: Record<string, string> = { redraft: 'Redraft', keeper: 'Keeper', dynasty: 'Dynasty' }

export async function fetchDocket(limit: number, userId: string | null): Promise<Docket> {
  const admin = createAdminClient()
  const { data: tradeRows } = await admin
    .from('hub_trades')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  const trades = (tradeRows ?? []) as DocketTrade[]
  const tradeIds = trades.map((t) => t.id)

  const counts = new Map<string, { sign: number; shred: number }>()
  const myVotes = new Map<string, 'sign' | 'shred'>()
  const posterName = new Map<string, string>()
  if (tradeIds.length > 0) {
    const { data: voteRows } = await admin
      .from('hub_trade_votes')
      .select('trade_id, user_id, vote')
      .in('trade_id', tradeIds)
    for (const v of voteRows ?? []) {
      const c = counts.get(v.trade_id as string) ?? { sign: 0, shred: 0 }
      const key = v.vote as 'sign' | 'shred'
      c[key] += 1
      counts.set(v.trade_id as string, c)
      if (userId && v.user_id === userId) myVotes.set(v.trade_id as string, key)
    }
    const ownerIds = [...new Set(trades.map((t) => t.owner_id))]
    const { data: profileRows } = await admin
      .from('profiles')
      .select('id, display_name')
      .in('id', ownerIds)
    for (const p of profileRows ?? []) {
      // Never show a full email — same rule as the Front Desk greeting.
      const raw = ((p.display_name as string | null) ?? 'A member').split('@')[0].trim()
      posterName.set(p.id as string, raw || 'A member')
    }
  }

  const heat = (t: DocketTrade) => {
    const c = counts.get(t.id) ?? { sign: 0, shred: 0 }
    return c.sign + c.shred
  }
  const hottest = [...trades].sort(
    (a, b) => heat(b) - heat(a) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return { trades, counts, myVotes, posterName, hottest }
}

// Compact roster context for roster-aware trades — position-sorted text,
// no headshots, so team trades read as teams without drowning the card.
const POS_ORDER: Record<string, number> = { QB: 0, RB: 1, WR: 2, TE: 3 }
function RosterNote({ label, roster }: { label: string; roster: { players: DocketRosterPlayer[] } | null }) {
  if (!roster?.players?.length) return null
  const sorted = [...roster.players].sort(
    (a, b) => (POS_ORDER[a.position] ?? 9) - (POS_ORDER[b.position] ?? 9) || a.name.localeCompare(b.name)
  )
  return (
    <div className="hub-tr-roster-note">
      <span className="hub-tr-roster-note-lbl">{label}</span>
      {sorted.map((p, i) => (
        <span key={`${p.name}-${i}`} className="hub-tr-roster-note-item">
          <em>{p.position}</em> {p.name}
        </span>
      ))}
    </div>
  )
}

export function TradeCase({
  t,
  docket,
  signedIn,
}: {
  t: DocketTrade
  docket: Docket
  signedIn: boolean
}) {
  return (
    <article className="hub-tr-case">
      <div className="hub-tr-case-head">
        <span className="hub-tr-case-meta">
          {MODE_LABEL[t.mode] ?? t.mode} · {t.qb_starters === 2 ? 'Superflex' : '1-QB'} · {t.team_count}-team
          {t.uses_rosters ? ' · team trade' : ''}
        </span>
        <span className="hub-tr-case-meta">
          {docket.posterName.get(t.owner_id) ?? 'A member'} ·{' '}
          {new Date(t.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      </div>
      {/* Framed from the poster's seat: "You receive" lists what side B sends
          (with YOUR grade — grades score what a side gets), "You send" lists
          what side A gives up (with the other manager's grade). Voters sign
          or shred the deal as if they were sitting in the You chair. */}
      <div className="hub-tr-case-sides">
        {(
          [
            ['You receive', t.side_b, t.grade_a, t.verdict_a, t.roster_a, 'Your roster'],
            ['You send', t.side_a, t.grade_b, t.verdict_b, t.roster_b, 'Their roster'],
          ] as const
        ).map(([label, side, grade, verdict, roster, rosterLabel]) => (
          <div key={label} className="hub-tr-case-side">
            <div className="hub-tr-report-head">
              <span className="hub-tr-side-name">{label}</span>
              <span className={`hub-tr-grade g-${grade.replace('+', 'p').replace('-', 'm')}`}>{grade}</span>
            </div>
            <div className="hub-tr-case-rows">
              {side.assets.map((a) => (
                <div key={a.id} className="hub-tr-row">
                  <Headshot id={a.id} size={22} />
                  <span className="hub-tr-pos">{a.position}</span>
                  <span className="hub-tr-row-name">{a.name}</span>
                  <span className="hub-tr-row-val">{a.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="hub-tr-case-foot">
              <div className="hub-tr-case-total">Total {side.total.toLocaleString()}</div>
              {verdict && <p className="hub-tr-verdict">{verdict}</p>}
              {t.uses_rosters && <RosterNote label={rosterLabel} roster={roster} />}
            </div>
          </div>
        ))}
      </div>
      <Ballot
        tradeId={t.id}
        initialCounts={docket.counts.get(t.id) ?? { sign: 0, shred: 0 }}
        initialMine={docket.myVotes.get(t.id) ?? null}
        signedIn={signedIn}
      />
    </article>
  )
}
