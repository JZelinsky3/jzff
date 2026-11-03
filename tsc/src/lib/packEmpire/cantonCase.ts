// A Canton on show. SERVER ONLY.
//
// Every Canton kept takes a number of its card for good (pe_canton_serials:
// the 5th one ever pulled is No. 5). This is what one numbered copy's own page
// and its link preview show: the card, its number over how many of it there
// are, who pulled it and when, and the other numbers of it that person holds.
// Only a board name ever leaves here, never an email.

import { publicNames } from '@/lib/minigames/boardIdentity'
import { createAdminClient } from '@/lib/supabase/admin'
import { playerById } from './pool'
import type { Player } from './rules'

export type CantonShowcase = {
  card: Player
  serial: number
  /** How many of this card anyone has pulled. */
  total: number
  owner: { name: string; you: boolean } | null
  pulledAt: string
  /** Every number of this card the owner holds, lowest first. */
  copies: number[]
  /** The owner's other Cantons, first pulled first. */
  others: { card: Player; serial: number }[]
}

type Row = { card_id: string; serial: number; user_id: string | null; created_at: string }

export function cantonPath(cardId: string, serial: number): string {
  return `/games/pack-empire/canton/${cardId}/${serial}/`
}

export async function cantonShowcase(cardId: string, serial: number, viewer: string | null): Promise<CantonShowcase | null> {
  if (!/^[a-z0-9-]{3,90}$/.test(cardId) || !Number.isInteger(serial) || serial < 1) return null
  const card = playerById(cardId)
  if (!card || card.rarity !== 'canton') return null

  const db = createAdminClient()
  const { data } = await db.from('pe_canton_serials').select('card_id, serial, user_id, created_at').eq('card_id', cardId)
  const rows = (data as Row[] | null) ?? []
  const row = rows.find((r) => r.serial === serial)
  if (!row) return null
  const total = rows.reduce((m, r) => Math.max(m, r.serial), 0)

  let owner: CantonShowcase['owner'] = null
  let copies = [serial]
  let others: CantonShowcase['others'] = []
  if (row.user_id) {
    const [names, theirs] = await Promise.all([
      publicNames([row.user_id]),
      db.from('pe_canton_serials').select('card_id, serial, user_id, created_at').eq('user_id', row.user_id),
    ])
    owner = { name: names.get(row.user_id) ?? 'A collector', you: viewer === row.user_id }
    const held = ((theirs.data as Row[] | null) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at))
    copies = held.filter((r) => r.card_id === cardId).map((r) => r.serial).sort((a, b) => a - b)
    const seen = new Set<string>([cardId])
    others = held.flatMap((r) => {
      if (seen.has(r.card_id)) return []
      seen.add(r.card_id)
      const c = playerById(r.card_id)
      return c ? [{ card: c, serial: r.serial }] : []
    })
  }
  return { card, serial, total, owner, pulledAt: row.created_at, copies, others }
}
