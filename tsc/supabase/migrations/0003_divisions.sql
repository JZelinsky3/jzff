-- Add division/conference support to leagues + per-season division assignment.
-- A league may have 0-4 divisions (some leagues call them "conferences").
-- Division names are stored as a text array indexed 0..N-1.
-- Each manager_season records which division the manager was in that year.

create type division_term as enum ('conference', 'division');

alter table leagues
  add column division_count int  not null default 0
    check (division_count >= 0 and division_count <= 4),
  add column division_term  division_term not null default 'division',
  add column division_names text[] not null default '{}';

alter table manager_seasons
  add column division_index int;  -- 0-based; null when league has no divisions
