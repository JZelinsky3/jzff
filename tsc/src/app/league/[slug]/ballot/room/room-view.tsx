'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ensureBallotToken, clearBallot, importBallotLines,
  lockBoard, unlockBoard, setRevealed, clearVote,
} from '@/app/ballot/actions'
import {
  GAMES, PROPS, RIVALRIES, SPLIT_GAP, TOTAL_WINS, boardTotals, rivalryKey,
  tallyChoices, tallyLines,
  type BallotManager, type BoardBasis, type BoardLine, type LockedBoard,
  type Picks, type VoteRecord,
} from '@/lib/winBallot'

type Ballot = { name: string; picks: Picks; total: number; at: string }

const BASIS_LABEL: Record<BoardBasis, string> = {
  all: 'Every ballot',
  outsiders: 'Outsiders only',
}
const BASIS_NOTE: Record<BoardBasis, string> = {
  all: 'All twelve ballots count toward every line, a manager’s own included.',
  outsiders: 'A manager’s own projection of themselves is thrown out. Eleven ballots per line.',
}

export function RoomView({
  leagueId, origin, roster, ballots, board, outsiderBoard, locked, votes, token,
}: {
  leagueId: string
  origin: string
  roster: BallotManager[]
  ballots: Ballot[]
  board: BoardLine[]
  outsiderBoard: BoardLine[]
  locked: LockedBoard | null
  votes: VoteRecord[]
  token: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [showBallots, setShowBallots] = useState(false)
  const [showCards, setShowCards] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [paste, setPaste] = useState('')
  // Which reading of the ballots is on screen, and the one a lock would use.
  const [basis, setBasis] = useState<BoardBasis>(locked?.basis ?? 'outsiders')

  const inNames = new Set(ballots.map((b) => b.name))
  const votedNames = new Set(votes.map((v) => v.name))
  // The public ballot lives at /ballot/<token>, outside /league/, because
  // the league layout bounces signed-out visitors to /login and the whole
  // point of this link is that it needs no account. The origin is resolved
  // server-side so the full link is right in the HTML, ready to copy.
  const link = token ? `${origin}/ballot/${token}` : null
  const complete = ballots.length === roster.length

  const shown = basis === 'all' ? board : outsiderBoard
  const other = basis === 'all' ? outsiderBoard : board
  const otherLine = (name: string) => other.find((l) => l.name === name)?.line ?? 0
  const moved = shown.filter((l) => l.line !== otherLine(l.name)).length

  // A season holds exactly 84 wins. What the twelve averages add up to says
  // whether the room likes everybody or nobody.
  const totals = boardTotals(shown)
  const drift = totals.mean - TOTAL_WINS

  async function makeLink(rotate: boolean) {
    setBusy(true); setMsg(null)
    const result = await ensureBallotToken(leagueId, rotate)
    setBusy(false)
    if (!result.ok) { setMsg(result.error); return }
    setMsg(rotate ? 'New link made. The old one is dead.' : 'Link ready.')
    router.refresh()
  }

  function copy(text: string, label: string) {
    navigator.clipboard?.writeText(text).then(
      () => setMsg(`${label} copied.`),
      () => setMsg('Copy blocked. Select it by hand.')
    )
  }

  function copyBoard() {
    const rows = locked
      ? [...roster].map((m) => ({ name: m.name, line: locked.lines[m.name] ?? 0 })).sort((a, b) => b.line - a.line)
      : shown.map((l) => ({ name: l.name, line: l.line }))
    const width = Math.max(...rows.map((r) => r.name.length))
    const count = locked ? locked.ballotCount : ballots.length
    copy([
      'PA MILK SOCIETY 2026 WIN TOTALS',
      `The board, set by ${count} ballot${count === 1 ? '' : 's'}`,
      '',
      ...rows.map((r) => `${r.name.padEnd(width + 2)}${r.line.toFixed(1)}`),
    ].join('\n'), 'Board')
  }

  async function runImport() {
    setBusy(true); setMsg(null)
    const r = await importBallotLines(leagueId, paste)
    setBusy(false)
    if (!r.ok) { setMsg(r.error); return }
    const bits: string[] = []
    if (r.filed.length) bits.push(`Filed ${r.filed.join(', ')}.`)
    if (r.skipped.length) bits.push(`Skipped: ${r.skipped.join(' · ')}`)
    setMsg(bits.join(' ') || 'Nothing in that paste looked like a ballot line.')
    if (r.filed.length) setPaste('')
    router.refresh()
  }

  function reopen(name: string) {
    if (!confirm(`Reopen ${name}'s ballot? Their numbers are deleted and they can file again.`)) return
    setBusy(true)
    startTransition(async () => {
      const r = await clearBallot(leagueId, name)
      setBusy(false)
      setMsg(r.ok ? `${name} can file again.` : r.error)
      router.refresh()
    })
  }

  function reopenCard(name: string) {
    if (!confirm(`Reopen ${name}'s card? Their picks are deleted and they can vote again.`)) return
    setBusy(true)
    startTransition(async () => {
      const r = await clearVote(leagueId, name)
      setBusy(false)
      setMsg(r.ok ? `${name} can vote again.` : r.error)
      router.refresh()
    })
  }

  function lock() {
    const note = ballots.length < roster.length
      ? `\n\nOnly ${ballots.length} of ${roster.length} ballots are in. Anybody who hasn't filed loses their say in the lines, but can still vote.`
      : ''
    if (!confirm(`Set the lines off ${BASIS_LABEL[basis].toLowerCase()}?\n\nThe ballot closes and the same link becomes the over/under card. The numbers stop moving.${note}`)) return
    setBusy(true)
    startTransition(async () => {
      const r = await lockBoard(leagueId, basis)
      setBusy(false)
      setMsg(r.ok ? 'Lines are up. The link is now the over/under card.' : r.error)
      router.refresh()
    })
  }

  function unlock() {
    const note = votes.length ? `\n\n${votes.length} card${votes.length === 1 ? '' : 's'} already cast will be deleted, since they were taken against numbers that would no longer stand.` : ''
    if (!confirm(`Tear the board down and go back to ballots?${note}`)) return
    setBusy(true)
    startTransition(async () => {
      const r = await unlockBoard(leagueId)
      setBusy(false)
      setMsg(r.ok ? `Back on ballots. ${r.votesDropped} card${r.votesDropped === 1 ? '' : 's'} dropped.` : r.error)
      router.refresh()
    })
  }

  function reveal(open: boolean) {
    if (open && !confirm(`Open the room?\n\nEverybody holding the link sees every pick, and voting is over.`)) return
    setBusy(true)
    startTransition(async () => {
      const r = await setRevealed(leagueId, open)
      setBusy(false)
      setMsg(r.ok ? (open ? 'The room is open. The link is now the results.' : 'Sealed back up.') : r.error)
      router.refresh()
    })
  }

  const phase = !locked ? 'ballots' : locked.revealed ? 'open' : 'voting'
  const lineTallies = locked ? tallyLines(roster, locked, votes) : []

  return (
    <div className="wb">
      <div className="wb-shell">
        <div className="wb-room-head">
          <div className="wb-eyebrow">Ballot room · 2026 win totals</div>
          <h1 className="wb-room-title">
            {phase === 'ballots'
              ? complete ? 'All twelve are in.' : 'Waiting on the room.'
              : phase === 'voting'
              ? votes.length === roster.length ? 'Every card is in.' : 'The lines are up.'
              : 'The room is open.'}
          </h1>
        </div>

        <div style={{ marginTop: '1.4rem' }}>
          <div className="wb-turnout-no">
            {phase === 'ballots' ? ballots.length : votes.length}<small>/{roster.length}</small>
          </div>
          <div className="wb-turnout-label">{phase === 'ballots' ? 'ballots filed' : 'cards cast'}</div>
          <div className="wb-chips">
            {roster.map((m) => (
              <span key={m.name} className="wb-chip"
                    data-in={phase === 'ballots' ? inNames.has(m.name) : votedNames.has(m.name)}>
                {m.name}
              </span>
            ))}
          </div>
          {phase !== 'ballots' && (
            <div className="wb-board-sub" style={{ marginTop: '-1rem', marginBottom: '1.6rem' }}>
              {ballots.length} of {roster.length} filed a ballot
            </div>
          )}
        </div>

        <div className="wb-share">
          <div className="wb-share-label">
            The link to send the group
            {phase === 'voting' ? ' · opens the over/under card' : phase === 'open' ? ' · opens the results' : ''}
          </div>
          {link ? (
            <>
              <div className="wb-share-url">{link}</div>
              <div className="wb-share-actions">
                <button className="wb-btn wb-btn-quiet" type="button" onClick={() => copy(link, 'Link')}>
                  Copy link
                </button>
                <button className="wb-btn wb-btn-quiet" type="button" disabled={busy}
                        onClick={() => makeLink(true)}>
                  Make a new link
                </button>
              </div>
            </>
          ) : (
            <div className="wb-share-actions">
              <button className="wb-btn" type="button" disabled={busy} onClick={() => makeLink(false)}>
                {busy ? 'Working…' : 'Make the link'}
              </button>
            </div>
          )}
          {msg && <div className="wb-board-sub" style={{ marginTop: '.6rem' }}>{msg}</div>}
        </div>

        {/* Anybody who filled in the old artifact and texted a PAMS26 line
            can be filed here instead of being asked to do it all again. */}
        {phase === 'ballots' && (
          <div className="wb-share">
            <div className="wb-share-label">Ballot lines people already texted you</div>
            {showImport ? (
              <>
                <textarea
                  className="wb-paste"
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder="PAMS26.JOEY.8-7-9-6-7-8-9-7-6-8-7-5.T89"
                  aria-label="Paste ballot lines, one per row"
                />
                <div className="wb-share-actions" style={{ marginTop: '.6rem' }}>
                  <button className="wb-btn" type="button" disabled={busy || !paste.trim()} onClick={runImport}>
                    {busy ? 'Filing…' : 'File these'}
                  </button>
                  <button className="wb-btn wb-btn-quiet" type="button" onClick={() => setShowImport(false)}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <div className="wb-share-actions">
                <button className="wb-btn wb-btn-quiet" type="button" onClick={() => setShowImport(true)}>
                  Paste old ballot lines
                </button>
              </div>
            )}
          </div>
        )}

        <div className="wb-section">
          {locked ? 'The board, as locked' : 'The board'}
        </div>

        {ballots.length === 0 ? (
          <div className="wb-empty">No ballots yet</div>
        ) : (
          <>
            {/* Two readings of the same ballots. The one on screen is also the
                one a lock would freeze. */}
            <div className="wb-basis">
              {(['all', 'outsiders'] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  className="wb-basis-btn"
                  aria-pressed={basis === b}
                  onClick={() => setBasis(b)}
                >
                  {BASIS_LABEL[b]}
                  {locked?.basis === b && <em>locked</em>}
                </button>
              ))}
            </div>
            <div className="wb-basis-note">
              {BASIS_NOTE[basis]}
              {' '}
              {moved === 0
                ? 'Both readings give the same twelve lines.'
                : `${moved} line${moved === 1 ? '' : 's'} sit${moved === 1 ? 's' : ''} differently the other way.`}
            </div>

            <div className="wb-totals">
              <div className="wb-total">
                <b>{totals.mean.toFixed(1)}</b>
                <span>averages added up</span>
              </div>
              <div className="wb-total" data-tone={Math.abs(drift) > 3 ? 'off' : ''}>
                <b>{drift >= 0 ? '+' : ''}{drift.toFixed(1)}</b>
                <span>off the {TOTAL_WINS} a season holds</span>
              </div>
              <div className="wb-total">
                <b>{totals.line.toFixed(1)}</b>
                <span>the twelve lines added up</span>
              </div>
            </div>

            <div className="wb-board">
              {shown.map((l) => {
                const alt = otherLine(l.name)
                const delta = l.line - alt
                const live = locked ? locked.lines[l.name] : null
                return (
                  <div key={l.name} className="wb-board-row" data-split={l.gap >= SPLIT_GAP}>
                    <div className="wb-board-main">
                      <div className="wb-board-name">{l.name}</div>
                      <div className="wb-board-sub">
                        <span className="wb-conf-mark" data-conf={l.conference}>{l.conference}</span>
                        {' · '}ballots ran {l.low} to {l.high}
                        {l.self !== null && <> · called self {l.self}</>}
                        {delta !== 0 && (
                          <> · <b>{BASIS_LABEL[basis === 'all' ? 'outsiders' : 'all'].toLowerCase()} {alt.toFixed(1)}</b></>
                        )}
                        {l.gap >= SPLIT_GAP && <> · <b>split room</b></>}
                      </div>
                    </div>
                    <div>
                      <div className="wb-board-line">{l.line.toFixed(1)}</div>
                      <div className="wb-board-raw">
                        {live !== null && live !== l.line
                          ? `locked at ${live.toFixed(1)} · ${l.count} in`
                          : `mean ${l.mean.toFixed(2)} · ${l.count} in`}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="wb-share-actions" style={{ marginTop: '1rem' }}>
              <button className="wb-btn wb-btn-quiet" type="button" onClick={copyBoard}>Copy the board</button>
              <button className="wb-btn wb-btn-quiet" type="button" onClick={() => setShowBallots((v) => !v)}>
                {showBallots ? 'Hide' : 'Show'} individual ballots
              </button>
            </div>

            {/* The switch from phase one to phase two. */}
            <div className="wb-share" style={{ marginTop: '1.4rem' }}>
              {!locked ? (
                <>
                  <div className="wb-share-label">Close the ballot, open the vote</div>
                  <div className="wb-basis-note" style={{ margin: '0 0 .6rem' }}>
                    Freezes the {BASIS_LABEL[basis].toLowerCase()} board above into twelve
                    lines. A ballot filed afterwards no longer moves a number.
                  </div>
                  <div className="wb-share-actions">
                    <button className="wb-btn" type="button" disabled={busy || pending} onClick={lock}>
                      Set the lines
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="wb-share-label">
                    Locked {new Date(locked.lockedAt).toLocaleDateString()} · {BASIS_LABEL[locked.basis].toLowerCase()} · {locked.ballotCount} ballots
                  </div>
                  <div className="wb-basis-note" style={{ margin: '0 0 .6rem' }}>
                    {locked.revealed
                      ? 'The room is open. Anybody with the link reads the results.'
                      : 'Voting is live and every pick is sealed. Nobody sees a thing until you open it.'}
                  </div>
                  <div className="wb-share-actions">
                    <button className="wb-btn" type="button" disabled={busy || pending}
                            onClick={() => reveal(!locked.revealed)}>
                      {locked.revealed ? 'Seal it back up' : 'Open the room'}
                    </button>
                    <button className="wb-btn wb-btn-quiet" type="button" disabled={busy || pending} onClick={unlock}>
                      Tear the board down
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {showBallots && ballots.length > 0 && (
          <>
            <div className="wb-section">Every ballot</div>
            {ballots.map((b) => (
              <div key={b.name} className="wb-ballot">
                <div className="wb-ballot-head">
                  <span className="wb-ballot-name">{b.name}</span>
                  <span className="wb-ballot-meta">
                    totals {b.total} of 84
                    {' · '}
                    <button
                      type="button"
                      onClick={() => reopen(b.name)}
                      disabled={busy || pending}
                      className="wb-linkish"
                    >
                      reopen
                    </button>
                  </span>
                </div>
                <div className="wb-ballot-grid">
                  {roster.map((m) => (
                    <span key={m.name} className="wb-cell">{m.name} <b>{b.picks[m.name] ?? '–'}</b></span>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {locked && (
          <>
            <div className="wb-section">The vote</div>
            {votes.length === 0 ? (
              <div className="wb-empty">No cards yet</div>
            ) : (
              <>
                <div className="wb-board">
                  {lineTallies.map((t) => (
                    <div key={t.name} className="wb-board-row">
                      <div className="wb-board-main">
                        <div className="wb-board-name">{t.name}</div>
                        <div className="wb-board-sub">
                          <span className="wb-conf-mark" data-conf={t.conference}>{t.conference}</span>
                          {' · '}line {t.line.toFixed(1)}
                          {' · '}
                          {t.count === 0 ? 'nobody yet'
                            : t.lean === 'split' ? <b>dead even</b>
                            : t.edge === 1 ? <>all {t.count} on the <b>{t.lean}</b></>
                            : <>leans <b>{t.lean}</b></>}
                        </div>
                      </div>
                      <div>
                        <div className="wb-board-line">{t.over}–{t.under}</div>
                        <div className="wb-board-raw">over–under · {t.count} in</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="wb-section">Props</div>
                {PROPS.map((p) => {
                  const counts = tallyChoices(votes, (c) => c.props[p.key])
                  return (
                    <div key={p.key} className="wb-prop-result">
                      <div className="wb-prop-ask">{p.ask}</div>
                      <div className="wb-prop-note">{p.note}</div>
                      {counts.length === 0 ? (
                        <div className="wb-board-sub">nobody yet</div>
                      ) : (
                        <div className="wb-tallies">
                          {counts.map((c, i) => (
                            <div key={c.answer} className="wb-tally-row" data-top={i === 0 && c.count > (counts[1]?.count ?? 0)}>
                              <span className="wb-tally-name">{c.answer}</span>
                              <span className="wb-tally-bar" aria-hidden="true">
                                <span style={{ width: `${(c.count / Math.max(1, votes.length)) * 100}%` }} />
                              </span>
                              <span className="wb-tally-no">{c.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}

                <div className="wb-section">Rivalry week</div>
                <div className="wb-tallies">
                  {RIVALRIES.map((pair) => {
                    const counts = tallyChoices(votes, (c) => c.rivalry[rivalryKey(pair)])
                    const a = counts.find((c) => c.answer === pair[0])?.count ?? 0
                    const b = counts.find((c) => c.answer === pair[1])?.count ?? 0
                    return (
                      <div key={rivalryKey(pair)} className="wb-tally-row">
                        <span className="wb-tally-name" style={{ width: 'auto', flex: 1 }}>
                          {pair[0]} v {pair[1]}
                        </span>
                        <span className="wb-tally-no" style={{ width: 'auto' }}>
                          {a}–{b}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <div className="wb-share-actions" style={{ marginTop: '1rem' }}>
                  <button className="wb-btn wb-btn-quiet" type="button" onClick={() => setShowCards((v) => !v)}>
                    {showCards ? 'Hide' : 'Show'} individual cards
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {showCards && votes.length > 0 && (
          <>
            <div className="wb-section">Every card</div>
            {votes.map((v) => (
              <div key={v.name} className="wb-ballot">
                <div className="wb-ballot-head">
                  <span className="wb-ballot-name">{v.name}</span>
                  <span className="wb-ballot-meta">
                    {Object.values(v.card.lines).filter((s) => s === 'over').length} over
                    {' · '}
                    <button
                      type="button"
                      onClick={() => reopenCard(v.name)}
                      disabled={busy || pending}
                      className="wb-linkish"
                    >
                      reopen
                    </button>
                  </span>
                </div>
                <div className="wb-ballot-grid">
                  {roster.filter((m) => m.name !== v.name).map((m) => (
                    <span key={m.name} className="wb-cell">
                      {m.name} <b data-side={v.card.lines[m.name]}>{v.card.lines[m.name] === 'over' ? 'O' : v.card.lines[m.name] === 'under' ? 'U' : '–'}</b>
                    </span>
                  ))}
                </div>
                <div className="wb-card-props">
                  {PROPS.map((p) => (
                    <span key={p.key}>{p.ask}: <b>{v.card.props[p.key] ?? '–'}</b></span>
                  ))}
                  <span>
                    Rivalry: <b>{RIVALRIES.map((pair) => v.card.rivalry[rivalryKey(pair)] ?? '?').join(', ')}</b>
                  </span>
                </div>
              </div>
            ))}
          </>
        )}

        <div className="wb-foot" style={{ marginTop: '2rem' }}>
          Line = mean of the ballots, nearest half, never a whole number · {GAMES}-game season
        </div>
      </div>
    </div>
  )
}
