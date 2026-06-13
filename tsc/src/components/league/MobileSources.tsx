import { SourceRow } from '@/app/league/[slug]/sources/source-row'
import { AddSourcePanel } from '@/app/league/[slug]/sources/add-source-panel'

type SourceData = {
  id: string
  platform: string
  external_id: string
  label: string | null
  walk_history: boolean
  settings: Record<string, unknown> | null
  last_synced_at: string | null
  hasCookies: boolean
}

export function MobileSources({
  leagueId,
  slug,
  sources,
  syncedRange,
  yahooConnected,
}: {
  leagueId: string
  slug: string
  sources: SourceData[]
  syncedRange: string | null
  yahooConnected: boolean
}) {
  return (
    <div className="msrc">
      <div className="msrc-head">
        <span className="msrc-title">Sources</span>
        <span className="msrc-count">{sources.length}</span>
      </div>

      <div className="msrc-hint">
        One archive can pull from many league IDs. Each source is synced independently.
      </div>

      {sources.length === 0 ? (
        <div className="msrc-empty">No sources yet.</div>
      ) : (
        <div className="msrc-list">
          {sources.map((s) => (
            <SourceRow
              key={s.id}
              source={s}
              leagueId={leagueId}
              slug={slug}
              hasCookies={s.hasCookies}
              syncedRange={syncedRange}
            />
          ))}
        </div>
      )}

      <div className="msrc-add">
        <div className="msrc-add-label">Add another source</div>
        <AddSourcePanel leagueId={leagueId} slug={slug} yahooConnected={yahooConnected} />
      </div>
    </div>
  )
}
