-- 0037_trade_desk_mock_votes.sql
-- Sign it / Shred it tallies for Rumor Mill mock trades. One row per
-- (league, week, trade hash) holding the two counters. Votes are
-- anonymous — the per-device "what did I vote" memory lives in
-- localStorage on the client; the server only keeps totals.
--
-- Reads/writes go through the admin client in route handlers only, so
-- no RLS policies are defined (same posture as trade_desk_mock_trades).

create table trade_desk_mock_votes (
  league_id   uuid not null references leagues(id) on delete cascade,
  week_key    text not null,            -- e.g. '2026-W24' (ISO week)
  trade_hash  text not null,            -- MockTrade.hash player-id fingerprint
  sign_count  int  not null default 0,
  shred_count int  not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (league_id, week_key, trade_hash)
);

-- Atomic counter bump (insert-or-update). Deltas may be negative when a
-- device un-votes or switches sides; counters floor at zero.
create or replace function increment_mock_vote(
  p_league_id   uuid,
  p_week_key    text,
  p_trade_hash  text,
  p_sign_delta  int,
  p_shred_delta int
) returns void
language sql
as $$
  insert into trade_desk_mock_votes as v
    (league_id, week_key, trade_hash, sign_count, shred_count)
  values
    (p_league_id, p_week_key, p_trade_hash,
     greatest(p_sign_delta, 0), greatest(p_shred_delta, 0))
  on conflict (league_id, week_key, trade_hash) do update
    set sign_count  = greatest(0, v.sign_count  + p_sign_delta),
        shred_count = greatest(0, v.shred_count + p_shred_delta),
        updated_at  = now();
$$;
