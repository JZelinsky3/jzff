'use client'

import { useState } from 'react'
import { BoardCard, ManagerCard } from '@/app/ballot/recap-card'
import {
  buildRecap, buildRecaps,
  type BallotManager, type BallotRecord, type LockedBoard, type VoteRecord,
} from '@/lib/winBallot'

/**
 * The recap cards, in the room, one at a time.
 *
 * The same cards the public recap page stacks, picked through here so a
 * single manager can be screenshotted and sent on its own. One manager in
 * full runs about two and a half screens tall, so twelve stacked is a page,
 * not a picture: "all twelve" is the board instead, one row each.
 */
export function RecapCard({
  roster, ballots, board, votes, link,
}: {
  roster: BallotManager[]
  ballots: BallotRecord[]
  board: LockedBoard
  votes: VoteRecord[]
  /** The public recap page, if a link has been minted. */
  link: string | null
}) {
  const [mode, setMode] = useState<'one' | 'all'>('one')
  const [who, setWho] = useState(roster[0]?.name ?? '')
  const recap = buildRecap(roster, ballots, board, votes, who)
  if (!recap) return null

  return (
    <section>
      <div className="wb-section">
        Recap cards<span className="mr-hint">screenshot one, or send the page</span>
      </div>

      {link && (
        <div className="wb-share">
          <div className="wb-share-label">
            The whole recap, as a page
            {board.revealed ? '' : ' · opens once the room is open'}
          </div>
          <div className="wb-share-url">{link}</div>
          <div className="wb-share-actions">
            <button
              className="wb-btn wb-btn-quiet"
              type="button"
              onClick={() => navigator.clipboard?.writeText(link)}
            >
              Copy recap link
            </button>
            <a className="wb-btn wb-btn-quiet" href={link} target="_blank" rel="noreferrer">
              Open it
            </a>
          </div>
        </div>
      )}

      <div className="mr-modes">
        <button
          type="button"
          className={`mr-mode${mode === 'one' ? ' is-on' : ''}`}
          onClick={() => setMode('one')}
        >
          One manager
        </button>
        <button
          type="button"
          className={`mr-mode${mode === 'all' ? ' is-on' : ''}`}
          onClick={() => setMode('all')}
        >
          All twelve
        </button>
      </div>

      {mode === 'all' ? (
        <BoardCard recaps={buildRecaps(roster, ballots, board, votes)} ballotCount={board.ballotCount} />
      ) : (
        <>
          <div className="mr-picker">
            {roster.map((r) => (
              <button
                key={r.name}
                type="button"
                className={`mr-pick${r.name === who ? ' is-on' : ''}`}
                onClick={() => setWho(r.name)}
              >
                {r.name}
              </button>
            ))}
          </div>
          <ManagerCard recap={recap} />
        </>
      )}
    </section>
  )
}
