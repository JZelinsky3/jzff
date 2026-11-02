// /games/pack-empire/locker/field-general/<id>

import type { Metadata, Viewport } from 'next'
import { notFound, redirect } from 'next/navigation'
import { lockerOpenTo } from '@/lib/packEmpire/locker/access'
import { loadMatch } from '@/lib/packEmpire/locker/fieldGeneralMatch'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import mobileStyles from '../../../../mobile.module.css'
import { peFonts } from '../../../fonts'
import { LockerChrome, ROOM_CLASS, ROOM_COLOR } from '../../chrome'
import { MatchTable } from './MatchTable'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: ROOM_COLOR, width: 'device-width', initialScale: 1 }

export const metadata: Metadata = { title: 'Field General · The Locker', robots: { index: false, follow: false } }

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!(await lockerOpenTo(user?.id))) notFound()
  if (!user) redirect('/login?next=%2Fgames%2Fpack-empire%2Flocker%2Ffield-general%2F')
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const match = await loadMatch(user.id, id)
  if (!match) notFound()
  const mobile = (await getViewMode()) === 'mobile'

  return (
    <main className={`${ROOM_CLASS} ${peFonts}${mobile ? ` ${mobileStyles.root}` : ''}`}>
      <LockerChrome mobile={mobile} signedIn back="/games/pack-empire/locker/field-general/" backLabel="Field General" kicker="The Locker" title="Field" titleEm="General" tab="field-general" />
      <MatchTable key={match.id} initial={match} />
    </main>
  )
}
