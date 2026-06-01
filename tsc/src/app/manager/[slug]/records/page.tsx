import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadCareerSummary } from '@/lib/manager/career'
import { ChronicleShell, SecHead } from '../_shared'

export default async function RecordBookStub({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const summary = await loadCareerSummary(slug, user.id)
  if (!summary) notFound()

  return (
    <ChronicleShell slug={slug} summary={summary}>
      <div className="mh-sec-first"><SecHead num="§ 04" title="The Record Book —" meta="under construction" /></div>
      <div className="mh-stub">
        <h2>The Record Book is being set in type.</h2>
        <p>Peaks and valleys lead this page — best wins, worst beats, biggest margins — intermixed with rivalry context, standings during those weeks, and the draft cohort that fielded each team.</p>
      </div>
    </ChronicleShell>
  )
}
