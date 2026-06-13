import { SetupList, type ProfileRow } from '@/app/league/[slug]/setup/setup-list'
import { MarkReviewedButton } from '@/app/league/[slug]/setup/mark-reviewed-button'

export function MobileMembers({
  leagueId,
  slug,
  profiles,
  reviewedAt,
}: {
  leagueId: string
  slug: string
  profiles: ProfileRow[]
  reviewedAt: string | null
}) {
  const currentCount = profiles.filter(
    (p) => !(p.is_alumni_override === true || (p.is_alumni_override === null && !p.auto_current)),
  ).length
  const alumniCount = profiles.length - currentCount

  return (
    <div className="mmem">
      <div className="mmem-head">
        <div className="mmem-head-left">
          <span className="mmem-title">Members</span>
          <span className="mmem-count">{profiles.length}</span>
        </div>
        <MarkReviewedButton leagueId={leagueId} reviewedAt={reviewedAt} />
      </div>

      <div className="mmem-stats">
        <div className="mmem-stat">
          <span className="mmem-stat-val">{currentCount}</span>
          <span className="mmem-stat-lbl">Current</span>
        </div>
        <div className="mmem-stat">
          <span className="mmem-stat-val">{alumniCount}</span>
          <span className="mmem-stat-lbl">Alumni</span>
        </div>
        <div className="mmem-stat">
          <span className="mmem-stat-val">{profiles.length}</span>
          <span className="mmem-stat-lbl">Total</span>
        </div>
      </div>

      <div className="mmem-hint">
        Select profiles to merge or delete. Tap a name's buttons to rename, toggle alumni, or hide.
      </div>

      <div className="mmem-list">
        <SetupList leagueId={leagueId} slug={slug} profiles={profiles} />
      </div>
    </div>
  )
}
