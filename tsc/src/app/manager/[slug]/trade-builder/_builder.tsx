'use client'

// Interactive trade builder. Server already valuated every player on every
// roster in every Sleeper league this user has linked; here we just manage
// selection state and render the verdict from the deltas.

import { useMemo, useState } from 'react'
import type { LeagueMode } from '@/lib/values'

export type BuilderPlayer = {
  playerId: string
  name: string
  position: string
  team: string | null
  value: number
  tier: string | null
  age: number | null
}

export type BuilderRoster = {
  ownerId: string
  ownerName: string
  teamName: string
  isMe: boolean
  players: BuilderPlayer[]
  totalValue: number
}

export type BuilderLeague = {
  archiveLeagueId: string
  leagueName: string
  leagueSlug: string
  season: string
  mode: LeagueMode
  modeLabel: string
  valueProviderLabel: string
  myOwnerId: string
  qbStarters: number
  teamCount: number
  rosters: BuilderRoster[]
}

type Verdict = {
  kind: 'fair' | 'you' | 'them'
  marginValue: number
  marginPct: number
  headline: string
  blurb: string
}

const FAIR_THRESHOLD_PCT = 5     // ≤5% diff = fair
const STEAL_THRESHOLD_PCT = 20   // ≥20% diff = lopsided

function computeVerdict(youSendValue: number, youGetValue: number): Verdict {
  if (youSendValue === 0 && youGetValue === 0) {
    return {
      kind: 'fair',
      marginValue: 0,
      marginPct: 0,
      headline: 'Empty trade.',
      blurb: 'Pick players from each side to see the value swing.',
    }
  }
  const margin = youGetValue - youSendValue
  const denom = Math.max(youSendValue, youGetValue)
  const marginPct = denom > 0 ? Math.abs((margin / denom) * 100) : 0
  if (marginPct <= FAIR_THRESHOLD_PCT) {
    return {
      kind: 'fair',
      marginValue: Math.abs(margin),
      marginPct,
      headline: 'Fair trade.',
      blurb: `Both sides land inside ${FAIR_THRESHOLD_PCT}% — defensible either way.`,
    }
  }
  if (margin > 0) {
    return {
      kind: 'you',
      marginValue: margin,
      marginPct,
      headline: marginPct >= STEAL_THRESHOLD_PCT ? 'You win — by a lot.' : 'You come out ahead.',
      blurb: `You gain ${Math.round(margin).toLocaleString()} in trade value (+${marginPct.toFixed(1)}%).`,
    }
  }
  return {
    kind: 'them',
    marginValue: -margin,
    marginPct,
    headline: marginPct >= STEAL_THRESHOLD_PCT ? 'They walk away with it.' : 'You give up the edge.',
    blurb: `You lose ${Math.round(-margin).toLocaleString()} in trade value (-${marginPct.toFixed(1)}%).`,
  }
}

const STYLES = `
.tb { display: flex; flex-direction: column; gap: 1.5rem; }
.tb-controls { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1rem; }
@media (max-width: 720px) { .tb-controls { grid-template-columns: 1fr; } }
.tb-control { display: flex; flex-direction: column; gap: .35rem; }
.tb-control label { font-family: var(--mono); font-weight: 700; font-size: .58rem; letter-spacing: .25em; text-transform: uppercase; color: var(--gold); }
.tb-control select { background: var(--ink-card); color: var(--cream); border: 1px solid var(--ink-line); padding: .65rem .85rem; font-family: var(--mono); font-size: .8rem; letter-spacing: .04em; border-radius: 2px; }
.tb-control select:focus { outline: none; border-color: var(--gold); }

.tb-meta { display: flex; gap: 1rem; flex-wrap: wrap; padding: .9rem 1rem; background: var(--ink-card); border: 1px solid var(--ink-line); font-family: var(--mono); font-size: .58rem; letter-spacing: .22em; text-transform: uppercase; color: var(--cream-mute); }
.tb-meta strong { color: var(--gold); font-weight: 700; }

.tb-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1.25rem; }
@media (max-width: 820px) { .tb-grid { grid-template-columns: 1fr; } }
.tb-col { background: linear-gradient(180deg, rgba(232,200,137,.03), transparent), var(--ink-card); border: 1px solid var(--ink-line); padding: 1.1rem 1.1rem 1rem; position: relative; }
.tb-col::before { content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 3px; }
.tb-col.send::before { background: var(--rust); }
.tb-col.get::before { background: var(--gold); }
.tb-col-head { display: flex; justify-content: space-between; align-items: baseline; gap: .75rem; padding-bottom: .65rem; margin-bottom: .8rem; border-bottom: 1px dotted var(--ink-line); }
.tb-col-title { font-family: var(--mono); font-weight: 700; font-size: .6rem; letter-spacing: .28em; text-transform: uppercase; }
.tb-col.send .tb-col-title { color: var(--rust); }
.tb-col.get .tb-col-title { color: var(--gold); }
.tb-col-team { font-family: var(--serif); font-style: italic; font-size: 1.05rem; color: var(--cream); }

.tb-row { display: grid; grid-template-columns: auto 1fr auto; gap: .65rem; align-items: center; padding: .5rem .25rem; border-bottom: 1px dotted var(--ink-line-soft); cursor: pointer; transition: background .15s; }
.tb-row:hover { background: rgba(232,200,137,.04); }
.tb-row.selected { background: rgba(232,200,137,.08); }
.tb-row input { accent-color: var(--gold); }
.tb-row-name { font-family: var(--serif); font-size: .92rem; color: var(--cream); }
.tb-row-name em { font-style: italic; color: var(--gold-deep); font-size: .8em; margin-left: .35rem; }
.tb-row-meta { font-family: var(--mono); font-size: .52rem; letter-spacing: .15em; text-transform: uppercase; color: var(--cream-mute); margin-top: .12rem; }
.tb-row-value { font-family: var(--mono); font-weight: 700; font-size: .8rem; color: var(--gold); font-variant-numeric: tabular-nums; }

.tb-empty { padding: 1rem; text-align: center; font-family: var(--serif); font-style: italic; color: var(--cream-mute); }
.tb-list-wrap { max-height: 460px; overflow-y: auto; padding-right: .25rem; }
.tb-list-wrap::-webkit-scrollbar { width: 6px; }
.tb-list-wrap::-webkit-scrollbar-thumb { background: var(--gold-deep); border-radius: 3px; }
.tb-list-wrap::-webkit-scrollbar-track { background: transparent; }

.tb-totals { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 1rem; align-items: center; padding: 1.25rem 1.25rem; border: 2px solid var(--gold-deep); background: var(--ink-soft); }
.tb-totals-side { text-align: center; }
.tb-totals-side .label { font-family: var(--mono); font-weight: 700; font-size: .55rem; letter-spacing: .28em; text-transform: uppercase; color: var(--cream-mute); margin-bottom: .25rem; }
.tb-totals-side .value { font-family: var(--serif); font-style: italic; font-size: clamp(2rem, 4vw, 2.8rem); line-height: 1; color: var(--cream); font-variant-numeric: tabular-nums; }
.tb-totals-side.send .value { color: var(--rust); }
.tb-totals-side.get .value { color: var(--gold); }
.tb-totals-sep { font-family: var(--serif); font-style: italic; color: var(--gold-deep); font-size: 2rem; }

.tb-verdict { padding: 1.4rem 1.5rem; border: 1px solid var(--ink-line); background: var(--ink-card); position: relative; }
.tb-verdict::before { content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 4px; }
.tb-verdict.you::before { background: var(--gold); }
.tb-verdict.them::before { background: var(--rust); }
.tb-verdict.fair::before { background: var(--steel); }
.tb-verdict-kicker { font-family: var(--mono); font-weight: 700; font-size: .58rem; letter-spacing: .28em; text-transform: uppercase; margin-bottom: .5rem; }
.tb-verdict.you .tb-verdict-kicker { color: var(--gold); }
.tb-verdict.them .tb-verdict-kicker { color: var(--rust); }
.tb-verdict.fair .tb-verdict-kicker { color: var(--steel); }
.tb-verdict-head { font-family: var(--serif); font-size: clamp(1.4rem, 2.4vw, 1.9rem); line-height: 1.15; color: var(--cream); margin-bottom: .35rem; }
.tb-verdict-head em { color: var(--gold); font-style: italic; }
.tb-verdict-blurb { font-family: var(--serif); font-style: italic; font-size: 1.02rem; color: var(--cream-soft); line-height: 1.55; }
.tb-verdict-bar { margin-top: 1rem; height: 10px; display: grid; grid-template-columns: var(--send-pct, 50%) var(--get-pct, 50%); border: 1px solid var(--ink-line); }
.tb-verdict-bar .send { background: var(--rust); }
.tb-verdict-bar .get { background: var(--gold); }

.tb-reset { align-self: flex-end; font-family: var(--mono); font-size: .58rem; letter-spacing: .22em; text-transform: uppercase; color: var(--gold); background: none; border: 1px solid var(--gold-deep); padding: .5rem .85rem; cursor: pointer; transition: background .15s, color .15s; }
.tb-reset:hover { background: var(--gold); color: var(--ink); }

.tb-search { width: 100%; background: var(--ink-soft); border: 1px solid var(--ink-line); color: var(--cream); padding: .5rem .65rem; font-family: var(--mono); font-size: .7rem; letter-spacing: .04em; border-radius: 2px; margin-bottom: .6rem; }
.tb-search:focus { outline: none; border-color: var(--gold); }
`

export function TradeBuilder({ leagues }: { leagues: BuilderLeague[] }) {
  const [leagueIdx, setLeagueIdx] = useState(0)
  const league = leagues[leagueIdx]
  const me = league.rosters.find((r) => r.isMe) ?? league.rosters[0]
  const otherRosters = league.rosters.filter((r) => !r.isMe)

  const [opponentIdx, setOpponentIdx] = useState(0)
  const opponent = otherRosters[opponentIdx] ?? otherRosters[0]

  // selected playerIds, side-scoped
  const [sendSel, setSendSel] = useState<Set<string>>(new Set())
  const [getSel, setGetSel] = useState<Set<string>>(new Set())
  const [sendQ, setSendQ] = useState('')
  const [getQ, setGetQ] = useState('')

  // Switching league or opponent resets selections — they're not portable.
  const onLeagueChange = (i: number) => {
    setLeagueIdx(i)
    setOpponentIdx(0)
    setSendSel(new Set())
    setGetSel(new Set())
  }
  const onOpponentChange = (i: number) => {
    setOpponentIdx(i)
    setGetSel(new Set())
  }
  const reset = () => { setSendSel(new Set()); setGetSel(new Set()) }

  const toggle = (set: Set<string>, setFn: (s: Set<string>) => void, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id); else next.add(id)
    setFn(next)
  }

  const sendPlayers = useMemo(() => me.players.filter((p) => sendSel.has(p.playerId)), [me, sendSel])
  const getPlayers = useMemo(() => (opponent?.players ?? []).filter((p) => getSel.has(p.playerId)), [opponent, getSel])
  const sendValue = sendPlayers.reduce((s, p) => s + p.value, 0)
  const getValue = getPlayers.reduce((s, p) => s + p.value, 0)

  const verdict = computeVerdict(sendValue, getValue)
  const totalSwing = sendValue + getValue
  const sendPct = totalSwing > 0 ? `${(sendValue / totalSwing) * 100}%` : '50%'
  const getPct = totalSwing > 0 ? `${(getValue / totalSwing) * 100}%` : '50%'

  const filterPlayers = (players: BuilderPlayer[], q: string) => {
    const needle = q.trim().toLowerCase()
    if (!needle) return players
    return players.filter((p) =>
      p.name.toLowerCase().includes(needle) ||
      p.position.toLowerCase().includes(needle) ||
      (p.team ?? '').toLowerCase().includes(needle),
    )
  }
  const sendList = filterPlayers(me.players, sendQ)
  const getList = filterPlayers(opponent?.players ?? [], getQ)

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className="tb">
        <div className="tb-controls">
          <div className="tb-control">
            <label htmlFor="tb-league">League</label>
            <select id="tb-league" value={leagueIdx} onChange={(e) => onLeagueChange(Number(e.target.value))}>
              {leagues.map((l, i) => (
                <option key={l.archiveLeagueId} value={i}>
                  {l.leagueName} · {l.season} · {l.modeLabel}{l.qbStarters >= 2 ? ' · SF' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="tb-control">
            <label htmlFor="tb-opp">Counterparty</label>
            <select id="tb-opp" value={opponentIdx} onChange={(e) => onOpponentChange(Number(e.target.value))} disabled={otherRosters.length === 0}>
              {otherRosters.length === 0 && <option>— no other rosters —</option>}
              {otherRosters.map((r, i) => (
                <option key={r.ownerId} value={i}>{r.teamName} · {r.ownerName}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="tb-meta">
          <span>Mode <strong>{league.modeLabel}</strong></span>
          <span>Values <strong>{league.valueProviderLabel}</strong></span>
          <span>Teams <strong>{league.teamCount}</strong></span>
          <span>QB starters <strong>{league.qbStarters}{league.qbStarters >= 2 ? ' (SF)' : ''}</strong></span>
        </div>

        <div className="tb-grid">
          <SideColumn
            kind="send"
            heading="You send"
            team={me.teamName}
            players={sendList}
            selectedIds={sendSel}
            query={sendQ}
            onQueryChange={setSendQ}
            onToggle={(id) => toggle(sendSel, setSendSel, id)}
          />
          <SideColumn
            kind="get"
            heading="You get"
            team={opponent?.teamName ?? '—'}
            players={getList}
            selectedIds={getSel}
            query={getQ}
            onQueryChange={setGetQ}
            onToggle={(id) => toggle(getSel, setGetSel, id)}
          />
        </div>

        <div className="tb-totals">
          <div className="tb-totals-side send">
            <div className="label">You send</div>
            <div className="value">{Math.round(sendValue).toLocaleString()}</div>
            <div className="label" style={{ marginTop: '.3rem' }}>{sendPlayers.length} {sendPlayers.length === 1 ? 'piece' : 'pieces'}</div>
          </div>
          <div className="tb-totals-sep">↔</div>
          <div className="tb-totals-side get">
            <div className="label">You get</div>
            <div className="value">{Math.round(getValue).toLocaleString()}</div>
            <div className="label" style={{ marginTop: '.3rem' }}>{getPlayers.length} {getPlayers.length === 1 ? 'piece' : 'pieces'}</div>
          </div>
        </div>

        <div className={`tb-verdict ${verdict.kind}`}>
          <div className="tb-verdict-kicker">Verdict · {league.valueProviderLabel}</div>
          <div className="tb-verdict-head">{verdict.headline}</div>
          <div className="tb-verdict-blurb">{verdict.blurb}</div>
          <div
            className="tb-verdict-bar"
            style={{
              ['--send-pct' as string]: sendPct,
              ['--get-pct' as string]: getPct,
            } as React.CSSProperties}
          >
            <div className="send" />
            <div className="get" />
          </div>
        </div>

        <button type="button" className="tb-reset" onClick={reset}>Reset selection</button>
      </div>
    </>
  )
}

function SideColumn({
  kind, heading, team, players, selectedIds, query, onQueryChange, onToggle,
}: {
  kind: 'send' | 'get'
  heading: string
  team: string
  players: BuilderPlayer[]
  selectedIds: Set<string>
  query: string
  onQueryChange: (q: string) => void
  onToggle: (id: string) => void
}) {
  return (
    <div className={`tb-col ${kind}`}>
      <div className="tb-col-head">
        <div className="tb-col-title">{heading}</div>
        <div className="tb-col-team">{team}</div>
      </div>
      <input
        className="tb-search"
        type="search"
        placeholder="Filter by name, position, team…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      <div className="tb-list-wrap">
        {players.length === 0 && <div className="tb-empty">No players on this roster.</div>}
        {players.map((p) => {
          const sel = selectedIds.has(p.playerId)
          return (
            <label key={p.playerId} className={`tb-row${sel ? ' selected' : ''}`}>
              <input type="checkbox" checked={sel} onChange={() => onToggle(p.playerId)} />
              <div>
                <div className="tb-row-name">
                  {p.name}
                  {p.tier && <em>· {p.tier}</em>}
                </div>
                <div className="tb-row-meta">
                  {p.position}{p.team ? ` · ${p.team}` : ''}{p.age ? ` · age ${p.age}` : ''}
                </div>
              </div>
              <div className="tb-row-value">{p.value.toLocaleString()}</div>
            </label>
          )
        })}
      </div>
    </div>
  )
}
