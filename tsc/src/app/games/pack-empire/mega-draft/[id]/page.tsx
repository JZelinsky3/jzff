import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { getMega } from '@/lib/packEmpire/mega'
import mobileStyles from '../../../mobile.module.css'
import { PeChrome } from '../../chrome'
import { peFonts } from '../../fonts'
import { MegaRoom } from '../MegaRoom'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const view = await getMega(id.toUpperCase(), null, null)
  return {
    title: view ? `${view.hostName}'s Mega Draft · Pack Empire` : 'Mega Draft · Pack Empire',
    description: 'A live snake draft off one shared board of thirty-six. Sit down and pick.',
    robots: { index: false, follow: false },
  }
}

export default async function MegaDraftRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const view = await getMega(id.toUpperCase(), user?.id ?? null, null)
  if (!view) notFound()
  const mobile = (await getViewMode()) === 'mobile'

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.boardRoot : ''}`.trim()}>
      <PeChrome
        active="mega"
        mobile={mobile}
        signedIn={!!user}
        back="/games/pack-empire/mega-draft/"
        backLabel="Mega Draft"
        kicker="Pack Empire"
        title="Mega"
        titleEm="Draft"
      />
      <div className="pe-wrap">
        <MegaRoom initial={view} signedIn={!!user} />
      </div>
      {!mobile && <SiteFooter />}
    </main>
  )
}
