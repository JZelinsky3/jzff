// Dynasty portfolio snapshot endpoint — returns current KTC-valued portfolio
// per linked Sleeper league.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadPortfolio } from '@/lib/manager/portfolio'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Sign in required', { status: 401 })

  const snap = await loadPortfolio(slug, user.id)
  if (!snap) return new NextResponse('Not found', { status: 404 })

  return NextResponse.json(snap, {
    headers: {
      'Cache-Control': 'private, max-age=120, must-revalidate',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
    },
  })
}
