-- Site Setup: canonical manager identity + commissioner-controlled visibility.
--
-- Why: auto-detecting "current" from latest-season participation misclassifies edge cases
-- (someone took a year off, multi-source mid-sync), and the same real person across two
-- platforms (Sleeper user_id + NFL user_id) appears as two distinct managers. Fuzzy
-- name matching is unsafe for career totals. So the commish merges manually.
--
-- Model:
--   manager_profiles = one row per real person, league-scoped
--   managers.profile_id = which person this platform identity belongs to
--   leagues.published_at = null until setup is complete; the public route gates on this

create table manager_profiles (
  id                  uuid primary key default uuid_generate_v4(),
  league_id           uuid not null references leagues(id) on delete cascade,
  canonical_name      text not null,
  is_alumni_override  boolean,                 -- null = auto-detect, true/false = explicit
  is_hidden           boolean not null default false,
  created_at          timestamptz not null default now()
);

create index manager_profiles_league_idx on manager_profiles(league_id);

alter table manager_profiles enable row level security;

create policy "profiles read"  on manager_profiles for select using (has_league_access(league_id));
create policy "profiles write" on manager_profiles for all    using (has_league_write(league_id));

-- Link managers to profiles. One profile_id per real person; many managers (one per
-- platform user_id) may point at the same profile after merging.
alter table managers
  add column profile_id uuid references manager_profiles(id) on delete set null;

create index managers_profile_idx on managers(profile_id);

-- Backfill: every existing manager gets its own profile (1:1). Commish can merge later.
do $$
declare
  m record;
  pid uuid;
begin
  for m in select id, league_id, display_name from managers where profile_id is null loop
    insert into manager_profiles (league_id, canonical_name)
    values (m.league_id, coalesce(m.display_name, 'Unknown'))
    returning id into pid;
    update managers set profile_id = pid where id = m.id;
  end loop;
end$$;

-- Auto-create a profile for every newly inserted manager that doesn't already
-- have one. The commissioner merges multiple managers into one profile in the
-- Site Setup UI after sync; until then each platform identity gets a 1:1 profile.
create or replace function ensure_manager_profile()
returns trigger as $$
declare
  pid uuid;
begin
  if new.profile_id is null then
    insert into manager_profiles (league_id, canonical_name)
    values (new.league_id, coalesce(new.display_name, 'Unknown'))
    returning id into pid;
    new.profile_id := pid;
  end if;
  return new;
end$$ language plpgsql;

drop trigger if exists ensure_manager_profile_trg on managers;
create trigger ensure_manager_profile_trg
  before insert on managers
  for each row execute function ensure_manager_profile();

-- Gate: public almanac is only served when this is set.
alter table leagues
  add column published_at timestamptz;

-- For existing test leagues, mark them published so we don't break anything in dev.
-- Real new leagues will have it null and be forced through setup.
update leagues set published_at = now() where last_synced_at is not null;

notify pgrst, 'reload schema';
