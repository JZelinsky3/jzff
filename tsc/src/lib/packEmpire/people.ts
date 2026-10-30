// Who is at the table. SERVER ONLY.
//
// The multiplayer modes have to name people to each other, and a seat has to
// know who is sitting in it. Signed in, a seat is the account. Signed out (a
// Versus challenger or a Mega Draft guest who opened a link), a seat is a
// random key the browser generated and keeps; only its SHA-256 is stored, so
// the table holds nothing anyone could replay to take the seat.

import { createHash, randomBytes } from 'crypto'
import { containsHateSpeech } from '@/lib/contentModeration'
import { publicNames } from '@/lib/minigames/boardIdentity'
import { createAdminClient } from '@/lib/supabase/admin'
import { SEED_ALPHABET } from './rules'

type Db = { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** The name this account goes by at the table: its board name, else its
    league claim, else the board's own fallback. See publicNames(). */
export async function nameForUser(_db: Db, userId: string): Promise<string> {
  return (await publicNames([userId])).get(userId) ?? 'Manager'
}

/** A name typed by someone without an account. Ordinary swearing passes, as
    it does everywhere on the site; slurs and email addresses don't. */
export function cleanGuestName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.replace(/\s+/g, ' ').trim()
  if (name.length < 2 || name.length > 24) return null
  if (name.includes('@') || containsHateSpeech(name)) return null
  return name
}

/** A guest can't turn up on the board as somebody already on it: another
    guest, or an account going by that name. `key` is the guest's own hashed
    key, so their own name stays theirs. */
export async function guestNameTaken(name: string, key: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from('game_runs')
    .select('user_id, guest_key, guest_name')
    .eq('game', 'pack-empire')
    .eq('pool_id', 'site')
    .limit(5000)
  const rows = (data ?? []) as { user_id: string | null; guest_key: string | null; guest_name: string | null }[]

  const wanted = name.toLowerCase()
  if (rows.some((r) => r.guest_key !== key && r.guest_name?.toLowerCase() === wanted)) return true

  const accounts = await publicNames(rows.flatMap((r) => (r.user_id ? [r.user_id] : [])))
  return [...accounts.values()].some((n) => n.toLowerCase() === wanted)
}

/** Seat keys come from the browser as 32+ hex characters. */
export function hashKey(key: unknown): string | null {
  if (typeof key !== 'string' || !/^[a-f0-9]{32,64}$/.test(key)) return null
  return createHash('sha256').update(`pe-seat|${key}`).digest('hex')
}

/** A short, read-out-loud-able id for a challenge, a draft or a league. */
export function newId(chars = 8): string {
  const bytes = randomBytes(chars)
  let out = ''
  for (let i = 0; i < chars; i++) out += SEED_ALPHABET[bytes[i] % 32]
  return out
}

export function isId(v: unknown, chars = 8): v is string {
  return typeof v === 'string' && new RegExp(`^[A-Z2-9]{${chars}}$`).test(v)
}
