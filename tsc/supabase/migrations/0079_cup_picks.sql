-- 0079_cup_picks.sql
-- The Cup's bracket challenge: who each league member picks to win each Cup
-- game, plus one champion pick made before round one locks.
--
-- Identity is the pick'ems honor system (0008): the picker chooses their
-- name from the league's manager_profiles, no login. Picks can be changed
-- until the round's Thursday kickoff lock, so one row per (cup, picker,
-- round, slot) and the API upserts it.
--
-- `round` is the bracket round, 0-based; -1 is the champion pick (slot 0).
-- Server-only: the page and the pick route use the service role.

create table if not exists cup_picks (
  id                 uuid primary key default gen_random_uuid(),
  cup_id             uuid not null references league_cups (id) on delete cascade,
  profile_id         uuid not null references manager_profiles (id) on delete cascade,
  round              int  not null check (round >= -1 and round < 8),
  slot               int  not null check (slot >= 0),
  picked_manager_id  uuid not null references managers (id) on delete cascade,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (cup_id, profile_id, round, slot)
);

create index if not exists cup_picks_cup_idx on cup_picks (cup_id);

alter table cup_picks enable row level security;
