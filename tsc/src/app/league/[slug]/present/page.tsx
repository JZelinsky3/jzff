import { requireLeagueOwner } from './_lib/gate'
import { Builder } from './builder'
import './present.css'

export default async function PresentBuilderPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { leagueName, slug: ownedSlug } = await requireLeagueOwner(slug)

  return (
    <main className="present-builder-page">
      <Builder slug={ownedSlug} leagueName={leagueName} />
    </main>
  )
}
