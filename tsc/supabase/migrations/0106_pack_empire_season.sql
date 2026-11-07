-- 0106_pack_empire_season.sql
--
-- League Mode's Season variation (Joey, 2026-11-07). A league is picked as
-- Weekly (pe_leagues, untouched) or Season (these tables) when it's made.
--
-- A Season team drafts once (eleven slot packs, one of them the Franchise Pack,
-- then three wild bench packs), then plays eight games against the league's
-- schedule of defenses at its own pace: all eight in one sitting if it likes.
-- Every game is against a defense and its points to beat, never another team,
-- so nobody waits on anybody until the playoffs, which open once every team
-- has played eight. Each game pays a pack; its card goes to the bench.
--
-- A solo season is one person and eleven CPU teams, and works signed out: the
-- owner is then a hashed guest key off the browser's cookie (people.ts hashKey),
-- moved onto the account at sign-in. A league with friends needs accounts.
--
-- RLS on, no policies: only the server's routes read or write these.
-- Additive: new tables only.

create table if not exists pe_season_leagues (
  id             text primary key,
  created_at     timestamptz not null default now(),
  name           text not null,
  kind           text not null check (kind in ('solo', 'league')),
  owner_id       uuid references auth.users (id) on delete cascade,
  owner_key      text,
  visibility     text not null default 'invite' check (visibility in ('public', 'invite')),
  join_code      text not null unique,
  max_players    int  not null default 12 check (max_players between 4 and 12),
  -- How many teams make the playoffs. The commissioner sets it and can change it
  -- until the playoffs start; the top seeds get byes when it isn't a power of two.
  playoff_size   int  not null default 6 check (playoff_size between 2 and 12),
  -- Server-only: packs and games are dealt off it.
  seed           text not null,
  -- The schedule's seed. Public: the eight fronts are shown before the season.
  schedule_seed  text not null,
  phase          text not null default 'pregame' check (phase in ('pregame', 'regular', 'playoffs', 'complete')),
  -- The playoff round being played, from 1.
  round          int  not null default 0,
  season_number  int  not null default 1,
  champion_id    uuid,
  check ((owner_id is null) <> (owner_key is null))
);

create index if not exists pe_season_leagues_owner_idx on pe_season_leagues (owner_id);
create index if not exists pe_season_leagues_key_idx on pe_season_leagues (owner_key);
create index if not exists pe_season_leagues_public_idx on pe_season_leagues (visibility, phase, created_at desc);

alter table pe_season_leagues enable row level security;

create table if not exists pe_season_teams (
  id            uuid primary key default gen_random_uuid(),
  league_id     text not null references pe_season_leagues (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete cascade,
  guest_key     text,
  is_cpu        boolean not null default false,
  joined_at     timestamptz not null default now(),
  -- The owner's board name when they joined; never an email.
  display_name  text not null,
  team_name     text not null,
  -- Draft Day as it goes: { franchise, packs: { slot: ids[] }, picks: [{ slot, id }], open, bench: [{ slot, ids, kept }] }
  draft         jsonb not null default '{}'::jsonb,
  -- The eleven, card ids in SLOTS order, once Draft Day is done.
  roster        jsonb,
  -- Card ids, at most six.
  bench         jsonb not null default '[]'::jsonb,
  -- A game's pack waiting to be opened or kept: { week, phase, tier, ids }
  pending       jsonb,
  wins          int  not null default 0,
  losses        int  not null default 0,
  points_for    int  not null default 0,
  played        int  not null default 0,
  playoff_seed  int,
  eliminated    boolean not null default false,
  titles        int  not null default 0,
  check ((case when user_id is not null then 1 else 0 end) + (case when guest_key is not null then 1 else 0 end) + (case when is_cpu then 1 else 0 end) = 1)
);

create unique index if not exists pe_season_teams_user_idx on pe_season_teams (league_id, user_id) where user_id is not null;
create unique index if not exists pe_season_teams_guest_idx on pe_season_teams (league_id, guest_key) where guest_key is not null;
create index if not exists pe_season_teams_mine_idx on pe_season_teams (user_id);
create index if not exists pe_season_teams_league_idx on pe_season_teams (league_id);

alter table pe_season_teams enable row level security;

create table if not exists pe_season_games (
  id             uuid primary key default gen_random_uuid(),
  league_id      text not null references pe_season_leagues (id) on delete cascade,
  team_id        uuid not null references pe_season_teams (id) on delete cascade,
  season_number  int  not null,
  phase          text not null check (phase in ('regular', 'playoffs')),
  -- The game number in the regular season, the round in the playoffs.
  week           int  not null,
  defense        text not null,
  -- The points to beat (regular season); the other team (playoffs).
  line           int,
  opponent_id    uuid,
  lineup         jsonb not null,
  points         int  not null,
  won            boolean,
  -- { drives, box, yards, rushYds, passYds, sacks, expected }
  result         jsonb not null,
  created_at     timestamptz not null default now(),
  unique (team_id, season_number, phase, week)
);

create index if not exists pe_season_games_league_idx on pe_season_games (league_id, season_number, phase, week);

alter table pe_season_games enable row level security;
