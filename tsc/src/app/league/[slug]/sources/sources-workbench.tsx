'use client'

import { useState } from 'react'
import { AddSourcePanel } from './add-source-panel'
import { SourceRow } from './source-row'
import type { SourcePrefill } from './add-source-form'

type SourceLite = {
  id: string
  platform: string
  external_id: string
  label: string | null
  walk_history: boolean
  settings: Record<string, unknown> | null
  last_synced_at: string | null
  created_at: string
  hasCookies: boolean
}

// Round-robin distribution preserves row-major reading order: items[0,1,2]
// land at the top of col 0, 1, 2 respectively; items[3,4,5] form the next
// row. Each returned column is rendered as an independent flex stack so
// expanding a card only shifts items below it WITHIN the same column.
function splitColumns<T>(items: T[], cols: number): T[][] {
  const out: T[][] = Array.from({ length: cols }, () => [])
  items.forEach((item, i) => { out[i % cols].push(item) })
  return out
}

// Client wrapper that ties the source ledger to the add-source panel: a
// card's "Extend" button hands its platform + ID here, which pushes it
// down as a prefill so the panel opens ready to attach the next stretch
// of years without re-typing anything.
export function SourcesWorkbench({
  leagueId,
  slug,
  sources,
  syncedRange,
  yahooConnected,
}: {
  leagueId: string
  slug: string
  sources: SourceLite[]
  syncedRange: string | null
  yahooConnected: boolean
}) {
  const [prefill, setPrefill] = useState<SourcePrefill | null>(null)
  // Bump on every Extend click so the panel effect re-fires even when the
  // same source is extended twice in a row (same prefill object shape).
  const [prefillKey, setPrefillKey] = useState(0)

  function handleExtend(p: SourcePrefill) {
    setPrefill(p)
    setPrefillKey((k) => k + 1)
  }

  return (
    <>
      <div id="sources-ledger">
        {sources.length === 0 ? (
          <div className="lo-empty">
            <div className="lo-empty-title">No sources yet.</div>
            <div className="lo-empty-text">Attach a league ID below to start pulling history.</div>
          </div>
        ) : (
          // Pre-distribute sources into independent columns so expanding one
          // card only pushes items in the SAME column — a plain CSS grid
          // would let a card's growth push cards in other columns down too.
          // Three trees are rendered (3/2/1 col) and CSS shows only one per
          // viewport width; distribution is round-robin so row-major reading
          // order still matches insertion order.
          <>
            <div className="dc-source-ledger dc-source-ledger-3">
              {splitColumns(sources, 3).map((col, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
                  {col.map((s) => (
                    <SourceRow key={s.id} source={s} leagueId={leagueId} slug={slug} hasCookies={s.hasCookies} syncedRange={syncedRange} onExtend={handleExtend} />
                  ))}
                </div>
              ))}
            </div>
            <div className="dc-source-ledger dc-source-ledger-2">
              {splitColumns(sources, 2).map((col, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
                  {col.map((s) => (
                    <SourceRow key={s.id} source={s} leagueId={leagueId} slug={slug} hasCookies={s.hasCookies} syncedRange={syncedRange} onExtend={handleExtend} />
                  ))}
                </div>
              ))}
            </div>
            <div className="dc-source-ledger dc-source-ledger-1">
              {sources.map((s) => (
                <SourceRow key={s.id} source={s} leagueId={leagueId} slug={slug} hasCookies={s.hasCookies} syncedRange={syncedRange} onExtend={handleExtend} />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="lo-band" style={{ maxWidth: 'none', padding: 0, margin: '2.4rem 0 0' }}>
        <div className="lo-folio">
          <span className="lo-folio-no">02</span>
          <span className="lo-folio-title">Add another</span>
          <span className="lo-folio-meta">Walk history, or a single season</span>
        </div>
        <AddSourcePanel
          key={prefillKey}
          leagueId={leagueId}
          slug={slug}
          yahooConnected={yahooConnected}
          prefill={prefill}
          onOpenChange={(open) => { if (!open) setPrefill(null) }}
        />
      </div>
    </>
  )
}
