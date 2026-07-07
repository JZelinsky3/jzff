'use client'

// ESPN news rail. League-relevant articles (a rostered player is named) are
// server-sorted first and carry a chip tying the story back to the manager
// it hurts or helps. Compact mode headlines only; the full News view carries
// descriptions and art.

import { useSl } from '../SlProvider'
import { fmtSince, shortName } from '../../_lib/format'

const COMPACT_COUNT = 4

export function NewsRail({ compact = false }: { compact?: boolean }) {
  const { frame, setView } = useSl()
  const items = compact ? frame.news.slice(0, COMPACT_COUNT) : frame.news

  return (
    <aside className="sl-panel flex h-full min-h-0 flex-col overflow-hidden" aria-label="NFL news">
      {compact ? (
        <button
          type="button"
          onClick={() => setView('news')}
          className="sl-slate w-full justify-between text-left transition-colors hover:bg-sl-panel-2"
          title="Open the news desk"
        >
          <span className="sl-kicker">NEWS DESK</span>
          <span className="sl-kicker text-sl-electric!">▸</span>
        </button>
      ) : (
        <div className="sl-slate">
          <span className="sl-kicker">NEWS DESK</span>
        </div>
      )}
      <div className="sl-scroll min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-sl-dim">The wire is quiet.</p>
        ) : (
          items.map((n) => {
            const inner = (
              <>
                <div className="mb-1 flex items-center gap-2">
                  {n.leagueTag && (
                    <span className="sl-chip border-sl-gold/40 px-1.5! py-0! text-[9px]! text-sl-gold!">
                      {shortName(n.leagueTag.playerName)} · {n.leagueTag.ownerName}
                    </span>
                  )}
                  <span className="sl-num text-[9px] uppercase tracking-wider text-sl-dim">{fmtSince(n.published)} ago</span>
                </div>
                <p className="sl-display text-[13.5px] leading-snug text-sl-text">{n.headline}</p>
                {!compact && n.description && (
                  <p className="mt-1 text-[12px] leading-snug text-sl-mute">{n.description}</p>
                )}
              </>
            )
            return n.link ? (
              <a
                key={n.id}
                href={n.link}
                target="_blank"
                rel="noreferrer"
                className="block border-b border-sl-line/50 px-3 py-2 transition-colors last:border-b-0 hover:bg-sl-panel-2"
              >
                {inner}
              </a>
            ) : (
              <div key={n.id} className="border-b border-sl-line/50 px-3 py-2 last:border-b-0">
                {inner}
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
