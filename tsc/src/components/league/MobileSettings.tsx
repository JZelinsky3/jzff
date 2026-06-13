import { SettingsForm } from '@/app/league/[slug]/settings/settings-form'

export function MobileSettings({
  leagueId,
  leagueName,
  currentSlug,
  currentAbbreviation,
  currentPrizePool,
  currentDraftScoringProfile,
  savedJustNow,
}: {
  leagueId: string
  leagueName: string
  currentSlug: string
  currentAbbreviation: string | null
  currentPrizePool: string | null
  currentDraftScoringProfile: 'ppr_6pt' | 'half_4pt' | 'ppr_4pt' | 'half_6pt'
  savedJustNow: boolean
}) {
  return (
    <div className="mset">
      <div className="mset-head">
        <span className="mset-title">Settings</span>
      </div>
      <div className="mset-hint">How your league appears on the public almanac.</div>
      <div className="mset-form">
        <SettingsForm
          leagueId={leagueId}
          leagueName={leagueName}
          currentSlug={currentSlug}
          currentAbbreviation={currentAbbreviation}
          currentPrizePool={currentPrizePool}
          currentDraftScoringProfile={currentDraftScoringProfile}
          savedJustNow={savedJustNow}
        />
      </div>
    </div>
  )
}
