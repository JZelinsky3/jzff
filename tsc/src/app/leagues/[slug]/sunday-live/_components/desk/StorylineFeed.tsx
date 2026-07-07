'use client'

// The producer feed: storylines the engine is currently telling, highest
// severity first (server pre-sorts). Cards animate in once per id: the wrapper
// is keyed on the id, and ids are stable across polls while a line holds.
//
// Compact mode (the desk) shows the top of the sheet; the slate is a button
// into the full Storylines view, where the whole run of lines lives.

import { useSl } from '../SlProvider'
import { StorylineCard } from './StorylineCard'

const COMPACT_COUNT = 8

export function StorylineFeed({ compact = false }: { compact?: boolean }) {
  const { frame, newStorylineIds, setView } = useSl()
  const stories = compact ? frame.storylines.slice(0, COMPACT_COUNT) : frame.storylines
  const more = compact ? frame.storylines.length - stories.length : 0

  return (
    <section className="sl-panel flex h-full min-h-0 flex-col overflow-hidden" aria-label="Storylines">
      {compact ? (
        <button
          type="button"
          onClick={() => setView('storylines')}
          className="sl-slate w-full justify-between text-left transition-colors hover:bg-sl-panel-2"
          title="Open the full storyline sheet"
        >
          <span className="sl-kicker">STORYLINE FEED</span>
          <span className="sl-kicker text-sl-electric!">{more > 0 ? `${more} MORE ▸` : '▸'}</span>
        </button>
      ) : (
        <div className="sl-slate justify-between">
          <span className="sl-kicker">STORYLINE FEED</span>
          <span className="sl-kicker text-sl-dim">{frame.storylines.length} RUNNING</span>
        </div>
      )}
      <div className="sl-scroll min-h-0 flex-1 overflow-y-auto">
        {stories.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-sl-dim">
            The producers are watching. Lines land here as the day develops.
          </p>
        ) : (
          stories.map((s) => (
            <div key={s.id} className={newStorylineIds.has(s.id) ? 'sl-story-enter' : undefined}>
              <StorylineCard s={s} />
            </div>
          ))
        )}
      </div>
    </section>
  )
}
