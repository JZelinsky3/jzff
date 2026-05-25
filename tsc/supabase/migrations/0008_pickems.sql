-- ============================================================
-- PICK'EMS
-- ============================================================
-- Per-week, per-profile picks against the current in-progress season.
--
-- Identity model (no login): the picker chooses their profile from a dropdown
-- of `manager_profiles` curated during Site Setup. Picks store against
-- `profile_id` so two managers named "Joe" (already disambiguated to
-- "Joe S." / "Joe T." by the commish) record cleanly.
--
-- Each picker submits at most one pick per matchup; the unique constraint
-- enforces this. "One submission per week" is enforced at the app layer by
-- checking whether any picks exist for (profile_id, season_id, week) before
-- showing the form.
--
-- Reads/writes from the public pickems page go through the service-role
-- admin client (same as the rest of the public almanac), so RLS here just
-- mirrors the rest of the schema for any future authenticated-client use.

create table pickems_picks (
  id                 uuid primary key default uuid_generate_v4(),
  league_id          uuid not null references leagues(id) on delete cascade,
  season_id          uuid not null references seasons(id) on delete cascade,
  week               int  not null,
  profile_id         uuid not null references manager_profiles(id) on delete cascade,
  matchup_id         uuid not null references matchups(id) on delete cascade,
  picked_manager_id  uuid not null references managers(id) on delete cascade,
  is_correct         boolean,  -- null until matchup is scored; true=picked winner, false=picked loser or tie
  created_at         timestamptz not null default now(),
  unique (matchup_id, profile_id)
);

create index pickems_picks_league_week_idx on pickems_picks(league_id, season_id, week);
create index pickems_picks_profile_idx     on pickems_picks(profile_id);

alter table pickems_picks enable row level security;

create policy "pickems read"  on pickems_picks for select using (has_league_access(league_id));
create policy "pickems write" on pickems_picks for all    using (has_league_write(league_id));

-- Which season is currently being picked against. Only one season per league
-- should be live at a time; enforced in the admin UI.
alter table seasons
  add column if not exists is_live boolean not null default false;

create index if not exists seasons_live_idx on seasons(league_id) where is_live;

notify pgrst, 'reload schema';
