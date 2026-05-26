import { requireLeagueOwner } from './_lib/gate'
import { getLeaguePresentationData } from './_lib/leagueData'
import { Builder } from './builder'
import './present.css'

export default async function PresentBuilderPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { leagueId, leagueName, slug: ownedSlug } = await requireLeagueOwner(slug)
  const data = await getLeaguePresentationData(leagueId, leagueName)

  return (
    <main className="present-builder-page">
      <Builder slug={ownedSlug} leagueName={leagueName} data={data} />
    </main>
  )
}
