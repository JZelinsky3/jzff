import { LiveSeasonForm, type SeasonRow } from '@/app/league/[slug]/live/live-form'
import { SourcePicker, type SourceRow } from '@/app/league/[slug]/live/source-picker'
import { GotwPicker, type GotwWeek } from '@/app/league/[slug]/live/gotw-picker'

export function MobileLiveSeason({
  leagueId,
  seasons,
  weekOverride,
  seasonStartDate,
  resolvedWeek,
  liveSeason,
  currentWeek,
  sourceRows,
  liveSeasonId,
  gotwWeeks,
  gotwMap,
  gotwManagers,
}: {
  leagueId: string
  seasons: SeasonRow[]
  weekOverride: number | null
  seasonStartDate: string | null
  resolvedWeek: number | null
  liveSeason: SeasonRow | null
  currentWeek: number | null
  sourceRows: SourceRow[]
  liveSeasonId: string | null
  gotwWeeks: GotwWeek[]
  gotwMap: Record<string, string>
  gotwManagers: string[]
}) {
  return (
    <div className="mliv">
      <div className="mliv-head">
        <span className="mliv-title">Current Season</span>
        {liveSeason && (
          <span className="mliv-live-pill">
            {liveSeason.year}{currentWeek != null ? ` W${currentWeek}` : ''}
          </span>
        )}
      </div>

      <div className="mliv-hint">
        {liveSeason
          ? `${liveSeason.year} is live${currentWeek != null ? `, Week ${currentWeek}` : ''}. Pick'ems, power rankings, and the weekly cron use this.`
          : 'No live season. Mark one to enable weekly features.'}
      </div>

      <div className="mliv-section">
        <div className="mliv-section-label">Which year is on?</div>
        <LiveSeasonForm
          leagueId={leagueId}
          seasons={seasons}
          weekOverride={weekOverride}
          seasonStartDate={seasonStartDate}
          resolvedWeek={resolvedWeek}
        />
      </div>

      <div className="mliv-section">
        <div className="mliv-section-label">Live source</div>
        <div className="mliv-section-desc">The weekly cron re-syncs only the live source.</div>
        <SourcePicker leagueId={leagueId} sources={sourceRows} />
      </div>

      <div className="mliv-section">
        <div className="mliv-section-label">Game of the Week</div>
        <div className="mliv-section-desc">Star one matchup per week for the almanac.</div>
        {liveSeasonId && gotwWeeks.length > 0 ? (
          <GotwPicker
            leagueId={leagueId}
            seasonId={liveSeasonId}
            defaultWeek={currentWeek}
            weeks={gotwWeeks}
            currentGotw={gotwMap}
            managers={gotwManagers}
          />
        ) : (
          <div className="mliv-empty">Pick a live season above to choose Games of the Week.</div>
        )}
      </div>
    </div>
  )
}
