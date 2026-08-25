-- ============================================================
-- SLEEPER PLAYERS CACHE
--
-- Sleeper's docs are explicit that /players/nfl is "intended only to be used
-- once per day at most" (the payload is ~16MB). We were calling it far more
-- than that: the lean map revalidated hourly, and the full dictionary lived
-- in per-instance module memory, so every serverless cold start refetched.
--
-- This table is the single source of truth instead. One cron writes it once
-- a day; every request reads from here. Sleeper sees exactly one call.
--
-- Single row, pinned to id = 'nfl'. The payload is the dictionary projected
-- down to the fields SleeperPlayer actually declares, which drops roughly
-- two thirds of the wire bytes before they ever reach Postgres.
--
-- No RLS policies: this is server-only (admin client). RLS is enabled so the
-- anon key cannot read it directly, matching the posture of the other
-- server-owned tables.
-- ============================================================

create table sleeper_players_cache (
  id          text primary key default 'nfl',
  fetched_at  timestamptz not null default now(),
  player_count int not null,
  payload     jsonb not null,
  constraint sleeper_players_cache_singleton check (id = 'nfl')
);

alter table sleeper_players_cache enable row level security;
