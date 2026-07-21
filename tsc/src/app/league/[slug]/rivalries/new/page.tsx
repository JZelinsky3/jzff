import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { loadManagerOptions } from '@/lib/managerOptions'
import { NewRivalryForm } from './new-rivalry-form'

export default async function NewRivalryPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: league } = await supabase
    .from('leagues')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (!league) notFound()

  // Deduped by profile (merged managers → one entry, canonical name applied,
  // hidden profiles excluded). Each option's id is the primary manager id,
  // which is what rivalries.manager_a_id/_b_id expects.
  const options = await loadManagerOptions(supabase, league.id)
  const managers = options.map((o) => ({ id: o.id, display_name: o.name }))

  return (
    <main>
      <section className="lo-hero">
        <div className="lo-hero-kicker">New Feud</div>
        <h1 className="lo-hero-title">Pair Them <em>Up.</em></h1>
        <p className="lo-hero-standfirst">
          Pick two managers. Leave auto-name on and we&apos;ll generate a title
          from a curated bank, or write your own.
        </p>
      </section>

      <div className="lo-band" style={{ maxWidth: 620 }}>
        <div className="lo-form-card">
          <NewRivalryForm leagueId={league.id} managers={managers} />
        </div>

        <div style={{ marginTop: '1.5rem' }}>
          <Link href={`/league/${slug}/rivalries`} className="lo-btn-quiet">← All rivalries</Link>
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
