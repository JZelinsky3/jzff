// Blind picks on record. SERVER ONLY.
//
// Range and Ball Knower turn over the four cards you passed on as soon as you
// keep one. A Builder run has no server state to lean on, so the turning over
// can't be free: anyone could ask with a throwaway pick, read the pack, and then
// post a different one. So a pick is written down BEFORE the pack turns, it can
// never be rewritten, and the run has to match it when it's scored. The card you
// kept stays masked, and that first post is when you find out what it was, unless
// you've turned on Show My Pick. A pick on record can't change, so showing it then
// gives nothing away that the player could still use on that pack.
//
// A run with nothing on record is fine: nothing about its packs was ever shown.
//
// See 0093_pack_empire_blind_picks.sql.

import { createAdminClient } from '@/lib/supabase/admin'
import { maskCard, type SeedInfo } from './deal'
import { SLOT_COUNT, type BlindLock, type Player } from './rules'
import { seedPack, type SoloPick } from './solo'

/** The key a run's picks sit under. Both seats of an Even Versus share a seed. */
export function blindRun(seed: string, info: SeedInfo, seat: string | null = null): string {
  return info.even ? `${seed}:${seat}` : seed
}

export function parseLockPicks(raw: unknown): SoloPick[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > SLOT_COUNT) return null
  const out: SoloPick[] = []
  for (const item of raw) {
    const { slot, id } = (item ?? {}) as Record<string, unknown>
    if (!Number.isInteger(slot) || (slot as number) < 0 || (slot as number) >= SLOT_COUNT) return null
    if (typeof id !== 'string' || id.length > 40) return null
    out.push({ slot: slot as number, id })
  }
  return out
}

async function readPicks(run: string): Promise<SoloPick[]> {
  const { data, error } = await createAdminClient()
    .from('pe_blind_picks')
    .select('slot, card_id')
    .eq('run', run)
    .order('n', { ascending: true })
  if (error) throw error
  return ((data ?? []) as { slot: number; card_id: string }[]).map((r) => ({ slot: r.slot, id: r.card_id }))
}

/** Every pick re-dealt in order, or null if one of them isn't in its pack. */
function walk(seed: string, info: SeedInfo, picks: SoloPick[]) {
  const taken: string[] = []
  const steps: { slot: number; pack: Player[]; card: Player }[] = []
  for (const pick of picks) {
    if (steps.some((s) => s.slot === pick.slot)) return null
    const pack = seedPack(seed, info, pick.slot, taken)
    const card = pack.find((c) => c.id === pick.id)
    if (!card) return null
    taken.push(card.id)
    steps.push({ slot: pick.slot, pack, card })
  }
  return steps
}

const leads = (a: SoloPick[], b: SoloPick[]) => a.every((p, i) => b[i]?.slot === p.slot && b[i]?.id === p.id)

/**
 * Put `want` on record, the whole run so far with the new pick last, and hand
 * back that pick's pack. Null `want` just reads what's there, which is how a run
 * comes back on a new device. Whatever is already on record stands, and the
 * primary key settles two picks landing at once. `open` is Show My Pick: picks on
 * record come back as they really are. Nothing else ever does.
 */
export async function lockBlindPicks(
  run: string,
  seed: string,
  info: SeedInfo,
  want: SoloPick[] | null,
  open = false
): Promise<{ ok: true; lock: BlindLock } | { ok: false; error: string; status: number }> {
  try {
    let locked = await readPicks(run)
    if (want && want.length > locked.length && leads(locked, want)) {
      if (!walk(seed, info, want)) return { ok: false, error: 'That pick is not in that pack.', status: 400 }
      const fresh = want.slice(locked.length).map((p, i) => ({ run, n: locked.length + i, slot: p.slot, card_id: p.id }))
      const { error } = await createAdminClient().from('pe_blind_picks').insert(fresh)
      if (error && error.code !== '23505') throw error
      locked = error ? await readPicks(run) : want
    }

    const steps = walk(seed, info, locked) ?? []
    const lineup: (Player | null)[] = Array(SLOT_COUNT).fill(null)
    const shown = (c: Player) => (open ? c : maskCard(c, info.diff))
    for (const s of steps) lineup[s.slot] = shown(s.card)

    const asked = want?.[want.length - 1]
    const step = asked && steps.find((s) => s.slot === asked.slot && s.card.id === asked.id)
    const seen = step
      ? { slot: step.slot, kept: step.card.id, cards: step.pack.map((c) => (c.id === step.card.id ? shown(c) : c)) }
      : null
    return { ok: true, lock: { picks: locked, lineup, seen } }
  } catch {
    return { ok: false, error: 'That pick did not save. Try again.', status: 503 }
  }
}

/** A finished lineup has to start with every pick on record. */
export async function matchesLocks(run: string, picks: SoloPick[]): Promise<boolean> {
  return leads(await readPicks(run), picks)
}
