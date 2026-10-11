import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { getViewMode } from '@/lib/viewMode'
import { loadAdmin } from './data'
import { DesktopAdmin } from './desktop'
import { MobileAdmin } from './mobile'

// The control room. One read (data.ts), two layouts: the phone gets its own
// tree because that's where Joey checks it; desktop is for the downloads and
// the long lists. ?m=<filter> opens the member list on a plan.

export const metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!(await isSiteAdmin(user.id))) notFound()

  const [data, mode, sp] = await Promise.all([loadAdmin(), getViewMode(), searchParams])
  return mode === 'mobile'
    ? <MobileAdmin data={data} filter={sp.m} />
    : <DesktopAdmin data={data} filter={sp.m} />
}
