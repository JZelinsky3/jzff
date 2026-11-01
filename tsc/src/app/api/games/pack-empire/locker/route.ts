// POST /api/games/pack-empire/locker
//
//   { action: 'open', pack }        -> { cards, fresh }
//   { action: 'deck', game, cards } -> {}
//
// The Locker itself, for every game on it. Signed-in only: what you own is an
// account's. Packs are dealt here and nowhere else.

import { NextResponse, type NextRequest } from 'next/server'
import { lockerOpenTo } from '@/lib/packEmpire/locker/access'
import { openPack, saveDeck } from '@/lib/packEmpire/locker/store'
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

  if (body.action === 'open') {
    if (typeof body.pack !== 'string' || !UUID.test(body.pack)) return bad('No such pack.')
    const out = await openPack(user.id, body.pack)
    return out.ok ? NextResponse.json({ ok: true, cards: out.cards, fresh: out.fresh }, { headers: NO_STORE }) : bad(out.error, out.status)
  }

  if (body.action === 'deck') {
    const { game, cards } = body
    if (typeof game !== 'string' || !Array.isArray(cards) || cards.length > 60 || !cards.every((c) => typeof c === 'string' && c.length <= 40)) {
      return bad('Malformed deck.')
    }
    const problem = await saveDeck(user.id, game, cards as string[])
    return problem ? bad(problem) : NextResponse.json({ ok: true }, { headers: NO_STORE })
  }

  return bad('Unknown action.')
}
