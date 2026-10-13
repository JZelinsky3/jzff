-- 0078_league_cups.sql
-- The Cup: a knockout side tournament run inside a league's regular season.
--
-- Each round is one week and a team's real score that week is its Cup score,
-- whoever it plays in the league. Nobody enters anything; the whole league is
-- in it. See src/lib/cup/bracket.ts for the rules.
--
-- The draw is frozen here when the Cup is made: `seeds` holds every team's
-- seed and its record at the time, so a resync or a corrected score in an
-- earlier week can never reshuffle a bracket people have already seen and
-- sent to the group chat. Results are read live from matchups.
--
-- Server-only: the page and the image routes read it with the service role.

create table if not exists league_cups (
  id              uuid primary key default gen_random_uuid(),
  league_id       uuid not null references leagues (id) on delete cascade,
  season_year     int  not null,
  name            text not null default 'The Cup',
  -- The week round one is played. Round r is week start_week + r.
  start_week      int  not null check (start_week between 1 and 18),
  -- Seeds are the standings through this week (normally start_week - 1).
  seeded_through  int  not null check (seeded_through between 0 and 18),
  -- [{ "seed": 1, "manager_id": "...", "w": 5, "l": 0, "t": 0, "pf": 753.34 }, ...]
  seeds           jsonb not null,
  created_at      timestamptz not null default now(),
  unique (league_id, season_year, start_week)
);

create index if not exists league_cups_league_idx on league_cups (league_id, season_year desc);

alter table league_cups enable row level security;
