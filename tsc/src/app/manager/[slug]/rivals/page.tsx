import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadCareerSummary } from '@/lib/manager/career'
import { ChronicleShell, SecHead } from '../_shared'

export default async function SocietyPageStub({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const summary = await loadCareerSummary(slug, user.id)
  if (!summary) notFound()

  return (
    <ChronicleShell slug={slug} summary={summary}>
      <div className="mh-sec-first"><SecHead num="§ 05" title="The Society Page —" meta="under construction" /></div>
      <div className="mh-stub">
        <h2>The Society Page is being set in type.</h2>
        <p>Head-to-heads lead this page — most-faced opponents, finals matchups, the rivalries that defined seasons — intermixed with title-year overlap, signature games against the same rival, and standings during the rivalry years.</p>
      </div>
    </ChronicleShell>
  )
}
