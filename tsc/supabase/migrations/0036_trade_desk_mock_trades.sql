-- 0036_trade_desk_mock_trades.sql
-- The Rumor Mill: one row per (league, ISO week) holding that week's
-- autonomous mock-trade column as jsonb. Generated lazily by the first
-- GET /api/leagues/<id>/trade-desk/mocks of the week — no cron needed.
--
-- trade_hashes accumulates the player-id fingerprints of every published
-- mock so future weeks can exclude them (the Mill never reruns a deal).
-- Reads/writes go through the admin client in the route handler only, so
-- no RLS policies are defined here (same posture as sunday_live_frames).

create table trade_desk_mock_trades (
  id           uuid primary key default uuid_generate_v4(),
  league_id    uuid not null references leagues(id) on delete cascade,
  week_key     text not null,            -- e.g. '2026-W24' (ISO week)
  payload      jsonb not null,           -- { weekKey, generatedAt, trades: MockTrade[] }
  trade_hashes text[] not null default '{}',
  created_at   timestamptz not null default now(),
  unique (league_id, week_key)
);

create index trade_desk_mock_trades_league_idx
  on trade_desk_mock_trades(league_id, created_at desc);
