-- ============================================================
-- WEEKLY LINEUPS
-- Per-(season, week, manager, player) row capturing slot, points,
-- and a denormalized player name/position snapshot so the Best
-- Coach Tracker (and future per-week roster features) can render
-- without a players join.
--
-- slot values are platform-agnostic and uppercase. A player is a
-- starter when slot is not one of ('BN','IR','TAXI'). Storing the
-- bool explicitly keeps queries trivial and lets each ingester
-- decide based on its own slot vocabulary.
-- ============================================================
create table weekly_lineups (
  id                  uuid primary key default uuid_generate_v4(),
  season_id           uuid not null references seasons(id) on delete cascade,
  week                int  not null,
  manager_id          uuid not null references managers(id) on delete cascade,
  player_external_id  text not null,
  player_name         text,
  position            text,
  nfl_team            text,
  slot                text not null,
  is_starter          boolean not null,
  points              numeric(10,2),
  proj_points         numeric(10,2),
  unique (season_id, week, manager_id, player_external_id)
);

create index weekly_lineups_season_week_idx     on weekly_lineups(season_id, week);
create index weekly_lineups_manager_season_idx  on weekly_lineups(manager_id, season_id);
