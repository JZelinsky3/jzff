import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { PAMS_ROSTER, SEASON, buildBoard, type Picks } from '@/lib/winBallot'
import { readBallotToken } from '@/app/ballot/actions'
import { RoomView } from './room-view'
import '@/app/ballot/ballot.css'
import './room.css'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Ballot room · PA Milk Society' }

export default async function BallotRoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/signin?next=/league/${slug}/ballot/room`)

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

  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('win_ballots')
    .select('manager_name, picks, total, created_at')
    .eq('league_id', league.id)
    .eq('season', SEASON)
    .order('created_at', { ascending: true })

  const ballots = (rows ?? []).map((r) => ({
    name: r.manager_name as string,
    picks: r.picks as Picks,
    total: r.total as number,
    at: r.created_at as string,
  }))

  const board = buildBoard(PAMS_ROSTER, ballots.map((b) => b.picks))
  const token = await readBallotToken(league.id)

  // Build the shareable link server-side rather than reading
  // window.location on the client, so the URL is in the HTML from the start.
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const origin = host ? `${proto}://${host}` : ''

  return (
    <RoomView
      leagueId={league.id}
      origin={origin}
      roster={PAMS_ROSTER}
      ballots={ballots}
      board={board}
      token={token}
    />
  )
}
