import type { Viewport } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { readExamToken, readRuns } from '@/app/exam/actions'
import { RoomView } from './room-view'
import '@/app/exam/exam.css'
import './room.css'

export const dynamic = 'force-dynamic'

// Same reason as the public page: the inherited navy theme-color paints
// Safari's bars, and this room is the same warm near-black end to end.
export const viewport: Viewport = {
  themeColor: '#0e0d0c',
  width: 'device-width',
  initialScale: 1,
}

export const metadata = { title: 'Exam room · PA Milk Society' }

export default async function ExamRoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/signin?next=/league/${slug}/exam/room`)

  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, slug, owner_id')
    .eq('slug', slug)
    .maybeSingle()
  if (!league) notFound()

  // Owner, editor, or site admin. Everybody else gets a 404 rather than a
  // "forbidden", so the room's existence isn't advertised to the league.
  let allowed = league.owner_id === user.id
  if (!allowed) {
    const { data: member } = await supabase
      .from('league_members')
      .select('role')
      .eq('league_id', league.id)
      .eq('user_id', user.id)
      .maybeSingle()
    allowed = !!member && ['owner', 'editor'].includes(member.role)
  }
  if (!allowed) allowed = await isSiteAdmin(user.id)
  if (!allowed) notFound()

  const [token, runs] = await Promise.all([readExamToken(league.id), readRuns(league.id)])

  // Build the shareable link server-side rather than reading window.location
  // on the client, so the URL is in the HTML from the start and copies clean.
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const origin = host ? `${proto}://${host}` : ''

  return <RoomView leagueId={league.id} origin={origin} runs={runs} token={token} />
}
