import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { readBracket, readGoatToken, readVotes } from '@/app/goat/actions'
import { RoomView } from './room-view'
import '@/app/goat/goat.css'
import './room.css'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Bracket room · PA Milk Society' }

export default async function GoatRoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/signin?next=/league/${slug}/goat/room`)

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

  const state = await readBracket(league.id)
  const votes = await readVotes(league.id)
  const token = await readGoatToken(league.id)

  // Built server-side rather than from window.location, so the share URL is in
  // the HTML from the first paint.
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const origin = host ? `${proto}://${host}` : ''

  return <RoomView leagueId={league.id} origin={origin} state={state} votes={votes} token={token} />
}
