import { unstable_cache } from 'next/cache'

// Shared cache policy for the live market-value providers.
//
// Every provider under lib/values fetches at request time and memoizes the
// result with unstable_cache. They all used to hardcode 12h independently,
// which made "how stale can a trade grade be?" a question you answered by
// grepping seven files. One constant now.
//
// 6h is deliberate. In-season news moves these numbers fast: a starter has
// surgery on a Wednesday and KTC / FantasyCalc reprice him within hours. A
// 12h window meant a trade could be graded against a market that predated
// the injury by most of a day. 6h caps that, and these are all small JSON /
// CSV pulls behind a shared cache, so four fetches a day instead of two is
// not a cost worth optimizing.
//
// NOTE: this is the freshness floor for the CONSENSUS numbers only. The
// per-player metadata (age, injury designation, position rank) comes from
// the player_values table, refreshed by /api/cron/refresh-player-values.
export const MARKET_VALUE_TTL = 6 * 60 * 60

// ── Fresh mode ────────────────────────────────────────────────────────────
//
// A 6h cache is right for browsing. It is wrong for grading.
//
// Trades are usually made BECAUSE of news. Someone reads that a starter needs
// surgery and moves him that afternoon. If the grader prices that trade off a
// market snapshot taken before the news broke, it doesn't just miss context,
// it actively argues the wrong side: it calls the seller a fleecer for moving
// a player the buyer knew was hurt. That verdict is written once, in prose,
// and is never revised.
//
// So grading opts into `fresh`, which bypasses unstable_cache and pulls live.
//
// The catch, and the reason this file exists rather than a one-line flag:
// valuateLeague() is called ONCE PER TRADE inside gradeTrade. A run grading
// 25 trades plus 15 revisits would hit the KTC scrape 40 times in a few
// minutes, which is slow enough to blow the function timeout and rude enough
// to get the scrape blocked. The memo below collapses that back to exactly
// one live pull per provider per run.
//
// Module scope is the correct scope. A grading run is one serverless
// invocation, so the memo lives and dies with the run; the TTL is only a
// backstop for a warm container picking up a second run later. In-flight
// promises are stored (not just results) so concurrent callers share a pull
// rather than racing to start their own.
const FRESH_MEMO_TTL_MS = 15 * 60 * 1000

const freshMemo = new Map<string, { at: number; promise: Promise<unknown> }>()

export function freshFetch<T>(keyParts: string[], fetcher: () => Promise<T>): Promise<T> {
  const key = keyParts.join('\u0000')
  const hit = freshMemo.get(key)
  const now = Date.now()
  if (hit && now - hit.at < FRESH_MEMO_TTL_MS) {
    return hit.promise as Promise<T>
  }
  const promise = fetcher()
  freshMemo.set(key, { at: now, promise })
  // A failed pull must not be memoized: the next caller should get a real
  // retry, not a cached rejection. Providers that throw are dropped from the
  // consensus by tryAttempt, which is the intended degradation (fewer
  // sources beats wrong sources), but a transient blip shouldn't poison the
  // rest of the run.
  promise.catch(() => {
    if (freshMemo.get(key)?.promise === promise) freshMemo.delete(key)
  })
  // Opportunistic sweep so a long-lived warm container doesn't accumulate
  // entries for league-shaped keys it will never see again.
  if (freshMemo.size > 64) {
    for (const [k, v] of freshMemo) {
      if (now - v.at >= FRESH_MEMO_TTL_MS) freshMemo.delete(k)
    }
  }
  return promise
}

// The one wrapper every market provider fetches through. `keyParts` are the
// provider's existing unstable_cache key; `fresh` comes off the valuation
// context. Routing both modes through a single function is what keeps the
// two paths from drifting: there is no way to add a provider that honours
// the cache but silently ignores fresh mode.
export function marketCache<T>(
  keyParts: string[],
  fetcher: () => Promise<T>,
  fresh?: boolean,
): Promise<T> {
  const cached = () => unstable_cache(fetcher, keyParts, { revalidate: MARKET_VALUE_TTL })()
  if (!fresh) return cached()
  // Fresh, but never at the cost of a stable blend.
  //
  // A failed live pull used to mean the provider was simply dropped from the
  // consensus for that run, because tryAttempt treats a throw as "no values".
  // Browsing tolerates that. Grading does not: fewer sources is a DIFFERENT
  // blend, so the anchor moves, and a player who fails to resolve at all also
  // flags his side low-confidence, which widens how far the model may stray.
  // The symptom was a trade re-grading to B, then B-, then C+ with nothing
  // about it having changed, on a feature whose whole promise is that the
  // same trade grades the same way twice.
  //
  // So a live pull that fails falls back to this provider's last cached
  // value instead of vanishing. Fresh when it can be, last-known-good when
  // it cannot, and the set of contributing sources stays constant either way.
  return freshFetch(keyParts, fetcher).catch(() => cached())
}
