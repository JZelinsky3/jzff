import { MobileLiveForm, type SeasonOption } from './MobileLiveForm'
import { MobileSourcePicker, type SourceOption } from './MobileSourcePicker'
import { MobilePowerDrawer } from './MobilePowerDrawer'
import { GotwPicker, type GotwWeek } from '@/app/league/[slug]/live/gotw-picker'
import { GotwTip } from '@/app/league/[slug]/live/gotw-tip'
import { RecapCard } from '@/app/league/[slug]/live/recap-card'
import { RecapList } from '@/app/league/[slug]/live/recap-list'
import type { ListMember } from '@/lib/recap/subscribers'

export function MobileLiveSeason({
  leagueId,
  slug,
  year,
  seasons,
  pastSeasons,
  weekOverride,
  seasonStartDate,
  resolvedWeek,
  liveSeason,
  currentWeek,
  sourceRows,
  pastSources,
  liveSeasonId,
  gotwWeeks,
  gotwMap,
  gotwManagers,
  gotwTip,
  recapWeek,
  published,
  members,
  showList,
  powerStatus,
}: {
  leagueId: string
  slug: string
  year: number
  seasons: SeasonOption[]
  pastSeasons: SeasonOption[]
  weekOverride: number | null
  seasonStartDate: string | null
  resolvedWeek: number | null
  liveSeason: SeasonOption | null
  currentWeek: number | null
  sourceRows: SourceOption[]
  pastSources: SourceOption[]
  liveSeasonId: string | null
  gotwWeeks: GotwWeek[]
  gotwMap: Record<string, string>
  gotwManagers: string[]
  gotwTip: { week: number; matchup: string | null } | null
  recapWeek: { year: number; week: number } | null
  published: boolean
  members: ListMember[]
  showList: boolean
  powerStatus: string
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
          pastSeasons={pastSeasons}
          year={year}
          weekOverride={weekOverride}
          seasonStartDate={seasonStartDate}
          resolvedWeek={resolvedWeek}
        />
      </div>

      <div className="mliv-section">
        <div className="mliv-section-label">Live source</div>
        <div className="mliv-section-desc">Weekly cron re-syncs only the live source.</div>
        <MobileSourcePicker leagueId={leagueId} sources={sourceRows} pastSources={pastSources} year={year} />
      </div>

      <div className="mliv-section">
        <div className="mliv-section-label">Game of the Week</div>
        <div className="mliv-section-desc">One featured game a week. Set them early: the recap leads with it.</div>
        {liveSeasonId && gotwWeeks.length > 0 ? (
          <GotwPicker
            leagueId={leagueId}
            seasonId={liveSeasonId}
            defaultWeek={currentWeek}
            weeks={gotwWeeks}
            currentGotw={gotwMap}
            managers={gotwManagers}
            variant="mobile"
          />
        ) : (
          <div className="mliv-card-empty">Pick a live season above first.</div>
        )}
      </div>

      <div className="mliv-section">
        <div className="mliv-section-label">Weekly recap</div>
        <div className="mliv-section-desc">Every Tuesday in your inbox. Read it or send a copy now.</div>
        <RecapCard leagueId={leagueId} slug={slug} latest={recapWeek} published={published} variant="mobile" />
        {gotwTip ? <GotwTip week={gotwTip.week} matchup={gotwTip.matchup} variant="mobile" /> : null}
        {showList ? <RecapList leagueId={leagueId} members={members} published={published} variant="mobile" /> : null}
      </div>

      <div className="mliv-section">
        <div className="mliv-section-label">Your power rankings</div>
        <div className="mliv-section-desc">Your order next to the model&apos;s, on the Power Rankings page.</div>
        {liveSeasonId ? (
          <MobilePowerDrawer leagueId={leagueId} seasonId={liveSeasonId} slug={slug} status={powerStatus} />
        ) : (
          <div className="mliv-card-empty">Pick a live season above first.</div>
        )}
      </div>
    </div>
  )
}
