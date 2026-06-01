import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadCareerSummary } from '@/lib/manager/career'
import { ChronicleShell, SecHead } from '../_shared'

export default async function TrophyRoomStub({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const summary = await loadCareerSummary(slug, user.id)
  if (!summary) notFound()

  return (
    <ChronicleShell slug={slug} summary={summary}>
      <div className="mh-sec-first"><SecHead num="§ 06" title="The Trophy Room —" meta="under construction" /></div>
      <div className="mh-stub">
        <h2>The Trophy Room is being set in type.</h2>
        <p>Championships and runner-up plaques lead this page — but cross-cut with the drafts that built those teams, the signature wins from those seasons, the milestones racked up along the way, and the rival who came closest to spoiling it.</p>
      </div>
    </ChronicleShell>
  )
}
