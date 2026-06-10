import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Reveal } from '../bits'
import { AnalyzerStudio, VoteBar } from './analyzer-client'

export const metadata = { title: 'The Clubhouse · The Trade Room' }

type Asset = { id: string; name: string; position: string; team: string | null; value: number }
type BoardTrade = {
  id: string
  owner_id: string
  mode: string
  qb_starters: number
  team_count: number
  uses_rosters: boolean
  side_a: { assets: Asset[]; total: number }
  side_b: { assets: Asset[]; total: number }
  delta_pct: number
  grade_a: string
  grade_b: string
  verdict_a: string | null
  verdict_b: string | null
  created_at: string
}

const MODE_LABEL: Record<string, string> = { redraft: 'Redraft', keeper: 'Keeper', dynasty: 'Dynasty' }

export default async function TradeRoomPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const signedIn = !!user

  // Board reads fresh via the admin client (RLS already allows public read;
  // admin keeps it consistent pre/post auth and one client for the joins).
  const admin = createAdminClient()
  const { data: tradeRows } = await admin
    .from('hub_trades')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)
  const trades = (tradeRows ?? []) as BoardTrade[]
  const tradeIds = trades.map((t) => t.id)

  const counts = new Map<string, { a: number; fair: number; b: number }>()
  const myVotes = new Map<string, 'a' | 'fair' | 'b'>()
  const posterName = new Map<string, string>()
  if (tradeIds.length > 0) {
    const { data: voteRows } = await admin
      .from('hub_trade_votes')
      .select('trade_id, user_id, vote')
      .in('trade_id', tradeIds)
    for (const v of voteRows ?? []) {
      const c = counts.get(v.trade_id as string) ?? { a: 0, fair: 0, b: 0 }
      const key = v.vote as 'a' | 'fair' | 'b'
      c[key] += 1
      counts.set(v.trade_id as string, c)
      if (user && v.user_id === user.id) myVotes.set(v.trade_id as string, key)
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

  return (
    <main>
      <section className="hub-hero">
        <div className="hub-hero-sup">★ Wing V · The smoke-filled room ★</div>
        <h1 className="hub-hero-title">
          The <em>Trade Room.</em>
        </h1>
        <p className="hub-hero-sub">
          The league Trade Analyzer, unchained — no league required. Name the players, pick
          the format, and the same consensus value engine weighs the deal. Post the good
          arguments to the board and let the room vote.
        </p>
        <div className="hub-hero-meta">
          <span>{trades.length} on the docket</span>
          <span>·</span>
          <span>Values refresh daily</span>
          {!signedIn && (
            <>
              <span>·</span>
              <Link href="/login" style={{ color: 'var(--hb-gold)', textDecoration: 'none' }}>
                Sign in to analyze →
              </Link>
            </>
          )}
        </div>
      </section>

      {/* ─── §01 The desk ─────────────────────────────────── */}
      <div className="hub-section">
        <div className="hub-section-header">
          <span className="hub-section-num">§ 01 · The desk</span>
          <span className="hub-section-title">Weigh a deal —</span>
          <span className="hub-section-meta">Quick by names · deeper with rosters</span>
        </div>
        {signedIn ? (
          <Reveal>
            <AnalyzerStudio />
          </Reveal>
        ) : (
          <Reveal>
            <div className="hub-promote">
              <div>
                <div className="hub-promote-title">Members <em>only.</em></div>
                <p className="hub-promote-body">
                  The desk is free to use — it just needs a name on the ledger. Sign in,
                  type two sides of a deal, and the consensus value engine (FantasyCalc,
                  KTC, DynastyProcess, FantasyPros, blended) does the arguing.
                </p>
              </div>
              <div className="hub-promote-side">
                <Link href="/login" className="hub-btn">Sign in to the desk →</Link>
                <Link href="/login?mode=signup" className="hub-btn-ghost">Join the Chronicle</Link>
              </div>
            </div>
          </Reveal>
        )}
      </div>

      {/* ─── §02 The docket ───────────────────────────────── */}
      <div className="hub-section">
        <div className="hub-section-header">
          <span className="hub-section-num">§ 02 · The docket</span>
          <span className="hub-section-title">Posted for argument —</span>
          <span className="hub-section-meta">{signedIn ? 'Vote: who won?' : 'Sign in to vote'}</span>
        </div>
        {trades.length === 0 ? (
          <Reveal>
            <p
              style={{
                textAlign: 'center', maxWidth: '540px', margin: '0 auto',
                fontFamily: 'var(--serif)', fontStyle: 'italic',
                fontSize: '1.05rem', lineHeight: 1.6, color: 'var(--hb-mute)',
              }}
            >
              The docket is empty — no trades posted yet. Analyze one above and be the
              first to put a deal up for argument.
            </p>
          </Reveal>
        ) : (
          <div className="hub-tr-board">
            {trades.map((t, i) => (
              <Reveal key={t.id} delay={(i % 2) * 80}>
                <article className="hub-tr-case">
                  <div className="hub-tr-case-head">
                    <span className="hub-tr-case-meta">
                      {MODE_LABEL[t.mode] ?? t.mode} · {t.qb_starters === 2 ? 'Superflex' : '1-QB'} · {t.team_count}-team
                      {t.uses_rosters ? ' · roster-aware' : ''}
                    </span>
                    <span className="hub-tr-case-meta">
                      {posterName.get(t.owner_id) ?? 'A member'} ·{' '}
                      {new Date(t.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <div className="hub-tr-case-sides">
                    {(
                      [
                        ['Side A', t.side_a, t.grade_a, t.verdict_a],
                        ['Side B', t.side_b, t.grade_b, t.verdict_b],
                      ] as const
                    ).map(([label, side, grade, verdict]) => (
                      <div key={label} className="hub-tr-case-side">
                        <div className="hub-tr-report-head">
                          <span className="hub-tr-side-name">{label} sends</span>
                          <span className={`hub-tr-grade g-${grade.replace('+', 'p').replace('-', 'm')}`}>{grade}</span>
                        </div>
                        {side.assets.map((a) => (
                          <div key={a.id} className="hub-tr-row">
                            <span className="hub-tr-pos">{a.position}</span>
                            <span className="hub-tr-row-name">{a.name}</span>
                            <span className="hub-tr-row-val">{a.value.toLocaleString()}</span>
                          </div>
                        ))}
                        <div className="hub-tr-case-total">Total {side.total.toLocaleString()}</div>
                        {verdict && <p className="hub-tr-verdict">{verdict}</p>}
                      </div>
                    ))}
                  </div>
                  <VoteBar
                    tradeId={t.id}
                    initialCounts={counts.get(t.id) ?? { a: 0, fair: 0, b: 0 }}
                    initialMine={myVotes.get(t.id) ?? null}
                    signedIn={signedIn}
                  />
                </article>
              </Reveal>
            ))}
          </div>
        )}
        <p
          style={{
            maxWidth: '720px', margin: '1.6rem auto 0', textAlign: 'center',
            fontSize: '.8rem', lineHeight: 1.6, color: 'var(--hb-mute)',
          }}
        >
          Values are blended market consensus (FantasyCalc · KeepTradeCut · DynastyProcess ·
          FantasyPros · Sleeper), frozen at post time. Quick analyses grade raw asset value;
          roster-aware analyses grade the change in each side&apos;s optimal starting lineup.
          Five posts per member per day keeps the docket honest.
        </p>
      </div>
    </main>
  )
}
