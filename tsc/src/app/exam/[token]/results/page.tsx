import type { Viewport } from 'next'
import {
  INITIALS, QUESTIONS, isMulti, pickCount, roomSplit, standings, tally, veinLabel,
} from '@/lib/milkExam'
import { leagueForToken, readRuns } from '../../actions'
import '../../exam.css'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  themeColor: '#0e0d0c',
  width: 'device-width',
  initialScale: 1,
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const league = await leagueForToken(token)
  const runs = league ? await readRuns(league.id) : []
  const title = 'The Milk Exam · the results'
  const description = league
    ? `How ${runs.length} ${runs.length === 1 ? 'manager' : 'managers'} answered all ${QUESTIONS.length}.`
    : 'This link is not the live one.'
  const image = `/api/og/exam/${encodeURIComponent(token)}`
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      type: 'website', title, description, siteName: 'The Sunday Chronicle',
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image' as const, title, description, images: [image] },
  }
}

/**
 * The share page: every question, every option, who took it.
 *
 * Deliberately a plain server component with no interaction. It exists to be
 * opened once, scrolled, and screenshotted, and it gives away every answer, so
 * it is a link to send when the room is done rather than one to leave lying
 * around. The page says so at the top rather than relying on that being
 * understood.
 */
export default async function ExamResultsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const league = await leagueForToken(token)

  if (!league) {
    return (
      <div className="mx">
        <div className="mx-shell">
          <div className="mx-top">
            <span className="mx-lg">PA Milk Society</span>
            <span className="mx-rt">Wrong door</span>
          </div>
          <div className="mx-stack">
            <span className="mx-k">Not the live link</span>
            <h1>Wrong<br />door</h1>
            <p>This link has been retired or was mistyped.</p>
          </div>
        </div>
      </div>
    )
  }

  const runs = await readRuns(league.id)
  const board = standings(runs)

  return (
    <div className="mx">
      <div className="mx-shell">
        <div className="mx-top">
          <span className="mx-lg">PA Milk Society</span>
          <span className="mx-rt">{runs.length} of 12 sat it</span>
        </div>

        <div className="mx-stack">
          <span className="mx-k">Every answer is on this page</span>
          <h1>The<br />Results</h1>
          <p>
            All {QUESTIONS.length} questions, who took which name, and what the
            room got right.
          </p>
        </div>

        {board.length > 0 && (
          <div className="mx-stack" style={{ gap: 10 }}>
            <span className="mx-k is-dim">The board</span>
            <div className="mx-board">
              {board.map((r) => (
                <div key={r.name} className="mx-brow">
                  <span className="mx-pos">{r.pos}</span>
                  <span className="mx-nm">{r.name}</span>
                  <span className="mx-sc">{r.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {runs.length === 0 ? (
          <div className="mx-waiting">Nobody has sat it yet</div>
        ) : (
          <div className="mx-qs">
            {QUESTIONS.map((q, n) => {
              const rows = tally(q, runs)
              // Full-set correct, so a pick-three counts only when all three
              // are right. Summing the correct options instead would credit
              // two of three as two thirds of a right answer.
              const split = roomSplit(runs, q) ?? { got: 0, of: runs.length }
              return (
                <section key={q.id} className="mx-qblock">
                  <div className="mx-qhd">
                    <span className="mx-qhd-n">{String(n + 1).padStart(2, '0')}</span>
                    <span className="mx-qhd-t">
                      {veinLabel(q.vein)}
                      {isMulti(q) && ` · pick ${pickCount(q)}`}
                    </span>
                  </div>
                  <h2 className="mx-qtext">{q.q}</h2>

                  <div className="mx-bars">
                    {rows.map((r) => (
                      <div
                        key={r.option}
                        className={`mx-bar${r.correct ? ' is-right' : ''}${r.voters.length === 0 ? ' is-empty' : ''}`}
                      >
                        {/* The fill is a sibling behind the text, not a
                            background on it, so a long row of chips cannot
                            stretch the bar past its own percentage. */}
                        <span className="mx-bar-fill" style={{ width: `${r.pct}%` }} />
                        <span className="mx-bar-row">
                          <span className="mx-bar-name">{r.option}</span>
                          <span className="mx-chips">
                            {r.voters.map((v) => (
                              <span key={v} className="mx-chip" title={v}>{INITIALS[v] ?? v.slice(0, 2).toUpperCase()}</span>
                            ))}
                          </span>
                          <span className="mx-bar-pct">{r.pct}%</span>
                        </span>
                      </div>
                    ))}
                  </div>

                  <p className="mx-qfoot">
                    <span dangerouslySetInnerHTML={{ __html: q.why }} />
                  </p>
                  <span className="mx-qscore">
                    {split.got === 0
                      ? `Nobody got this${isMulti(q) ? ' in full' : ''}`
                      : `${split.got} of ${split.of} got it${isMulti(q) ? ' in full' : ''}`}
                  </span>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
