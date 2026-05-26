import { requireLeagueOwner } from '../_lib/gate'
import { getLeaguePresentationData } from '../_lib/leagueData'
import { Presenter } from './presenter'
import '../present.css'

export default async function PresentRunPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { leagueId, leagueName, slug: ownedSlug } = await requireLeagueOwner(slug)
  const data = await getLeaguePresentationData(leagueId, leagueName)

  return <Presenter slug={ownedSlug} leagueName={leagueName} data={data} />
}
