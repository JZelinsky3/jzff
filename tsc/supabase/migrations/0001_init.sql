-- Dynasty Codex initial schema
-- Multi-tenant fantasy football league archive.
-- Every non-profile table is scoped to a league; access is gated by league_members.

-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
create type platform_kind as enum ('sleeper', 'espn', 'yahoo', 'nfl');
create type member_role  as enum ('owner', 'editor', 'viewer');
create type draft_kind   as enum ('snake', 'auction', 'linear', 'unknown');

-- ============================================================
-- PROFILES (one row per auth user)
-- ============================================================
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- LEAGUES
-- ============================================================
create table leagues (
  id           uuid primary key default uuid_generate_v4(),
  owner_id     uuid not null references profiles(id) on delete cascade,
  platform     platform_kind not null,
  external_id  text not null,         -- the platform's league id (e.g. Sleeper league id)
  name         text not null,
  slug         text not null unique,  -- url-friendly identifier for /league/[slug]
  settings     jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (platform, external_id, owner_id)
);

create index leagues_owner_idx on leagues(owner_id);

-- ============================================================
-- LEAGUE MEMBERS (co-commish access)
-- ============================================================
create table league_members (
  league_id  uuid not null references leagues(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

-- ============================================================
-- ACCESS HELPER (used by every RLS policy below)
-- ============================================================
create or replace function has_league_access(_league_id uuid)
returns boolean
language sql
stable security definer set search_path = public
as $$
  select exists (
    select 1 from leagues l where l.id = _league_id and l.owner_id = auth.uid()
  ) or exists (
    select 1 from league_members m where m.league_id = _league_id and m.user_id = auth.uid()
  );
$$;

create or replace function has_league_write(_league_id uuid)
returns boolean
language sql
stable security definer set search_path = public
as $$
  select exists (
    select 1 from leagues l where l.id = _league_id and l.owner_id = auth.uid()
  ) or exists (
    select 1 from league_members m
    where m.league_id = _league_id and m.user_id = auth.uid() and m.role in ('owner','editor')
  );
$$;

-- ============================================================
-- SEASONS
-- ============================================================
create table seasons (
  id         uuid primary key default uuid_generate_v4(),
  league_id  uuid not null references leagues(id) on delete cascade,
  year       int not null,
  external_id text,                          -- platform's season/league id for that year
  champion_manager_id        uuid,           -- FK added below after managers table
  runner_up_manager_id       uuid,
  regular_season_winner_id   uuid,
  playoff_weeks  int[],
  settings   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (league_id, year)
);

create index seasons_league_idx on seasons(league_id);

-- ============================================================
-- MANAGERS (persistent across seasons)
-- ============================================================
create table managers (
  id           uuid primary key default uuid_generate_v4(),
  league_id    uuid not null references leagues(id) on delete cascade,
  display_name text not null,
  team_name    text,
  avatar_url   text,
  external_id  text,                         -- platform's user_id; stable across years
  created_at   timestamptz not null default now(),
  unique (league_id, external_id)
);

create index managers_league_idx on managers(league_id);

-- Add the deferred season FKs now that managers exists.
alter table seasons
  add constraint seasons_champion_fk     foreign key (champion_manager_id)      references managers(id) on delete set null,
  add constraint seasons_runner_up_fk    foreign key (runner_up_manager_id)     references managers(id) on delete set null,
  add constraint seasons_reg_winner_fk   foreign key (regular_season_winner_id) references managers(id) on delete set null;

-- ============================================================
-- MANAGER SEASONS (per-year snapshot: team name, record, ranking)
-- ============================================================
create table manager_seasons (
  id            uuid primary key default uuid_generate_v4(),
  season_id     uuid not null references seasons(id) on delete cascade,
  manager_id    uuid not null references managers(id) on delete cascade,
  team_name     text,
  avatar_url    text,
  wins          int not null default 0,
  losses        int not null default 0,
  ties          int not null default 0,
  points_for    numeric(10,2) not null default 0,
  points_against numeric(10,2) not null default 0,
  final_rank    int,
  regular_rank  int,
  unique (season_id, manager_id)
);

create index manager_seasons_season_idx  on manager_seasons(season_id);
create index manager_seasons_manager_idx on manager_seasons(manager_id);

-- ============================================================
-- MATCHUPS
-- ============================================================
create table matchups (
  id           uuid primary key default uuid_generate_v4(),
  season_id    uuid not null references seasons(id) on delete cascade,
  week         int not null,
  manager_a_id uuid not null references managers(id) on delete cascade,
  manager_b_id uuid not null references managers(id) on delete cascade,
  score_a      numeric(10,2),
  score_b      numeric(10,2),
  is_playoff   boolean not null default false,
  is_championship boolean not null default false,
  unique (season_id, week, manager_a_id, manager_b_id)
);

create index matchups_season_week_idx on matchups(season_id, week);

-- ============================================================
-- DRAFTS
-- ============================================================
create table drafts (
  id          uuid primary key default uuid_generate_v4(),
  season_id   uuid not null references seasons(id) on delete cascade,
  draft_type  draft_kind not null default 'unknown',
  rounds      int,
  external_id text,
  unique (season_id, external_id)
);

create table draft_picks (
  id          uuid primary key default uuid_generate_v4(),
  draft_id    uuid not null references drafts(id) on delete cascade,
  round       int not null,
  pick        int not null,             -- overall pick number
  manager_id  uuid references managers(id) on delete set null,
  player_name text,
  position    text,
  nfl_team    text,
  player_external_id text,
  unique (draft_id, pick)
);

create index draft_picks_draft_idx on draft_picks(draft_id);

-- ============================================================
-- RIVALRIES
-- ============================================================
create table rivalries (
  id           uuid primary key default uuid_generate_v4(),
  league_id    uuid not null references leagues(id) on delete cascade,
  name         text not null,
  manager_a_id uuid not null references managers(id) on delete cascade,
  manager_b_id uuid not null references managers(id) on delete cascade,
  auto_named   boolean not null default false,
  created_at   timestamptz not null default now(),
  check (manager_a_id <> manager_b_id)
);

create index rivalries_league_idx on rivalries(league_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles        enable row level security;
alter table leagues         enable row level security;
alter table league_members  enable row level security;
alter table seasons         enable row level security;
alter table managers        enable row level security;
alter table manager_seasons enable row level security;
alter table matchups        enable row level security;
alter table drafts          enable row level security;
alter table draft_picks     enable row level security;
alter table rivalries       enable row level security;

-- PROFILES: users manage their own row
create policy "profiles self select" on profiles for select using (auth.uid() = id);
create policy "profiles self update" on profiles for update using (auth.uid() = id);

-- LEAGUES
create policy "leagues select if member" on leagues
  for select using (owner_id = auth.uid() or has_league_access(id));
create policy "leagues insert own" on leagues
  for insert with check (owner_id = auth.uid());
create policy "leagues update if owner" on leagues
  for update using (owner_id = auth.uid());
create policy "leagues delete if owner" on leagues
  for delete using (owner_id = auth.uid());

-- LEAGUE MEMBERS: only owner manages, members can see their own row
create policy "members select self or in league" on league_members
  for select using (user_id = auth.uid() or has_league_access(league_id));
create policy "members write if owner" on league_members
  for all using (
    exists (select 1 from leagues l where l.id = league_id and l.owner_id = auth.uid())
  );

-- Generic per-league read/write policy generator pattern (applied per table):
create policy "seasons access"   on seasons   for select using (has_league_access(league_id));
create policy "seasons write"    on seasons   for all    using (has_league_write(league_id));

create policy "managers access"  on managers  for select using (has_league_access(league_id));
create policy "managers write"   on managers  for all    using (has_league_write(league_id));

create policy "manager_seasons access" on manager_seasons for select using (
  exists (select 1 from seasons s where s.id = season_id and has_league_access(s.league_id))
);
create policy "manager_seasons write" on manager_seasons for all using (
  exists (select 1 from seasons s where s.id = season_id and has_league_write(s.league_id))
);

create policy "matchups access" on matchups for select using (
  exists (select 1 from seasons s where s.id = season_id and has_league_access(s.league_id))
);
create policy "matchups write" on matchups for all using (
  exists (select 1 from seasons s where s.id = season_id and has_league_write(s.league_id))
);

create policy "drafts access" on drafts for select using (
  exists (select 1 from seasons s where s.id = season_id and has_league_access(s.league_id))
);
create policy "drafts write" on drafts for all using (
  exists (select 1 from seasons s where s.id = season_id and has_league_write(s.league_id))
);

create policy "draft_picks access" on draft_picks for select using (
  exists (select 1 from drafts d join seasons s on s.id = d.season_id
          where d.id = draft_id and has_league_access(s.league_id))
);
create policy "draft_picks write" on draft_picks for all using (
  exists (select 1 from drafts d join seasons s on s.id = d.season_id
          where d.id = draft_id and has_league_write(s.league_id))
);

create policy "rivalries access" on rivalries for select using (has_league_access(league_id));
create policy "rivalries write"  on rivalries for all    using (has_league_write(league_id));

-- ============================================================
-- updated_at TRIGGERS
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at  before update on profiles  for each row execute function set_updated_at();
create trigger leagues_updated_at   before update on leagues   for each row execute function set_updated_at();
