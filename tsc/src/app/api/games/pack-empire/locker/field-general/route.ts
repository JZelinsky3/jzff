// POST /api/games/pack-empire/locker/field-general
//
//   { action: 'start', mode }       -> { id }
//   { action: 'drive', id, plays }  -> { match }
//   { action: 'resign', id }        -> {}
//
// The server plays the CPU and holds the match, so all a browser can send is what
// it wants to play. See lib/packEmpire/locker/fieldGeneralMatch.

import { NextResponse, type NextRequest } from 'next/server'
import { lockerOpenTo } from '@/lib/packEmpire/locker/access'
import { parsePlays, resignMatch, startMatch, takeDrive } from '@/lib/packEmpire/locker/fieldGeneralMatch'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE })
}

const UUID = /^[0-9a-f-]{36}$/i

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return bad('Sign in first.', 401)
  if (!(await lockerOpenTo(user.id))) return bad('Not found.', 404)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return bad('Malformed request.')
  }

  if (body.action === 'start') {
    const out = await startMatch(user.id, body.mode === 'event' ? 'event' : 'standard')
    return out.ok ? NextResponse.json({ ok: true, id: out.id }, { headers: NO_STORE }) : bad(out.error, out.status)
  }

  if (typeof body.id !== 'string' || !UUID.test(body.id)) return bad('No such game.')

  if (body.action === 'drive') {
    const plays = parsePlays(body.plays)
    if (!plays) return bad('Malformed plays.')
    const out = await takeDrive(user.id, body.id, plays)
    return out.ok ? NextResponse.json({ ok: true, match: out.match }, { headers: NO_STORE }) : bad(out.error, out.status)
  }

  if (body.action === 'resign') {
    await resignMatch(user.id, body.id)
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  }

  return bad('Unknown action.')
}
