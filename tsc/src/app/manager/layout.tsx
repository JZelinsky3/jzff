import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { isSiteAdmin } from '@/lib/siteAdmin'

// Manager Hub is admin-gated while it's still being built — users who land
// on /manager/* without site_admin get bounced to the dashboard. Lift this
// once the hub is launch-ready and the dashboard card is unhidden too.
export default async function ManagerLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = await isSiteAdmin(user.id)
  if (!admin) redirect('/dashboard')
  return <>{children}</>
}
