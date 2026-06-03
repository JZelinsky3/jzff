'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const Create = z.object({
  leagueId: z.string().uuid(),
  managerA: z.string().uuid(),
  managerB: z.string().uuid(),
  name: z.string().trim().optional(),
  autoName: z.coerce.boolean().optional(),
})

export async function createRivalry(_prev: unknown, formData: FormData) {
  // When auto-name is checked the name input is unmounted from the DOM, so
  // formData.get('name') returns null — coerce to undefined so the optional
  // schema accepts it instead of rejecting with "Expected string, received null".
  const parsed = Create.safeParse({
    leagueId: formData.get('leagueId'),
    managerA: formData.get('managerA'),
    managerB: formData.get('managerB'),
    name: formData.get('name') ?? undefined,
    autoName: formData.get('autoName') ?? undefined,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  const { leagueId, managerA, managerB, autoName } = parsed.data
  let { name } = parsed.data
  if (managerA === managerB) return { ok: false, error: 'Pick two different managers.' }

  const supabase = await createClient()

  // Auto-name when the checkbox is on OR when no name was typed. Resolve to
  // canonical profile names (post-merge) when available — the manager-level
  // display_name can lag after a profile rename, which would otherwise leak
  // a stale name into the auto-generated title.
  if (autoName || !name || !name.trim()) {
    const [{ data: mgrs }, { data: existing }] = await Promise.all([
      supabase
        .from('managers')
        .select('id, display_name, profile:manager_profiles(canonical_name)')
        .in('id', [managerA, managerB]),
      supabase
        .from('rivalries')
        .select('name')
        .eq('league_id', leagueId),
    ])
    type Row = { id: string; display_name: string | null; profile: { canonical_name: string } | { canonical_name: string }[] | null }
    const nameOf = (mid: string): string => {
      const row = (mgrs as Row[] | null | undefined)?.find((m) => m.id === mid)
      if (!row) return 'Unknown'
      const prof = Array.isArray(row.profile) ? row.profile[0] : row.profile
      return (prof?.canonical_name?.trim() || row.display_name?.trim() || 'Unknown')
    }
    const aName = nameOf(managerA)
    const bName = nameOf(managerB)
    const takenNames = new Set(
      (existing ?? []).map((r) => (r.name ?? '').trim().toLowerCase()),
    )
    name = pickRivalryName(managerA, managerB, aName, bName, takenNames)
  }

  const { error } = await supabase.from('rivalries').insert({
    league_id: leagueId,
    manager_a_id: managerA,
    manager_b_id: managerB,
    name,
    auto_named: !!autoName,
  })
  if (error) return { ok: false, error: error.message }

  // Find slug for redirect
  const { data: league } = await supabase.from('leagues').select('slug').eq('id', leagueId).single()
  revalidatePath(`/league/${league?.slug}/rivalries`)
  redirect(`/league/${league?.slug}/rivalries`)
}

function lastWord(s: string): string {
  const parts = s.trim().split(/\s+/)
  return parts[parts.length - 1] || s
}

// Curated bank of fantasy-football rivalry titles. We pick deterministically
// from this list so the same manager pair always proposes the same name —
// recreating a deleted rivalry returns the same title — and we walk forward
// when that name is already used by another rivalry in the same league
// (e.g. two pairs hash to "The Border War" → the second pair gets the next
// unused slot instead). Falls back to the original "X vs Y Bowl" format if
// every name in the bank is taken, which only happens past ~30 rivalries
// in a single league.
//
// Some entries contain {A} / {B} placeholders so the pair's name itself
// surfaces in a few of the picks — adds variety without leaking obvious
// "X vs Y" repetition.
const RIVALRY_NAME_BANK: readonly string[] = [
  'The Border War',
  'Civil War',
  'Battle Royale',
  'The Grudge Match',
  'The Reckoning',
  'The Vendetta',
  'Blood Feud',
  'The Iron Bowl',
  'The Bloodbath',
  'Holy War',
  'Cold War',
  'Bad Blood',
  'The Inferno',
  'Last Stand',
  'Heavyweight Bout',
  'The Cage Match',
  'The Cauldron',
  'The Crucible',
  'The Gauntlet',
  'The Hatchet',
  'War Games',
  'The Standoff',
  'Endgame',
  'The Brawl',
  'The Spectacle',
  'The Powder Keg',
  'The Tinderbox',
  'The Eruption',
  'The Crusade',
  'The Showdown',
  '{A} vs {B}: The Reckoning',
  'The Battle of {A} and {B}',
  '{A}-{B} War',
] as const

// Deterministic 32-bit hash. Same string in → same number out, across runs
// and machines. We seed name selection with the sorted manager-pair id so
// (A, B) and (B, A) propose the same name.
function hash32(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h |= 0
  }
  return h
}

function pickRivalryName(
  managerA: string,
  managerB: string,
  aName: string,
  bName: string,
  taken: Set<string>,
): string {
  const seedKey = [managerA, managerB].sort().join('|')
  const start = Math.abs(hash32(seedKey)) % RIVALRY_NAME_BANK.length
  for (let i = 0; i < RIVALRY_NAME_BANK.length; i++) {
    const tpl = RIVALRY_NAME_BANK[(start + i) % RIVALRY_NAME_BANK.length]!
    const candidate = tpl
      .replaceAll('{A}', lastWord(aName))
      .replaceAll('{B}', lastWord(bName))
    if (!taken.has(candidate.trim().toLowerCase())) return candidate
  }
  // Every name in the bank is in use for this league — fall back to the
  // legacy format so we never block a rivalry creation on naming.
  return `${lastWord(aName)} vs ${lastWord(bName)} Bowl`
}

export async function deleteRivalry(rivalryId: string, leagueSlug: string) {
  const supabase = await createClient()
  await supabase.from('rivalries').delete().eq('id', rivalryId)
  revalidatePath(`/league/${leagueSlug}/rivalries`)
}
