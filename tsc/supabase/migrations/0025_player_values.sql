-- 0025_player_values.sql
-- Global player-value cache. Refreshed weekly by /api/cron/refresh-player-values
-- and read at trade-grade time so the LLM has hard numbers instead of vibes.
--
-- Source = sleeper for the first cut: Sleeper exposes search_rank (a popularity
-- proxy that correlates well with consensus rest-of-season value), age,
-- injury_status, and team. Position rank is derived (sort by search_rank
-- within each fantasy position).
--
-- Future sources (KTC, DynastyProcess) can land in the same table with a
-- different `source` value; the grader can blend or prefer one.

create table player_values (
  -- Composite key: same player can exist across multiple sources.
  player_id        text not null,
  source           text not null,                    -- 'sleeper', 'ktc', 'dp', ...
  -- Raw rank from the source. Lower = more valuable. NULL when unknown.
  overall_rank     int,
  -- Within their fantasy position (RB1, RB2, ...). Derived for sleeper;
  -- native for sources that publish position ranks directly.
  position_rank    int,
  -- Player demographics — useful for dynasty calibration (age curves).
  position         text,
  team             text,
  age              int,
  years_exp        int,
  injury_status    text,
  -- Display name, denormalized so the grader doesn't need to re-join
  -- against the (very large) Sleeper player payload.
  full_name        text,
  -- When this row was last refreshed by a cron job or manual button.
  updated_at       timestamptz not null default now(),
  primary key (player_id, source)
);

create index player_values_source_rank_idx on player_values(source, overall_rank);
create index player_values_position_idx    on player_values(source, position, position_rank);
create index player_values_updated_idx     on player_values(updated_at desc);

-- This is reference data, not league-scoped. Reads are public; writes happen
-- via the admin client from the cron route.
alter table player_values enable row level security;

create policy "player_values public read"
  on player_values for select
  using (true);

notify pgrst, 'reload schema';
