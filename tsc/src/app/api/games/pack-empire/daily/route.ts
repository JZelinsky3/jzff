// /api/games/pack-empire/daily
//
//   GET  ?v=range|season                        -> { state }
//   POST { action: 'start', version, captain }  -> { state }
//   POST { action: 'open', version }            -> { state }  starts the clock
//   POST { action: 'pick', version, id }        -> { state }
//   POST { action: 'expire', version }          -> { state }  the browser's clock hit zero
//   POST { action: 'name', version, name, key } -> { state }  a guest, at the end
//
// A run lives on the server (see lib/packEmpire/daily.ts), so these only ever
// move it forward: there's no way to ask for a pack but the one you're on. No
// account needed: starting one with no account hands this browser a cookie, and
// that cookie is the run's owner (see lib/packEmpire/dailyWho.ts).

import { randomBytes } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  dailyState,
  expireDaily,
  isDailyVersion,
  nameDaily,
  openDaily,
  pickDaily,
  startDaily,
  type DailyWho,
} from '@/lib/packEmpire/daily'
import { DAILY_COOKIE, DAILY_COOKIE_AGE, dailyViewer } from '@/lib/packEmpire/dailyWho'
import { hashKey } from '@/lib/packEmpire/people'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

async function viewer() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return dailyViewer(user?.id ?? null)
}

// Starts with no account: 12 per 10 minutes per warm instance, the Builder
// board's guest limit. Best-effort on serverless.
const STARTS = new Map<string, number[]>()

function tooManyStarts(req: NextRequest): boolean {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now()
  const recent = (STARTS.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000)
  if (recent.length >= 12) return true
  if (STARTS.size > 5000) STARTS.clear()
  STARTS.set(ip, [...recent, now])
  return false
}

export async function GET(req: NextRequest) {
  const version = req.nextUrl.searchParams.get('v')
  if (!isDailyVersion(version)) return reply({ ok: false, error: 'No such Daily.' }, 400)
  return reply({ ok: true, state: await dailyState(await viewer(), version) })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return reply({ ok: false, error: 'Malformed request.' }, 400)
  }
  if (!isDailyVersion(body.version)) return reply({ ok: false, error: 'No such Daily.' }, 400)

  // Only starting a run can make someone new, and that's where the cookie's
  // handed out. Anything else from a stranger has no run to act on.
  let who: DailyWho | null = await viewer()
  let cookie: string | null = null
  if (!who) {
    if (body.action !== 'start') return reply({ ok: false, error: 'That Daily has ended. A new one is up.' }, 409)
    if (tooManyStarts(req)) return reply({ ok: false, error: 'Too many runs in a row. Give it a few minutes.' }, 429)
    cookie = randomBytes(24).toString('hex')
    who = { guestKey: hashKey(cookie) as string }
  }

  const out =
    body.action === 'start'
      ? await startDaily(who, body.version, body.captain)
      : body.action === 'open'
        ? await openDaily(who, body.version)
        : body.action === 'pick'
          ? await pickDaily(who, body.version, body.id)
          : body.action === 'expire'
            ? await expireDaily(who, body.version)
            : body.action === 'name'
              ? await nameDaily(who, body.version, body.name, hashKey(body.key))
              : { ok: false as const, error: 'Unknown action.' }
  if (!out.ok) return reply(out, ('status' in out ? out.status : undefined) ?? 400)
  const res = reply(out)
  if (cookie) {
    res.cookies.set(DAILY_COOKIE, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: DAILY_COOKIE_AGE,
    })
  }
  return res
}
