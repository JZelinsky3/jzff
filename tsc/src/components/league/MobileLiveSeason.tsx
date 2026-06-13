import { MobileLiveForm, type SeasonOption } from './MobileLiveForm'
import { MobileSourcePicker, type SourceOption } from './MobileSourcePicker'
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
  seasons: SeasonOption[]
  weekOverride: number | null
  seasonStartDate: string | null
  resolvedWeek: number | null
  liveSeason: SeasonOption | null
  currentWeek: number | null
  sourceRows: SourceOption[]
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
        <div className="mliv-section-label">Active season</div>
        <MobileLiveForm
          leagueId={leagueId}
          seasons={seasons}
          weekOverride={weekOverride}
          seasonStartDate={seasonStartDate}
          resolvedWeek={resolvedWeek}
        />
      </div>

      <div className="mliv-section">
        <div className="mliv-section-label">Live source</div>
        <div className="mliv-section-desc">Weekly cron re-syncs only the live source.</div>
        <MobileSourcePicker leagueId={leagueId} sources={sourceRows} />
      </div>

      <div className="mliv-section">
        <div className="mliv-section-label">Game of the Week</div>
        <div className="mliv-section-desc">Star one matchup per week.</div>
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
          <div className="mliv-card-empty">Pick a live season above first.</div>
        )}
      </div>
    </div>
  )
}
