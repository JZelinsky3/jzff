import { requireLeagueOwner } from '../_lib/gate'
import { Presenter } from './presenter'
import '../present.css'

export default async function PresentRunPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { leagueName, slug: ownedSlug } = await requireLeagueOwner(slug)

  return <Presenter slug={ownedSlug} leagueName={leagueName} />
}
