'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteAdmin } from '@/lib/siteAdmin'
import {
  PAMS_ROSTER, SEASON, buildBoard, validatePicks, validateVote,
  type BallotRecord, type BoardBasis, type LockedBoard, type Picks, type VoteCard, type VoteRecord,
} from '@/lib/winBallot'

/**
 * Resolve a share token back to its league. The token is the whole address
 * of the public ballot, so this is the lookup the page boots from; an
 * unknown token simply has no league and gets the "wrong door" screen.
 */
export async function leagueForToken(token: string): Promise<{ id: string; slug: string; name: string } | null> {
  if (!token || token.length < 8) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('leagues')
    .select('id, slug, name, settings')
    .eq('settings->>ballot_token', token)
    .maybeSingle()
  if (!data) return null
  return { id: data.id as string, slug: data.slug as string, name: data.name as string }
}

// The ballot is open to whoever holds the link, so the share token IS the
// authorization. It lives on the league row (settings.ballot_token) and is
// minted from the room, which is itself owner-gated.
export async function readBallotToken(leagueId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('leagues')
    .select('settings')
    .eq('id', leagueId)
    .maybeSingle()
  const settings = (data?.settings ?? {}) as { ballot_token?: unknown }
  return typeof settings.ballot_token === 'string' && settings.ballot_token.length > 0
    ? settings.ballot_token
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
 * Mint (or re-read) the share token. Called from the room so the owner has a
 * link to hand out. Rotating it invalidates the old link, which is the way
 * to shut voting down or recover from a link that leaked.
 */
export async function ensureBallotToken(leagueId: string, rotate = false): Promise<{ ok: false; error: string } | { ok: true; token: string }> {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access

  const existing = await readBallotToken(leagueId)
  if (existing && !rotate) return { ok: true, token: existing }

  // 18 bytes of base36 is plenty for a link that only twelve people see and
  // that grants nothing but the ability to file one ballot.
  const token = Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 20)

  const admin = createAdminClient()
  const { data: row } = await admin.from('leagues').select('settings').eq('id', leagueId).maybeSingle()
  const settings = { ...((row?.settings ?? {}) as Record<string, unknown>), ballot_token: token }
  const { error } = await admin.from('leagues').update({ settings }).eq('id', leagueId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/league/${access.slug}/ballot/room`)
  return { ok: true, token }
}

/**
 * File one ballot. The token proves the sender was given the link; the
 * unique index on (league_id, season, manager_name) is what actually stops
 * a name being used twice, so a race between two phones ends with one
 * insert and one honest error rather than a silent overwrite.
 */
export async function submitBallot(input: {
  leagueId: string
  token: string
  managerName: string
  picks: Picks
}): Promise<{ ok: false; error: string } | { ok: true }> {
  const token = await readBallotToken(input.leagueId)
  if (!token || token !== input.token) {
    return { ok: false, error: 'This ballot link is no longer good. Ask Joey for the current one.' }
  }

  if (!PAMS_ROSTER.some((m) => m.name === input.managerName)) {
    return { ok: false, error: 'Pick your name from the list first.' }
  }

  const checked = validatePicks(PAMS_ROSTER, input.picks)
  if (!checked.ok) return { ok: false, error: checked.error }

  const admin = createAdminClient()
  const { error } = await admin.from('win_ballots').insert({
    league_id: input.leagueId,
    season: SEASON,
    manager_name: input.managerName,
    picks: checked.picks,
    total: checked.total,
  })

  if (error) {
    // 23505 is the unique violation: that name already filed.
    if (error.code === '23505') {
      return { ok: false, error: `${input.managerName} has already sent a ballot. If that wasn't you, tell Joey.` }
    }
    return { ok: false, error: error.message }
  }

  return { ok: true }
}

/** Names already in, so the ballot can grey them out before anybody types. */
export async function submittedNames(leagueId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('win_ballots')
    .select('manager_name')
    .eq('league_id', leagueId)
    .eq('season', SEASON)
  return (data ?? []).map((r) => r.manager_name as string)
}

/**
 * File ballots from the code lines the old artifact produced, so anybody who
 * already texted Joey a `PAMS26.NAME.7-8-...T84` doesn't have to fill the
 * thing in twice. The artifact encoded by roster position in the same
 * alphabetical order PAMS_ROSTER uses, so the positions line up; the trailing
 * total is a checksum, and a line whose numbers don't add up to it was
 * mangled in transit and is refused rather than guessed at.
 */
export async function importBallotLines(
  leagueId: string,
  text: string,
): Promise<{ ok: false; error: string } | { ok: true; filed: string[]; skipped: string[] }> {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access

  const filed: string[] = []
  const skipped: string[] = []
  const admin = createAdminClient()

  for (const raw of text.split('\n').map((s) => s.trim()).filter(Boolean)) {
    const parts = raw.split('.')
    if (parts.length !== 4 || parts[0].toUpperCase() !== 'PAMS26') {
      skipped.push(`not a ballot line: ${raw.slice(0, 22)}`)
      continue
    }
    const manager = PAMS_ROSTER.find((m) => m.name.toUpperCase() === parts[1].toUpperCase())
    if (!manager) { skipped.push(`unknown name "${parts[1]}"`); continue }

    const nums = parts[2].split('-').map(Number)
    if (nums.length !== PAMS_ROSTER.length || nums.some((n) => !Number.isInteger(n) || n < 0 || n > 14)) {
      skipped.push(`${manager.name}: the twelve numbers are damaged`)
      continue
    }
    const sum = nums.reduce((a, b) => a + b, 0)
    if (sum !== Number(parts[3].replace(/^T/i, ''))) {
      skipped.push(`${manager.name}: totals don't match, line was altered in transit`)
      continue
    }

    const picks: Picks = {}
    PAMS_ROSTER.forEach((m, i) => { picks[m.name] = nums[i] })

    const { error } = await admin.from('win_ballots').insert({
      league_id: leagueId,
      season: SEASON,
      manager_name: manager.name,
      picks,
      total: sum,
    })
    if (error) {
      skipped.push(error.code === '23505' ? `${manager.name} already has a ballot in` : `${manager.name}: ${error.message}`)
      continue
    }
    filed.push(manager.name)
  }

  revalidatePath(`/league/${access.slug}/ballot/room`)
  return { ok: true, filed, skipped }
}

/** Delete one ballot, so a mis-filed name can be reopened from the room. */
export async function clearBallot(leagueId: string, managerName: string): Promise<{ ok: false; error: string } | { ok: true }> {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access
  const admin = createAdminClient()
  const { error } = await admin
    .from('win_ballots')
    .delete()
    .eq('league_id', leagueId)
    .eq('season', SEASON)
    .eq('manager_name', managerName)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/league/${access.slug}/ballot/room`)
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────
// Phase two: the board, and the vote taken against it.
// ─────────────────────────────────────────────────────────────────────────

/** Read every filed ballot for the season, ballot order. */
export async function readBallots(leagueId: string): Promise<BallotRecord[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('win_ballots')
    .select('manager_name, picks')
    .eq('league_id', leagueId)
    .eq('season', SEASON)
    .order('created_at', { ascending: true })
  return (data ?? []).map((r) => ({ name: r.manager_name as string, picks: r.picks as Picks }))
}

/** The locked board, or null while the league is still filing ballots. */
export async function readBoard(leagueId: string): Promise<LockedBoard | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('win_board')
    .select('basis, lines, spread, ballot_count, revealed, locked_at')
    .eq('league_id', leagueId)
    .eq('season', SEASON)
    .maybeSingle()
  if (!data) return null
  return {
    basis: data.basis as BoardBasis,
    lines: data.lines as Record<string, number>,
    // Absent on a board locked before migration 0055, which is a board with
    // no range to show rather than a broken one.
    spread: (data.spread ?? {}) as LockedBoard['spread'],
    ballotCount: data.ballot_count as number,
    lockedAt: data.locked_at as string,
    revealed: data.revealed as boolean,
  }
}

/**
 * Freeze the ballots into twelve lines and open the vote. This is the moment
 * phase one ends: the numbers are copied out of the ballots, so a ballot
 * filed afterwards changes nothing anybody has already voted against.
 */
export async function lockBoard(
  leagueId: string,
  basis: BoardBasis,
): Promise<{ ok: false; error: string } | { ok: true }> {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access

  const ballots = await readBallots(leagueId)
  if (ballots.length < 2) return { ok: false, error: 'Not enough ballots to set a line yet.' }

  const board = buildBoard(PAMS_ROSTER, ballots, basis)
  const short = board.filter((l) => l.count === 0).map((l) => l.name)
  if (short.length) {
    return { ok: false, error: `No ballot has a number for ${short.join(', ')}, so there's no line to set.` }
  }

  const lines: Record<string, number> = {}
  const spread: LockedBoard['spread'] = {}
  for (const l of board) {
    lines[l.name] = l.line
    spread[l.name] = { high: l.high, low: l.low }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('win_board').upsert({
    league_id: leagueId,
    season: SEASON,
    basis,
    lines,
    spread,
    ballot_count: ballots.length,
  }, { onConflict: 'league_id,season' })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/league/${access.slug}/ballot/room`)
  return { ok: true }
}

/**
 * Tear the board down and put the league back on ballots. Votes already cast
 * are deleted with it, since they were taken against numbers that no longer
 * stand, and a vote silently re-pointed at a new line would be a lie.
 */
export async function unlockBoard(leagueId: string): Promise<{ ok: false; error: string } | { ok: true; votesDropped: number }> {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access
  const admin = createAdminClient()

  const { data: votes } = await admin
    .from('win_votes')
    .select('id')
    .eq('league_id', leagueId)
    .eq('season', SEASON)

  await admin.from('win_votes').delete().eq('league_id', leagueId).eq('season', SEASON)
  const { error } = await admin.from('win_board').delete().eq('league_id', leagueId).eq('season', SEASON)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/league/${access.slug}/ballot/room`)
  return { ok: true, votesDropped: votes?.length ?? 0 }
}

/** Open the room's picks to everybody who voted, or seal them back up. */
export async function setRevealed(leagueId: string, revealed: boolean): Promise<{ ok: false; error: string } | { ok: true }> {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access
  const admin = createAdminClient()
  const { error } = await admin
    .from('win_board')
    .update({ revealed })
    .eq('league_id', leagueId)
    .eq('season', SEASON)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/league/${access.slug}/ballot/room`)
  return { ok: true }
}

/** Read every card cast against the board. */
export async function readVotes(leagueId: string): Promise<VoteRecord[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('win_votes')
    .select('manager_name, lines, props, rivalry')
    .eq('league_id', leagueId)
    .eq('season', SEASON)
    .order('created_at', { ascending: true })
  return (data ?? []).map((r) => ({
    name: r.manager_name as string,
    card: {
      lines: r.lines as VoteCard['lines'],
      props: (r.props ?? {}) as VoteCard['props'],
      rivalry: (r.rivalry ?? {}) as VoteCard['rivalry'],
    },
  }))
}

/** Names that have already voted, so the card can grey them out. */
export async function votedNames(leagueId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('win_votes')
    .select('manager_name')
    .eq('league_id', leagueId)
    .eq('season', SEASON)
  return (data ?? []).map((r) => r.manager_name as string)
}

/**
 * Cast one card. As with the ballot, the token is the authorization and the
 * unique index is the integrity: a second card under a name already used is
 * refused by the database, not by anything on the phone.
 */
export async function submitVote(input: {
  leagueId: string
  token: string
  managerName: string
  card: VoteCard
}): Promise<{ ok: false; error: string } | { ok: true }> {
  const token = await readBallotToken(input.leagueId)
  if (!token || token !== input.token) {
    return { ok: false, error: 'This link is no longer good. Ask Joey for the current one.' }
  }

  const board = await readBoard(input.leagueId)
  if (!board) return { ok: false, error: 'The lines are not set yet.' }

  if (!PAMS_ROSTER.some((m) => m.name === input.managerName)) {
    return { ok: false, error: 'Pick your name from the list first.' }
  }

  const checked = validateVote(PAMS_ROSTER, input.managerName, input.card)
  if (!checked.ok) return { ok: false, error: checked.error }

  const admin = createAdminClient()
  const { error } = await admin.from('win_votes').insert({
    league_id: input.leagueId,
    season: SEASON,
    manager_name: input.managerName,
    lines: checked.card.lines,
    props: checked.card.props,
    rivalry: checked.card.rivalry,
  })

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: `${input.managerName} has already voted. If that wasn't you, tell Joey.` }
    }
    return { ok: false, error: error.message }
  }

  return { ok: true }
}

/** Delete one card, so a mis-filed name can be reopened from the room. */
export async function clearVote(leagueId: string, managerName: string): Promise<{ ok: false; error: string } | { ok: true }> {
  const access = await assertWriteAccess(leagueId)
  if (!access.ok) return access
  const admin = createAdminClient()
  const { error } = await admin
    .from('win_votes')
    .delete()
    .eq('league_id', leagueId)
    .eq('season', SEASON)
    .eq('manager_name', managerName)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/league/${access.slug}/ballot/room`)
  return { ok: true }
}
