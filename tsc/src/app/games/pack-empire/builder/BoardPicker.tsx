'use client'

// The eight boards as one picker: Classic or Mystery, then one of four
// difficulties, and the board picked gets the card with its Play button. The
// list of every board as rows read as a wall on a phone, so every choice is a
// tap on the page and only the one you're on is spelled out. The top runs
// below follow the same pick, so there's one control on the page, not two.

import Link from 'next/link'
import { useState } from 'react'
import type { HubBoard } from '@/lib/packEmpire/builderHub'
import {
  BUILDER_FORMATS,
  BUILDER_HUB_WORD,
  DIFFICULTIES,
  DIFFICULTY_LOOK,
  FORMAT_LOOK,
  boardLabel,
  builderQuery,
  playHref,
  type BuilderFormat,
  type Difficulty,
  type Player,
} from '@/lib/packEmpire/rules'
import { RunRow } from '../BoardRows'
import { TableArt } from '../TableArt'

const board = (b: { diff: Difficulty; format: BuilderFormat }) => `/games/pack-empire/board/${builderQuery(b.diff, b.format)}`

/** What each way of opening the packs is, under its tab. The phone gets the short one. */
const FORMAT_BRIEF: Record<BuilderFormat, string> = {
  classic: 'A pack for every position, opened in any order you like.',
  mystery: 'Eleven packs of random positions. Plan ahead.',
}

export function BoardPicker({
  boards,
  leaders,
  hands,
  mobile,
  start,
  signedIn,
  viewerId,
}: {
  boards: HubBoard[]
  /** Each of the span's runs' best card, by run id. */
  leaders: Record<string, Player>
  /** Three cards for each table, as its difficulty deals them, keyed format:diff. */
  hands: Record<string, Player[]>
  mobile: boolean
  start: { diff: Difficulty; format: BuilderFormat }
  signedIn: boolean
  viewerId: string | null
}) {
  const [diff, setDiff] = useState(start.diff)
  const [format, setFormat] = useState(start.format)
  const find = (d: Difficulty, f: BuilderFormat) => boards.find((b) => b.diff === d && b.format === f)
  const pick = find(diff, format)

  // The address follows the pick, so a refresh or a shared link lands on it.
  const choose = (d: Difficulty, f: BuilderFormat) => {
    setDiff(d)
    setFormat(f)
    try {
      window.history.replaceState(null, '', `/games/pack-empire/builder/${builderQuery(d, f)}`)
    } catch {}
  }

  const top = pick?.today[0]
  const label = boardLabel(diff, format)

  return (
    <>
      <section className="pe-sec">
        <div className="pe-sec-head">
          <span className="pe-sec-num">§ 01 · Tables</span>
          <span className="pe-sec-title">Pick a table</span>
        </div>

        <div className="pe-bp" data-f={format}>
          <div className="pe-bp-side">
            <div className="pe-bp-fmt" role="tablist" aria-label="Format">
              {BUILDER_FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  data-f={f}
                  aria-selected={f === format}
                  className="pe-bp-fmt-btn"
                  onClick={() => choose(diff, f)}
                >
                  {FORMAT_LOOK[f].label}
                </button>
              ))}
            </div>
            <p className="pe-bp-fmt-line">{mobile ? FORMAT_BRIEF[format] : FORMAT_LOOK[format].line}</p>
            <div className="pe-bp-diffs" role="tablist" aria-label="Difficulty">
              {DIFFICULTIES.map((d) => {
                const b = find(d, format)
                const best = b?.today[0]
                return (
                  <button
                    key={d}
                    type="button"
                    role="tab"
                    aria-selected={d === diff}
                    className="pe-bp-diff"
                    onClick={() => choose(d, format)}
                  >
                    <b>{DIFFICULTY_LOOK[d].label}</b>
                    <small>{best ? `Top ${best.score.toLocaleString()}` : 'Nobody yet'}</small>
                  </button>
                )
              })}
            </div>
          </div>

          <article className="pe-bp-card">
            <div className="pe-bp-info">
              <header className="pe-bp-card-head">
                <span className="pe-bp-card-kick">{FORMAT_LOOK[format].label}</span>
                <h2>{DIFFICULTY_LOOK[diff].label}</h2>
                <p>{DIFFICULTY_LOOK[diff].line}</p>
              </header>
              <div className="pe-bp-stats">
                <span className="pe-bh-stat">
                  <small>Top {BUILDER_HUB_WORD}</small>
                  {top ? <b>{top.score.toLocaleString()}</b> : <em>Nobody yet</em>}
                </span>
                <span className="pe-bh-stat">
                  <small>Runs {BUILDER_HUB_WORD}</small>
                  <b>{(pick?.runsToday ?? 0).toLocaleString()}</b>
                </span>
                {signedIn && (
                  <span className="pe-bh-stat">
                    <small>Your Best</small>
                    {pick?.yourBest != null ? <b>{pick.yourBest.toLocaleString()}</b> : <em>None yet</em>}
                  </span>
                )}
              </div>
              <div className="pe-bp-go">
                <Link href={playHref(diff, format)} className="pe-push">
                  Play
                </Link>
                <Link href={board({ diff, format })} className="pe-link">
                  Board
                </Link>
              </div>
            </div>
            <TableArt key={`${format}:${diff}`} cards={hands[`${format}:${diff}`] ?? []} />
          </article>
        </div>
      </section>

      {pick && (
        <section className="pe-sec" id="today">
          <div className="pe-sec-head">
            <span className="pe-sec-num">§ 02 · {BUILDER_HUB_WORD}</span>
            <span className="pe-sec-title">Top Runs {BUILDER_HUB_WORD}</span>
            <span className="pe-sec-meta">Resets midnight</span>
          </div>
          {pick.today.length === 0 ? (
            <p className="pe-empty pe-bh-none">
              Nobody has posted a {label} run {BUILDER_HUB_WORD.toLowerCase()}. The first one takes the top spot.
            </p>
          ) : (
            <div className="pe-top pe-bh-list">
              {pick.today.map((r) => (
                <RunRow key={r.runId} row={r} led={leaders[r.runId]} face mine={viewerId != null && r.userId === viewerId} />
              ))}
            </div>
          )}
          <p className="pe-bh-foot">
            One run a person, their best.{' '}
            <Link href={board(pick)} className="pe-link">
              Full {label} board
            </Link>
          </p>
        </section>
      )}
    </>
  )
}
