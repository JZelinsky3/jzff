// /games/pack-empire/locker/field-general/<id>
//
// A game, full screen: nothing of the site around it. Anyone who isn't in the game yet
// gets the challenge instead, and takes the other seat from there.

import type { Metadata, Viewport } from 'next'
import { notFound, redirect } from 'next/navigation'
import { lockerOpenTo } from '@/lib/packEmpire/locker/access'
import { invitation, loadMatch } from '@/lib/packEmpire/locker/fieldGeneralMatch'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../../../mobile.module.css'
import { peFonts } from '../../../fonts'
import { ROOM_CLASS, ROOM_COLOR } from '../../chrome'
import { JoinCard } from './JoinCard'
import { MatchTable } from './MatchTable'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: ROOM_COLOR, width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export const metadata: Metadata = { title: 'Field General · The Locker', robots: { index: false, follow: false } }

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await lockerOpenTo(user?.id))) notFound()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/games/pack-empire/locker/field-general/${id}/`)}`)

  const mobile = (await getViewMode()) === 'mobile'
  const main = `${ROOM_CLASS} ${peFonts}${mobile ? ` ${mobileStyles.root}` : ''}`
  const match = await loadMatch(user.id, id)
  if (!match) {
    const invite = await invitation(user.id, id)
    if (!invite) notFound()
    return (
      <main className={main}>
        <JoinCard invite={invite} />
      </main>
    )
  }

  return (
    <main className={main}>
      <MatchTable key={match.id} initial={match} />
    </main>
  )
}
