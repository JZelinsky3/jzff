'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { EDITION, ROSTER, scorePicks, validatePicks, type RunRecord } from '@/lib/milkExam'

/**
 * Resolve a share token back to its league. The token is the whole address of
 * the public game, so this is the lookup the page boots from; an unknown token
 * simply has no league and gets the "wrong door" screen.
 */
export async function leagueForToken(token: string): Promise<{ id: string; slug: string; name: string } | null> {
  if (!token || token.length < 8) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('leagues')
    .select('id, slug, name')
    .eq('settings->>exam_token', token)
    .maybeSingle()
  if (!data) return null
  return { id: data.id as string, slug: data.slug as string, name: data.name as string }
}

// The game is open to whoever holds the link, so the share token IS the
// authorization. It lives on the league row (settings.exam_token) and is
// minted from the room, which is itself owner-gated. Same shape as the ballot.
export async function readExamToken(leagueId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('leagues')
    .select('settings')
    .eq('id', leagueId)
    .maybeSingle()
  const settings = (data?.settings ?? {}) as { exam_token?: unknown }
  return typeof settings.exam_token === 'string' && settings.exam_token.length > 0
    ? settings.exam_token
    : null
}

async function assertWriteAccess(leagueId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not signed in.' }
  const { data: league } = await supabase
    .from('leagues')
    .select('id, owner_id, slug')
    .eq('id', leagueId)
    .maybeSingle()
  if (!league) return { ok: false as const, error: 'League not found.' }
  if (league.owner_id !== user.id) {
    const { data: member } = await supabase
      .from('league_members')
      .select('role')
      .eq('league_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!member || !['owner', 'editor'].includes(member.role)) {
      if (!(await isSiteAdmin(user.id))) return { ok: false as const, error: 'No write access.' }
    }
  }
  return { ok: true as const, slug: league.slug as string }
}

/**
 * Mint (or re-read) the share token. Called from the room so the owner has one
 * link to paste in the group chat. Rotating it invalidates the old link, which
 * is how you shut the game down or recover from a link that leaked.
 */
export async function ensureExamToken(
  leagueId: string,
  rotate = false,
): Promise<{ ok: false; error: string } | { ok: true; token: string }> {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access

  const existing = await readExamToken(leagueId)
  if (existing && !rotate) return { ok: true, token: existing }

  const token = Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 20)

  const admin = createAdminClient()
  const { data: row } = await admin.from('leagues').select('settings').eq('id', leagueId).maybeSingle()
  const settings = { ...((row?.settings ?? {}) as Record<string, unknown>), exam_token: token }
  const { error } = await admin.from('leagues').update({ settings }).eq('id', leagueId)
  if (error) return { ok: false, error: error.message }
  return { ok: true, token }
}

/** Every filed run for a league's edition, for the board and the room. */
export async function readRuns(leagueId: string): Promise<RunRecord[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('exam_runs')
    .select('manager_name, picks, score, created_at')
    .eq('league_id', leagueId)
    .eq('edition', EDITION)
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
  return (data ?? []).map((r) => ({
    name: r.manager_name as string,
    picks: (r.picks ?? {}) as Record<string, string[]>,
    score: (r.score ?? 0) as number,
  }))
}

/** Who has already played, so the name step can grey them out. */
export async function playedNames(leagueId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('exam_runs')
    .select('manager_name')
    .eq('league_id', leagueId)
    .eq('edition', EDITION)
  return (data ?? []).map((r) => r.manager_name as string)
}

/**
 * File a run.
 *
 * The client sends the names it picked and never a score: the total is
 * computed here, so what the board shows is always something the server
 * stands behind. One run per manager is enforced by the unique index rather
 * than by anything in the browser, because the answers are revealed as you
 * play and a second attempt would just be a memory test of the first.
 */
export async function submitRun(
  token: string,
  name: string,
  picks: Record<string, string[]>,
): Promise<{ ok: false; error: string } | { ok: true; score: number }> {
  const league = await leagueForToken(token)
  if (!league) return { ok: false, error: 'This link is not the live one.' }
  if (!(ROSTER as readonly string[]).includes(name)) return { ok: false, error: 'That name is not on the roster.' }

  const checked = validatePicks(picks)
  if (!checked.ok) return { ok: false, error: checked.error }

  const score = scorePicks(checked.picks)
  const admin = createAdminClient()
  const { error } = await admin.from('exam_runs').insert({
    league_id: league.id,
    edition: EDITION,
    manager_name: name,
    picks: checked.picks,
    score,
  })
  // 23505 is the unique violation: somebody already played under this name.
  // Not an error worth a red screen, so it reads back as the plain fact.
  if (error) {
    if (error.code === '23505') return { ok: false, error: `${name} has already played.` }
    return { ok: false, error: error.message }
  }
  return { ok: true, score }
}
