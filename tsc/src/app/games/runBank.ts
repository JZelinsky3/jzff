// Posting a finished run, and holding onto it when there's nobody to post it as.
//
// Playing never asks for an account. So a signed-out run goes into the BANK
// in localStorage, the recap says it's waiting, and the whole bank is claimed
// the moment that person signs in. A banked run is verified exactly like a
// live one — the server re-deals its seed and replays the choices either way
// — so nothing is trusted more for having arrived sooner.
//
// The bank holds CHOICES, never scores. There is nothing in localStorage
// worth editing: a tampered bank just fails to replay.

export type PendingRun = {
  game: string
  mode: string | null
  pool: string
  seed: string
  picks: unknown
  /** True when the wheel came off a shared `?seed=` link, which never posts. */
  shared?: boolean
  /** True when it was played on the week's shared board. */
  weekly?: boolean
  /** When it was played, so a stale bank can be shown as such. */
  at: number
}

export type PostOutcome = {
  ok: boolean
  needsAuth: boolean
  /** Ready to show as-is when a run didn't post. */
  error?: string
  runId?: string
  /** Where the run landed, so the recap can say it without a second request. */
  rank?: number
  total?: number
}

const KEY = 'tsc_game_bank_v1'

/** Runs kept while signed out. A long sitting counts in tens, not hundreds. */
const MAX_BANK = 25

/** Runs older than this are dropped unclaimed rather than posted much later. */
const BANK_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function readBank(): PendingRun[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const cutoff = Date.now() - BANK_TTL_MS
    return (parsed as PendingRun[]).filter((r) => r && typeof r.seed === 'string' && r.at > cutoff)
  } catch {
    return []
  }
}

function writeBank(runs: PendingRun[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(runs.slice(-MAX_BANK)))
  } catch {
    /* private browsing, a full quota — the run is lost, the game is not */
  }
}

export function bankRun(run: PendingRun) {
  if (typeof window === 'undefined') return
  writeBank([...readBank(), run])
}

export function clearBank() {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* nothing to do */
  }
}

/** Post one run. Never throws: the recap shows what came back. */
export async function postRun(run: Omit<PendingRun, 'at'>): Promise<PostOutcome> {
  try {
    const res = await fetch('/api/games/runs/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(run),
    })
    const body = await res.json().catch(() => null)
    if (res.status === 401) {
      return { ok: false, needsAuth: true, error: body?.error ?? 'Sign in to post a run.' }
    }
    const first = body?.results?.[0]
    if (first?.ok) {
      return {
        ok: true,
        needsAuth: false,
        runId: first.runId,
        rank: first.rank,
        total: first.total,
      }
    }
    return {
      ok: false,
      needsAuth: false,
      error: first?.error ?? body?.error ?? 'Could not reach the board.',
    }
  } catch {
    return { ok: false, needsAuth: false, error: 'Could not reach the board.' }
  }
}

/**
 * Send everything banked while signed out, then empty the bank.
 *
 * The bank is cleared whatever comes back, including partial failures. A run
 * that the server rejected (an already-posted seed, most often) will be
 * rejected identically on every retry, so keeping it means retrying forever
 * on every page load.
 */
export async function claimBank(): Promise<number> {
  const runs = readBank()
  if (runs.length === 0) return 0
  try {
    const res = await fetch('/api/games/runs/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runs }),
    })
    // Still signed out: keep the bank, try again next time.
    if (res.status === 401) return 0
    const body = await res.json().catch(() => null)
    clearBank()
    const results = (body?.results ?? []) as { ok?: boolean }[]
    return results.filter((r) => r?.ok).length
  } catch {
    return 0
  }
}
