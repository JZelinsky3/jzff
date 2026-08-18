'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ensureExamToken } from '@/app/exam/actions'
import {
  QUESTIONS, ROSTER, VEINS, roomSplit, standings, veinLabel, type RunRecord,
} from '@/lib/milkExam'

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

  // The public game lives at /exam/<token>, outside /league/, because the
  // league layout bounces signed-out visitors to /login and the whole point of
  // this link is that it needs no account.
  const link = token ? `${origin}/exam/${token}` : null
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
    const res = await ensureExamToken(leagueId, rotate)
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
    <div className="mx mxr">
      <div className="mx-shell">
        <div className="mx-top">
          <span className="mx-lg">Exam room</span>
          <span className="mx-rt">{runs.length} of {ROSTER.length} in</span>
        </div>

        {/* ---- the link ---- */}
        <div className="mx-stack" style={{ gap: 12 }}>
          <span className="mx-k">The link you hand out</span>
          {link ? (
            <>
              <div className="mxr-link">{link}</div>
              <div className="mx-foot">
                <button type="button" className="mx-go" onClick={copy}>Copy link</button>
                {confirmRotate ? (
                  <>
                    <button type="button" className="mx-ghost" disabled={busy} onClick={() => mint(true)}>
                      Yes, kill the old one
                    </button>
                    <button type="button" className="mx-ghost" onClick={() => setConfirmRotate(false)}>
                      Keep it
                    </button>
                  </>
                ) : (
                  // "Mint a new link" reads like "show me the link" when the
                  // link is what you came for, and pressing it rotates the
                  // token and kills the URL already sitting in the group chat.
                  // The label now says what it does to the old one.
                  <button type="button" className="mxr-danger" onClick={() => setConfirmRotate(true)}>
                    Replace this link
                  </button>
                )}
              </div>
              <p className="mxr-note">
                Anybody holding this link can play once, under a name nobody has
                used yet. Replacing it breaks the link you have already sent and
                cannot be undone; runs already filed are untouched.
              </p>
            </>
          ) : (
            <>
              <p className="mxr-note">No link yet. Mint one and paste it in the group chat.</p>
              <button type="button" className="mx-go" disabled={busy} onClick={() => mint(false)}>
                {busy ? 'Minting' : 'Mint the link'}
              </button>
            </>
          )}
          {msg && <span className="mx-said">{pending ? 'Refreshing' : msg}</span>}
        </div>

        {/* ---- the board ---- */}
        <div className="mx-stack" style={{ gap: 10 }}>
          <span className="mx-k is-dim">The board</span>
          <div className="mx-board">
            {board.length === 0 ? (
              <div className="mx-waiting">Nobody has played yet</div>
            ) : (
              board.map((r) => (
                <div key={r.name} className="mx-brow">
                  <span className="mx-pos">{r.pos}</span>
                  <span className="mx-nm">{r.name}</span>
                  <span className="mx-sc">{r.score}</span>
                </div>
              ))
            )}
          </div>
          {waiting.length > 0 && (
            <p className="mxr-note">Still to play: {waiting.join(', ')}.</p>
          )}
        </div>

        {/* ---- how each vein played ---- */}
        {runs.length > 0 && (
          <div className="mx-stack" style={{ gap: 10 }}>
            <span className="mx-k is-dim">By vein</span>
            <div className="mx-splits">
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
                    <span className="mx-v">
                      {of ? Math.round((got / of) * 100) : 0}<span>%</span>
                    </span>
                    <span className="mx-l">{veinLabel(v)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ---- what the room is getting wrong ---- */}
        {byHardest.length > 0 && (
          <div className="mx-stack" style={{ gap: 10 }}>
            <span className="mx-k is-dim">Hardest first</span>
            <div className="mx-review">
              {byHardest.map(({ i, q, split }) => (
                <div key={i} className="mx-row">
                  <span className="mxr-pct">{split!.got}/{split!.of}</span>
                  <span className="mx-bd">
                    <span className="mx-q">{q.q}</span>
                    <span className="mx-a">{q.answer}</span>
                    <span className="mx-room">
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
