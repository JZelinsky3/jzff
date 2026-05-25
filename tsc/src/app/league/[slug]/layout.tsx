import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LeagueBackLink } from './back-link'
import { AdminNavMenu } from './admin-nav-menu'

export default async function LeagueLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, platform')
    .eq('slug', slug)
    .maybeSingle()
  if (!league) notFound()

  const words = league.name.trim().split(/\s+/)
  const head = words.slice(0, -1).join(' ')
  const tail = words[words.length - 1] ?? ''

  return (
    <>
      <nav className="nav">
        <LeagueBackLink slug={slug} />
        <div className="nav-center">
          <div className="nav-kicker">{league.platform} · Management</div>
          <div className="nav-title">
            {head} {tail && <em>{tail}.</em>}
          </div>
        </div>
        <AdminNavMenu slug={slug} />
      </nav>
      {children}
    </>
  )
}
