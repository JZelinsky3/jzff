// What a shared link can prove. SERVER ONLY.
//
// A Builder score is a row on the board, so its link is the row's id. A Daily
// score is a row keyed on the account, and those keys don't go in public links,
// so its link carries the score itself, signed: nobody can mint one for a number
// they didn't post, and there's nothing to look up.

import { createHmac, hkdfSync, timingSafeEqual } from 'crypto'
import { publicNames } from '@/lib/minigames/boardIdentity'
import { createAdminClient } from '@/lib/supabase/admin'
import { playerById } from './pool'
import { SLOT_COUNT, difficultyForMode, tierFor, type Difficulty, type Player, type Tier } from './rules'
import { parseSoloPicks } from './solo'

export type SharedRun = {
  id: string
  name: string
  score: number
  tier: Tier
  difficulty: Difficulty
  /** By slot. A card from an older pool that no longer exists is a null. */
  lineup: (Player | null)[]
  captain: number | null
  at: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A Builder run off the board. */
export async function loadRun(id: string): Promise<SharedRun | null> {
  if (!UUID.test(id)) return null
  const { data } = await createAdminClient()
    .from('game_runs')
    .select('id, user_id, guest_name, score, mode, detail, created_at')
    .eq('id', id)
    .eq('game', 'pack-empire')
    .maybeSingle()
  if (!data) return null
  const row = data as {
    id: string
    user_id: string | null
    guest_name: string | null
    score: number
    mode: string | null
    detail: { captain?: number; picks?: unknown } | null
    created_at: string
  }
  const lineup: (Player | null)[] = Array(SLOT_COUNT).fill(null)
  for (const pick of parseSoloPicks(row.detail?.picks) ?? []) lineup[pick.slot] = playerById(pick.id)
  const name = row.user_id ? (await publicNames([row.user_id])).get(row.user_id) : row.guest_name
  return {
    id: row.id,
    name: name ?? 'Manager',
    score: Number(row.score),
    tier: tierFor(Number(row.score)),
    difficulty: difficultyForMode(row.mode) ?? 'open',
    lineup,
    captain: row.detail?.captain ?? null,
    at: row.created_at,
  }
}

export type SharedDaily = { day: string; version: 'range' | 'season'; score: number; name: string }

let cachedKey: Buffer | null = null

function key(): Buffer {
  if (cachedKey) return cachedKey
  const base = process.env.PACK_EMPIRE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error('Pack Empire has no dealing secret configured.')
  cachedKey = Buffer.from(hkdfSync('sha256', base, 'tsc-pack-empire', 'share-v1', 32))
  return cachedKey
}

const seal = (body: string) => createHmac('sha256', key()).update(body).digest('base64url').slice(0, 16)

export function signDaily(s: SharedDaily): string {
  const body = Buffer.from(JSON.stringify([s.day, s.version, s.score, s.name])).toString('base64url')
  return `${body}.${seal(body)}`
}

/** The score a link claims, or null if it wasn't signed here. */
export function readDaily(token: unknown): SharedDaily | null {
  if (typeof token !== 'string' || token.length > 240) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const want = Buffer.from(seal(body))
  const got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  try {
    const [day, version, score, name] = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (typeof day !== 'string' || (version !== 'range' && version !== 'season')) return null
    if (typeof score !== 'number' || typeof name !== 'string') return null
    return { day, version, score, name }
  } catch {
    return null
  }
}
