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
