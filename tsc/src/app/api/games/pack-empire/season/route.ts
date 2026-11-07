// /api/games/pack-empire/season
//
//   GET  ?id=                    -> { view }
//   POST { action, id, ... }     -> { view } (open and benchOpen add { cards })
//
// League Mode's Season variation (lib/packEmpire/season.ts). A solo season needs
// no account: starting one with no account hands this browser the Daily's guest
// cookie, and that cookie owns it until sign-in. A league with friends needs an
// account. Every action is checked in season.ts (is this your team, are you the
// commissioner, is the pack open) and written with the service role.

import { randomBytes } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DAILY_COOKIE, DAILY_COOKIE_AGE } from '@/lib/packEmpire/dailyWho'
import { hashKey } from '@/lib/packEmpire/people'
import {
  createSeason,
  deleteSeason,
  forceSeason,
  joinSeason,
  keepReward,
  openBenchPack,
  openSeasonPack,
  pickBenchCard,
  pickSeasonCard,
  playSeasonGame,
  releaseBench,
  renameSeasonTeam,
  seasonView,
  setFranchise,
  setSeasonCpus,
  setSeasonPlayoffs,
  startSeason,
  subIn,
  type SeasonWho,
} from '@/lib/packEmpire/season'
import { seasonViewer } from '@/lib/packEmpire/seasonWho'

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
  return seasonViewer(user?.id ?? null)
}

// Solo seasons started with no account: 6 per 10 minutes per warm instance. Each
// one writes twelve teams and eighty-eight games. Best-effort on serverless.
const STARTS = new Map<string, number[]>()

function tooManyStarts(req: NextRequest): boolean {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now()
  const recent = (STARTS.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000)
  if (recent.length >= 6) return true
  if (STARTS.size > 5000) STARTS.clear()
  STARTS.set(ip, [...recent, now])
  return false
}

export async function GET(req: NextRequest) {
  const view = await seasonView(req.nextUrl.searchParams.get('id'), await viewer())
  if (!view) return reply({ ok: false, error: 'No such season.' }, 404)
  return reply({ ok: true, view })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return reply({ ok: false, error: 'Malformed request.' }, 400)
  }

  // Only starting a solo season can make someone new, and that's where the
  // cookie's handed out. Anything else from a stranger has no team to act on.
  let who: SeasonWho | null = await viewer()
  let cookie: string | null = null
  if (!who) {
    if (body.action !== 'create' || body.kind === 'league') return reply({ ok: false, error: 'Sign in to do that.' }, 401)
    if (tooManyStarts(req)) return reply({ ok: false, error: 'Too many seasons in a row. Give it a few minutes.' }, 429)
    cookie = randomBytes(24).toString('hex')
    who = { guestKey: hashKey(cookie) as string }
  }

  const id = body.id
  let out: { ok: true; [k: string]: unknown } | { ok: false; error: string; status?: number }
  switch (body.action) {
    case 'create':
      out = await createSeason(who, body)
      break
    case 'join':
      out = who.userId ? await joinSeason(who.userId, body) : { ok: false, error: 'Sign in to join a league.', status: 401 }
      break
    case 'cpus':
      out = await setSeasonCpus(id, who, body.fill !== false)
      break
    case 'playoffs':
      out = await setSeasonPlayoffs(id, who, body.size)
      break
    case 'start':
      out = await startSeason(id, who)
      break
    case 'delete':
      out = await deleteSeason(id, who)
      break
    case 'rename':
      out = await renameSeasonTeam(id, who, body.name)
      break
    case 'franchise':
      out = await setFranchise(id, who, body.slot)
      break
    case 'open':
      out = await openSeasonPack(id, who, body.slot)
      break
    case 'pick':
      out = await pickSeasonCard(id, who, body.card)
      break
    case 'benchOpen':
      out = await openBenchPack(id, who)
      break
    case 'benchPick':
      out = await pickBenchCard(id, who, body.card)
      break
    case 'play':
      out = await playSeasonGame(id, who)
      break
    case 'keep':
      out = await keepReward(id, who, body.card ?? null, body.release)
      break
    case 'sub':
      out = await subIn(id, who, body.bench, body.slot)
      break
    case 'release':
      out = await releaseBench(id, who, body.bench)
      break
    case 'force':
      out = await forceSeason(id, who)
      break
    default:
      out = { ok: false, error: 'Unknown action.' }
  }
  if (!out.ok) return reply(out, out.status ?? 400)

  const leagueId = body.action === 'create' || body.action === 'join' ? (out.id as string) : id
  const view = body.action === 'delete' ? null : await seasonView(leagueId, who)
  const res = reply({ ...out, view })
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
