'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AddSourcePanel } from './add-source-panel'
import { SourceRow } from './source-row'
import { syncSource } from './actions'
import { STAGE_KEYS, type StageKey } from '@/lib/ingest/stages'
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

const STAGE_LABELS: Record<StageKey, string> = {
  matchups: 'Matchups & standings',
  drafts: 'Drafts',
  lineups: 'Weekly lineups',
  trades: 'Trades',
}

// League-level custom sync: run the same stage selection across EVERY source
// in one pass. A league split across four sources (say, one per playoff
// format) previously meant opening four cards and ticking "trades" four
// times to refresh one stage of history.
//
// Each source still gets its OWN server action call, sequentially — that's
// the whole point. One request per source keeps every source inside its own
// function budget, exactly like the per-card button, so a long ledger can't
// blow the cap the way a single all-sources request would.
function SyncAllPanel({
  leagueId,
  sources,
}: {
  leagueId: string
  sources: SourceLite[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [stages, setStages] = useState<Record<StageKey, boolean>>({
    matchups: true,
    drafts: true,
    lineups: true,
    trades: true,
  })
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null)
  const [log, setLog] = useState<Array<{ label: string; ok: boolean; note: string }>>([])

  const toggle = (k: StageKey) => setStages((s) => ({ ...s, [k]: !s[k] }))
  const selected = STAGE_KEYS.filter((k) => stages[k])

  function sourceLabel(s: SourceLite) {
    return s.label?.trim() || `${s.platform.toUpperCase()} ${s.external_id}`
  }

  async function run() {
    if (selected.length === 0) return
    setRunning(true)
    setLog([])
    const results: Array<{ label: string; ok: boolean; note: string }> = []

    for (let i = 0; i < sources.length; i++) {
      const s = sources[i]
      const label = sourceLabel(s)
      setProgress({ done: i, total: sources.length, label })
      const result = await syncSource(s.id, leagueId, selected)
      if (!result.ok) {
        results.push({ label, ok: false, note: result.error })
      } else {
        const warns = (result as { warnings?: string[] }).warnings ?? []
        results.push({
          label,
          ok: true,
          note: warns.length ? `${warns.length} warning${warns.length === 1 ? '' : 's'}` : 'done',
        })
      }
      // Show the ledger filling in as it goes rather than one dump at the end;
      // a five-source NFL walk can run for minutes.
      setLog([...results])
    }

    setProgress(null)
    setRunning(false)
    router.refresh()
  }

  if (sources.length < 2) return null

  const failed = log.filter((r) => !r.ok).length

  return (
    <div style={{ margin: '0 0 1.2rem' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={running}
        className="lo-btn-ghost"
      >
        {open ? 'Close sync all' : `Sync all ${sources.length} sources`}
      </button>

      {open && (
        <div className="lo-src-panel" style={{ marginTop: '.75rem' }}>
          <div className="lo-src-panel-title">Sync all sources · pick the parts</div>
          <div className="dc-form" style={{ gap: '.75rem' }}>
            <div className="dc-field">
              <span className="dc-checkbox-hint" style={{ marginBottom: '.5rem' }}>
                Runs the same selection across every source on the ledger, one
                at a time. Stay on this page until it finishes.
              </span>
              {STAGE_KEYS.map((k) => (
                <label key={k} className="dc-checkbox-row">
                  <input type="checkbox" checked={stages[k]} onChange={() => toggle(k)} disabled={running} />
                  <span><strong>{STAGE_LABELS[k]}</strong></span>
                </label>
              ))}
            </div>
            <button onClick={run} disabled={running || selected.length === 0} className="lo-btn block sm">
              {running
                ? progress
                  ? `Syncing ${progress.done + 1}/${progress.total} · ${progress.label}`
                  : 'Syncing…'
                : selected.length === 0
                ? 'Pick at least one part'
                : `Sync ${selected.length === STAGE_KEYS.length ? 'everything' : selected.join(', ')} on all sources`}
            </button>

            {log.length > 0 && (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: '.72rem', lineHeight: 1.7 }}>
                {log.map((r, i) => (
                  <li key={i} style={{ color: r.ok ? 'var(--cream-mute)' : 'var(--rust)' }}>
                    {r.ok ? '✦' : '×'} {r.label} · {r.note}
                  </li>
                ))}
                {!running && (
                  <li style={{ marginTop: '.4rem', fontWeight: 600 }}>
                    {failed === 0
                      ? `All ${log.length} sources synced.`
                      : `${log.length - failed} of ${log.length} synced · ${failed} failed.`}
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
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
      <SyncAllPanel leagueId={leagueId} sources={sources} />

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
