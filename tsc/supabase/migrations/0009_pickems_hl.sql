-- ============================================================
-- PICK'EMS — HIGH / LOW SCORER PICKS
-- ============================================================
-- Each week, beyond picking matchup winners, a picker also calls the
-- highest-scoring and lowest-scoring team of the week. Stored separately
-- from pickems_picks (which is one row per matchup); this is one row per
-- picker per week.

create table pickems_hl_picks (
  id                  uuid primary key default uuid_generate_v4(),
  league_id           uuid not null references leagues(id) on delete cascade,
  season_id           uuid not null references seasons(id) on delete cascade,
  week                int  not null,
  profile_id          uuid not null references manager_profiles(id) on delete cascade,
  highest_manager_id  uuid not null references managers(id) on delete cascade,
  lowest_manager_id   uuid not null references managers(id) on delete cascade,
  created_at          timestamptz not null default now(),
  unique (league_id, season_id, week, profile_id)
);

create index pickems_hl_picks_week_idx on pickems_hl_picks(league_id, season_id, week);

alter table pickems_hl_picks enable row level security;

create policy "pickems hl read"  on pickems_hl_picks for select using (has_league_access(league_id));
create policy "pickems hl write" on pickems_hl_picks for all    using (has_league_write(league_id));

notify pgrst, 'reload schema';
