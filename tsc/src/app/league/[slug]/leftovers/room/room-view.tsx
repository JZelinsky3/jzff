'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ensureLeftoversToken } from '@/app/leftovers/actions'
import {
  QUESTIONS, ROSTER, VEINS, roomSplit, standings, veinLabel, type RunRecord,
} from '@/lib/leftovers'

export function RoomView({
  leagueId, origin, runs, token,
}: {
  leagueId: string
  origin: string
  runs: RunRecord[]
  token: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [confirmRotate, setConfirmRotate] = useState(false)

  // The public game lives at /leftovers/<token>, outside /league/, because the
  // league layout bounces signed-out visitors to /login and the whole point of
  // this link is that it needs no account.
  const link = token ? `${origin}/leftovers/${token}` : null
  const board = useMemo(() => standings(runs), [runs])
  const waiting = ROSTER.filter((n) => !runs.some((r) => r.name === n))

  // Which questions the room is actually failing. Sorted hardest first,
  // because that is the reading worth having: a question eleven of twelve miss
  // says more than any single score does.
  const byHardest = useMemo(() => {
    return QUESTIONS
      .map((q, i) => ({ i, q, split: roomSplit(runs, i) }))
      .filter((r) => r.split !== null)
      .sort((a, b) => (a.split!.got / a.split!.of) - (b.split!.got / b.split!.of))
  }, [runs])

  async function mint(rotate: boolean) {
    setBusy(true)
    setMsg(null)
    const res = await ensureLeftoversToken(leagueId, rotate)
    setBusy(false)
    setConfirmRotate(false)
    if (!res.ok) { setMsg(res.error); return }
    setMsg(rotate ? 'New link minted. The old one is dead.' : 'Link ready.')
    startTransition(() => router.refresh())
  }

  async function copy() {
    if (!link) return
    try { await navigator.clipboard.writeText(link) } catch { /* blocked; the label still confirms */ }
    setMsg('Link copied.')
  }

  return (
    <div className="lo lor">
      <div className="lo-shell">
        <div className="lo-top">
          <span className="lo-lg">Leftovers room</span>
          <span className="lo-rt">{runs.length} of {ROSTER.length} in</span>
        </div>

        {/* ---- the link ---- */}
        <div className="lo-stack" style={{ gap: 12 }}>
          <span className="lo-k">The link you hand out</span>
          {link ? (
            <>
              <div className="lor-link">{link}</div>
              <div className="lo-foot">
                <button type="button" className="lo-go" onClick={copy}>Copy link</button>
                {confirmRotate ? (
                  <>
                    <button type="button" className="lo-ghost" disabled={busy} onClick={() => mint(true)}>
                      Yes, kill the old one
                    </button>
                    <button type="button" className="lo-ghost" onClick={() => setConfirmRotate(false)}>
                      Keep it
                    </button>
                  </>
                ) : (
                  <button type="button" className="lo-ghost" onClick={() => setConfirmRotate(true)}>
                    Mint a new link
                  </button>
                )}
              </div>
              <p className="lor-note">
                Anybody holding this can play once, under a name nobody has used
                yet. Minting a new one kills this link and every run already
                filed stays exactly where it is.
              </p>
            </>
          ) : (
            <>
              <p className="lor-note">No link yet. Mint one and paste it in the group chat.</p>
              <button type="button" className="lo-go" disabled={busy} onClick={() => mint(false)}>
                {busy ? 'Minting' : 'Mint the link'}
              </button>
            </>
          )}
          {msg && <span className="lo-said">{pending ? 'Refreshing' : msg}</span>}
        </div>

        {/* ---- the board ---- */}
        <div className="lo-stack" style={{ gap: 10 }}>
          <span className="lo-k is-dim">The board</span>
          <div className="lo-board">
            {board.length === 0 ? (
              <div className="lo-waiting">Nobody has played yet</div>
            ) : (
              board.map((r) => (
                <div key={r.name} className="lo-brow">
                  <span className="lo-pos">{r.pos}</span>
                  <span className="lo-nm">{r.name}</span>
                  <span className="lo-sc">{r.score}</span>
                </div>
              ))
            )}
          </div>
          {waiting.length > 0 && (
            <p className="lor-note">Still to play: {waiting.join(', ')}.</p>
          )}
        </div>

        {/* ---- how each vein played ---- */}
        {runs.length > 0 && (
          <div className="lo-stack" style={{ gap: 10 }}>
            <span className="lo-k is-dim">By vein</span>
            <div className="lo-splits">
              {VEINS.map((v) => {
                const idx = QUESTIONS.map((q, n) => (q.vein === v ? n : -1)).filter((n) => n >= 0)
                let got = 0
                let of = 0
                idx.forEach((n) => {
                  const s = roomSplit(runs, n)
                  if (s) { got += s.got; of += s.of }
                })
                return (
                  <div key={v}>
                    <span className="lo-v">
                      {of ? Math.round((got / of) * 100) : 0}<span>%</span>
                    </span>
                    <span className="lo-l">{veinLabel(v)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ---- what the room is getting wrong ---- */}
        {byHardest.length > 0 && (
          <div className="lo-stack" style={{ gap: 10 }}>
            <span className="lo-k is-dim">Hardest first</span>
            <div className="lo-review">
              {byHardest.map(({ i, q, split }) => (
                <div key={i} className="lo-row">
                  <span className="lor-pct">{split!.got}/{split!.of}</span>
                  <span className="lo-bd">
                    <span className="lo-q">{q.q}</span>
                    <span className="lo-a">{q.answer}</span>
                    <span className="lo-room">
                      {split!.got === 0
                        ? 'Nobody has got this'
                        : `${split!.got} of ${split!.of} got it`}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
