'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ensureBallotToken, clearBallot, importBallotLines } from '@/app/ballot/actions'
import { GAMES, SPLIT_GAP, type BallotManager, type BoardLine, type Picks } from '@/lib/winBallot'

type Ballot = { name: string; picks: Picks; total: number; at: string }

export function RoomView({
  leagueId, origin, roster, ballots, board, token,
}: {
  leagueId: string
  origin: string
  roster: BallotManager[]
  ballots: Ballot[]
  board: BoardLine[]
  token: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [showBallots, setShowBallots] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [paste, setPaste] = useState('')

  const inNames = new Set(ballots.map((b) => b.name))
  // The public ballot lives at /ballot/<token>, outside /league/, because
  // the league layout bounces signed-out visitors to /login and the whole
  // point of this link is that it needs no account. The origin is resolved
  // server-side so the full link is right in the HTML, ready to copy.
  const link = token ? `${origin}/ballot/${token}` : null
  const complete = ballots.length === roster.length

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
    const width = Math.max(...board.map((l) => l.name.length))
    copy([
      'PA MILK SOCIETY 2026 WIN TOTALS',
      `The board, set by ${ballots.length} ballot${ballots.length === 1 ? '' : 's'}`,
      '',
      ...board.map((l) => `${l.name.padEnd(width + 2)}${l.line.toFixed(1)}`),
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

  return (
    <div className="wb">
      <div className="wb-shell">
        <div className="wb-room-head">
          <div className="wb-eyebrow">Ballot room · 2026 win totals</div>
          <h1 className="wb-room-title">
            {complete ? 'All twelve are in.' : 'Waiting on the room.'}
          </h1>
        </div>

        <div style={{ marginTop: '1.4rem' }}>
          <div className="wb-turnout-no">{ballots.length}<small>/{roster.length}</small></div>
          <div className="wb-turnout-label">ballots filed</div>
          <div className="wb-chips">
            {roster.map((m) => (
              <span key={m.name} className="wb-chip" data-in={inNames.has(m.name)}>{m.name}</span>
            ))}
          </div>
        </div>

        <div className="wb-share">
          <div className="wb-share-label">The link to send the group</div>
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

        <div className="wb-section">The board</div>
        {ballots.length === 0 ? (
          <div className="wb-empty">No ballots yet</div>
        ) : (
          <>
            <div className="wb-board">
              {board.map((l) => (
                <div key={l.name} className="wb-board-row" data-split={l.gap >= SPLIT_GAP}>
                  <div className="wb-board-main">
                    <div className="wb-board-name">{l.name}</div>
                    <div className="wb-board-sub">
                      <span className="wb-conf-mark" data-conf={l.conference}>{l.conference}</span>
                      {' · '}ballots ran {l.low} to {l.high}
                      {' · '}model {l.model.toFixed(1)}
                      {l.gap >= SPLIT_GAP && <> · <b>split room</b></>}
                    </div>
                  </div>
                  <div>
                    <div className="wb-board-line">{l.line.toFixed(1)}</div>
                    <div className="wb-board-raw">mean {l.mean.toFixed(2)} · {l.count} in</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="wb-share-actions" style={{ marginTop: '1rem' }}>
              <button className="wb-btn wb-btn-quiet" type="button" onClick={copyBoard}>Copy the board</button>
              <button className="wb-btn wb-btn-quiet" type="button" onClick={() => setShowBallots((v) => !v)}>
                {showBallots ? 'Hide' : 'Show'} individual ballots
              </button>
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
                      style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--stamp)', textDecoration: 'underline', cursor: 'pointer' }}
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

        <div className="wb-foot" style={{ marginTop: '2rem' }}>
          Line = mean of every ballot, nearest half, never a whole number · {GAMES}-game season
        </div>
      </div>
    </div>
  )
}
