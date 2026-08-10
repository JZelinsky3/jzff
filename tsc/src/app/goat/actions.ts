'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteAdmin } from '@/lib/siteAdmin'
import {
  EDITION, ROUNDS, ROUND_ORDER, buildBracket, gameId, gamesInRound, settleRound, validateBallot,
  type Ballot, type Results, type RoundId, type VoteRecord,
} from '@/lib/greatestTeam'

export type BracketState = {
  results: Results
  openRound: RoundId | null
  revealed: boolean
}

const EMPTY: BracketState = { results: {}, openRound: null, revealed: false }

/**
 * Resolve a share token back to its league. The token is the whole address of
 * the public bracket, so this is the lookup the page boots from; an unknown
 * token has no league and gets the "wrong door" screen.
 *
 * Deliberately a different token from the win-total ballot's: the two events
 * run in the same offseason and rotating one must not silently kill the other.
 */
export async function leagueForToken(token: string): Promise<{ id: string; slug: string; name: string } | null> {
  if (!token || token.length < 8) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('leagues')
    .select('id, slug, name')
    .eq('settings->>goat_token', token)
    .maybeSingle()
  if (!data) return null
  return { id: data.id as string, slug: data.slug as string, name: data.name as string }
}

export async function readGoatToken(leagueId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('leagues').select('settings').eq('id', leagueId).maybeSingle()
  const settings = (data?.settings ?? {}) as { goat_token?: unknown }
  return typeof settings.goat_token === 'string' && settings.goat_token.length > 0 ? settings.goat_token : null
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

function bust(slug: string) {
  revalidatePath(`/league/${slug}/goat/room`)
}

/** Mint (or re-read) the share link. Rotating it kills the old one. */
export async function ensureGoatToken(
  leagueId: string,
  rotate = false,
): Promise<{ ok: false; error: string } | { ok: true; token: string }> {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access

  const existing = await readGoatToken(leagueId)
  if (existing && !rotate) return { ok: true, token: existing }

  const token = Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 20)

  const admin = createAdminClient()
  const { data: row } = await admin.from('leagues').select('settings').eq('id', leagueId).maybeSingle()
  const settings = { ...((row?.settings ?? {}) as Record<string, unknown>), goat_token: token }
  const { error } = await admin.from('leagues').update({ settings }).eq('id', leagueId)
  if (error) return { ok: false, error: error.message }

  bust(access.slug)
  return { ok: true, token }
}

/** The bracket as it stands. A league that has never opened one reads empty. */
export async function readBracket(leagueId: string): Promise<BracketState> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('goat_bracket')
    .select('results, open_round, revealed')
    .eq('league_id', leagueId)
    .eq('edition', EDITION)
    .maybeSingle()
  if (!data) return EMPTY
  return {
    results: (data.results ?? {}) as Results,
    openRound: (data.open_round ?? null) as RoundId | null,
    revealed: !!data.revealed,
  }
}

/** Every card cast, oldest first. */
export async function readVotes(leagueId: string, round?: RoundId): Promise<VoteRecord[]> {
  const admin = createAdminClient()
  let q = admin
    .from('goat_votes')
    .select('manager_name, round, picks')
    .eq('league_id', leagueId)
    .eq('edition', EDITION)
  if (round) q = q.eq('round', round)
  const { data } = await q.order('created_at', { ascending: true })
  return (data ?? []).map((r) => ({
    name: r.manager_name as string,
    round: r.round as RoundId,
    picks: (r.picks ?? {}) as Ballot,
  }))
}

/** Names already in for a round, so the card can grey them out. */
export async function votedNames(leagueId: string, round: RoundId): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('goat_votes')
    .select('manager_name')
    .eq('league_id', leagueId)
    .eq('edition', EDITION)
    .eq('round', round)
  return (data ?? []).map((r) => r.manager_name as string)
}

/**
 * Cast one card. The token is the authorization and the unique index is the
 * integrity, exactly as on the win-total ballot. The round is taken from the
 * bracket rather than from the caller, so a card cannot be filed against a
 * round the room has not opened.
 */
export async function submitBallot(input: {
  leagueId: string
  token: string
  managerName: string
  picks: Ballot
}): Promise<{ ok: false; error: string } | { ok: true }> {
  const token = await readGoatToken(input.leagueId)
  if (!token || token !== input.token) {
    return { ok: false, error: 'This link is no longer good. Ask Joey for the current one.' }
  }

  const name = input.managerName?.trim()
  if (!name) return { ok: false, error: 'Put your name on it first.' }

  const state = await readBracket(input.leagueId)
  if (!state.openRound) return { ok: false, error: 'Voting is closed right now. Nothing to call yet.' }

  const bracket = buildBracket(state.results)
  const checked = validateBallot(bracket, state.openRound, input.picks)
  if (!checked.ok) return { ok: false, error: checked.error }

  const admin = createAdminClient()
  const { error } = await admin.from('goat_votes').insert({
    league_id: input.leagueId,
    edition: EDITION,
    round: state.openRound,
    manager_name: name,
    picks: checked.picks,
  })

  if (error) {
    // 23505 is the unique violation: that name already voted this round.
    if (error.code === '23505') {
      return { ok: false, error: `${name} has already voted in this round. If that wasn't you, tell Joey.` }
    }
    return { ok: false, error: error.message }
  }

  return { ok: true }
}

/**
 * One voter's own cards, every round they have filed. The receipt, and the
 * only way a card comes back out of the seal before the room settles.
 *
 * Deliberately takes a name and returns only that name: the token is a
 * league-wide address, so this cannot be the door to reading somebody else's
 * live picks. The page only ever asks for the name that submitted from this
 * device, and nothing in the UI offers to ask for another.
 */
export async function readMyCard(input: {
  leagueId: string
  token: string
  name: string
}): Promise<{ ok: false; error: string } | { ok: true; votes: VoteRecord[] }> {
  const token = await readGoatToken(input.leagueId)
  if (!token || token !== input.token) {
    return { ok: false, error: 'This link is no longer good. Ask Joey for the current one.' }
  }
  const name = input.name?.trim()
  if (!name) return { ok: false, error: 'No name on that.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('goat_votes')
    .select('manager_name, round, picks')
    .eq('league_id', input.leagueId)
    .eq('edition', EDITION)
    .eq('manager_name', name)
  if (error) return { ok: false, error: error.message }

  return {
    ok: true,
    votes: (data ?? []).map((r) => ({
      name: r.manager_name as string,
      round: r.round as RoundId,
      picks: (r.picks ?? {}) as Ballot,
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// The room
// ─────────────────────────────────────────────────────────────────────────

/**
 * Open a round for voting. Refuses a round whose games are not all ready,
 * which is what stops the semifinal opening before the quarters are settled.
 */
export async function openRound(
  leagueId: string,
  round: RoundId,
): Promise<{ ok: false; error: string } | { ok: true }> {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access

  const state = await readBracket(leagueId)
  const bracket = buildBracket(state.results)
  const games = gamesInRound(bracket, round)
  if (games.some((g) => !g.ready)) {
    return { ok: false, error: 'That round does not have both sides in every game yet. Settle the round before it first.' }
  }
  if (games.every((g) => g.winner !== null)) {
    return { ok: false, error: 'That round is already settled.' }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('goat_bracket').upsert({
    league_id: leagueId,
    edition: EDITION,
    results: state.results,
    open_round: round,
    revealed: state.revealed,
  }, { onConflict: 'league_id,edition' })
  if (error) return { ok: false, error: error.message }

  bust(access.slug)
  return { ok: true }
}

/** Stop taking votes without settling anything. */
export async function closeVoting(leagueId: string): Promise<{ ok: false; error: string } | { ok: true }> {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access
  const admin = createAdminClient()
  const { error } = await admin
    .from('goat_bracket')
    .update({ open_round: null })
    .eq('league_id', leagueId)
    .eq('edition', EDITION)
  if (error) return { ok: false, error: error.message }
  bust(access.slug)
  return { ok: true }
}

/**
 * Settle the open round from its votes and advance the bracket. A dead tie in
 * any game stops the whole round rather than being broken silently: the room
 * calls it with breakTie, because a coin nobody agreed to is not a result.
 */
export async function settleOpenRound(
  leagueId: string,
): Promise<{ ok: false; error: string; ties?: string[] } | { ok: true; round: RoundId; next: RoundId | null }> {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access

  const state = await readBracket(leagueId)
  if (!state.openRound) return { ok: false, error: 'No round is open.' }
  const round = state.openRound

  const bracket = buildBracket(state.results)
  const votes = await readVotes(leagueId, round)
  const settled = settleRound(bracket, round, votes)
  if (!settled.ok) return { ok: false, error: settled.error, ties: settled.ties }

  const results = { ...state.results, ...settled.results }
  const next = ROUND_ORDER[ROUND_ORDER.indexOf(round) + 1] ?? null

  const admin = createAdminClient()
  const { error } = await admin.from('goat_bracket').upsert({
    league_id: leagueId,
    edition: EDITION,
    results,
    // Settling never auto-opens the next round: the commissioner decides when
    // the league comes back, which is the whole point of a one-round-a-day
    // event.
    open_round: null,
    revealed: state.revealed,
  }, { onConflict: 'league_id,edition' })
  if (error) return { ok: false, error: error.message }

  bust(access.slug)
  return { ok: true, round, next }
}

/** Call a single game by hand: breaks a tie, or overrides a bad result. */
export async function breakTie(
  leagueId: string,
  game: string,
  seed: number,
): Promise<{ ok: false; error: string } | { ok: true }> {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access

  const state = await readBracket(leagueId)
  const bracket = buildBracket(state.results)
  const g = bracket.find((x) => x.id === game)
  if (!g) return { ok: false, error: 'No such game.' }
  if (!g.ready) return { ok: false, error: 'That game does not have both sides yet.' }
  if (seed !== g.home?.seed && seed !== g.away?.seed) {
    return { ok: false, error: 'That seed is not in that game.' }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('goat_bracket').upsert({
    league_id: leagueId,
    edition: EDITION,
    results: { ...state.results, [game]: seed },
    open_round: state.openRound,
    revealed: state.revealed,
  }, { onConflict: 'league_id,edition' })
  if (error) return { ok: false, error: error.message }

  bust(access.slug)
  return { ok: true }
}

/**
 * Reopen a round: drop its results and everything downstream, and delete the
 * cards cast in it. Downstream has to go too, since a quarterfinal built on a
 * round-of-16 result that no longer stands is a game between teams that never
 * qualified.
 */
export async function reopenRound(
  leagueId: string,
  round: RoundId,
): Promise<{ ok: false; error: string } | { ok: true; dropped: number }> {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access

  const state = await readBracket(leagueId)
  const from = ROUND_ORDER.indexOf(round)
  const doomed = ROUND_ORDER.slice(from)

  const results: Results = { ...state.results }
  for (const r of doomed) {
    const count = ROUNDS.find((x) => x.id === r)!.games
    for (let i = 0; i < count; i++) delete results[gameId(r, i)]
  }

  const admin = createAdminClient()
  const { data: gone } = await admin
    .from('goat_votes')
    .select('id')
    .eq('league_id', leagueId)
    .eq('edition', EDITION)
    .in('round', doomed as unknown as string[])
  await admin
    .from('goat_votes')
    .delete()
    .eq('league_id', leagueId)
    .eq('edition', EDITION)
    .in('round', doomed as unknown as string[])

  const { error } = await admin.from('goat_bracket').upsert({
    league_id: leagueId,
    edition: EDITION,
    results,
    open_round: null,
    revealed: state.revealed,
  }, { onConflict: 'league_id,edition' })
  if (error) return { ok: false, error: error.message }

  bust(access.slug)
  return { ok: true, dropped: gone?.length ?? 0 }
}

/** Show or hide the running vote counts on the public page. */
export async function setRevealed(
  leagueId: string,
  revealed: boolean,
): Promise<{ ok: false; error: string } | { ok: true }> {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access
  const admin = createAdminClient()
  const { error } = await admin.from('goat_bracket').upsert({
    league_id: leagueId,
    edition: EDITION,
    revealed,
  }, { onConflict: 'league_id,edition' })
  if (error) return { ok: false, error: error.message }
  bust(access.slug)
  return { ok: true }
}

/** Delete one card, so a mis-filed name can be reopened from the room. */
export async function clearVote(
  leagueId: string,
  round: RoundId,
  managerName: string,
): Promise<{ ok: false; error: string } | { ok: true }> {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access
  const admin = createAdminClient()
  const { error } = await admin
    .from('goat_votes')
    .delete()
    .eq('league_id', leagueId)
    .eq('edition', EDITION)
    .eq('round', round)
    .eq('manager_name', managerName)
  if (error) return { ok: false, error: error.message }
  bust(access.slug)
  return { ok: true }
}
