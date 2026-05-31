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
      <section className="hero" style={{ paddingTop: '3rem', paddingBottom: '1.5rem' }}>
        <div className="hero-sup">★ New feud ★</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)' }}>
          Pair Them <em>Up.</em>
        </h1>
        <p className="hero-sub">
          Pick two managers. Leave the name blank or check Auto-name and we&apos;ll generate one.
        </p>
      </section>

      <div className="section" style={{ maxWidth: '600px' }}>
        <div className="card" style={{ paddingBottom: '2rem' }}>
          <NewRivalryForm leagueId={league.id} managers={managers} />
        </div>

        <div style={{ marginTop: '2rem' }}>
          <Link href={`/league/${slug}/rivalries`} className="dc-btn-ghost">← All rivalries</Link>
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
