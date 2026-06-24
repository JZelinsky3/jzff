import Link from 'next/link'
import { MobileSetupList, type ProfileRow } from './MobileSetupList'
import { MarkReviewedButton } from '@/app/league/[slug]/setup/mark-reviewed-button'

export { type ProfileRow }

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

      <div style={{ padding: '0 1rem', marginBottom: '.75rem' }}>
        <Link href={`/league/${slug}/welcome`} className="mmem-wiz-link">
          Run setup wizard
        </Link>
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

      <MobileSetupList leagueId={leagueId} slug={slug} profiles={profiles} />
    </div>
  )
}
