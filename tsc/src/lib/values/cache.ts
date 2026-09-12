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
