import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadCareerSummary } from '@/lib/manager/career'
import { ChronicleShell, SecHead } from '../_shared'

// Stub — built out after the spine A/B is settled. Pages will mix draft tables
// with "what this draft built" finish-chips and record-book callouts.
export default async function DraftRoomStub({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const summary = await loadCareerSummary(slug, user.id)
  if (!summary) notFound()

  return (
    <ChronicleShell slug={slug} summary={summary}>
      <div className="mh-sec-first"><SecHead num="§ 03" title="The Draft Room —" meta="under construction" /></div>
      <div className="mh-stub">
        <h2>The Draft Room is being set in type.</h2>
        <p>Once you pick the spine on the Front Page or Standings Desk, this page rolls out with draft tables intermixed with {`"what the picks built"`} — finish chips, championship overlap, signature games from the same year.</p>
      </div>
    </ChronicleShell>
  )
}
