-- Preseason win totals, phase two: the locked board and the over/under vote.
--
-- Phase one (0053_win_ballots.sql) collects a win total for all twelve from
-- every manager. This is what happens next: the commissioner locks those
-- ballots into a board of twelve lines, and the league comes back to take a
-- side on each one.
--
-- The lines are STORED here rather than recomputed from win_ballots on every
-- read, and that is the whole point of the table. A ballot filed after the
-- lock would otherwise slide a number somebody has already voted against.

create table win_board (
  league_id    uuid not null references leagues (id) on delete cascade,
  season       int  not null,

  -- 'all' counts every ballot; 'outsiders' throws out each manager's own
  -- projection of themselves, so nobody helps set their own number. Kept so
  -- the board can say which way it was drawn long after anybody remembers.
  basis        text not null default 'outsiders' check (basis in ('all', 'outsiders')),

  -- { "Cat": 6.5, "Charlie": 7.5, ... } one key per manager, always a half.
  lines        jsonb not null,
  -- Ballots that went into the lines, frozen at lock time for the same reason.
  ballot_count int  not null,

  -- The room's picks stay sealed until the commissioner opens them: voters
  -- see a receipt, not a consensus, until this flips.
  revealed     boolean not null default false,

  locked_at    timestamptz not null default now(),

  primary key (league_id, season)
);

create table win_votes (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  league_id    uuid not null references leagues (id) on delete cascade,
  season       int  not null,
  manager_name text not null,

  -- { "Cat": "over", ... } every manager EXCEPT the voter: you don't get a
  -- side on your own season. Eleven keys, not twelve.
  lines        jsonb not null,
  -- { "champion": "Mason", "last": "Evan", "points": "Isaac",
  --   "conference": "Skim" }
  props        jsonb not null default '{}'::jsonb,
  -- { "Chris|Joey": "Joey", ... } keyed by the two names sorted, so the pair
  -- has one spelling no matter which side of it you look from.
  rivalry      jsonb not null default '{}'::jsonb,

  -- Same integrity model as the ballot: one card per manager per season,
  -- enforced by the database rather than by a cookie somebody can clear.
  unique (league_id, season, manager_name)
);

create index win_votes_league_season_idx on win_votes (league_id, season);

-- No policies, as with win_ballots: RLS on with none defined denies anon and
-- authenticated outright. Reads and writes go through the service-role client
-- behind either the round's share token (voting) or a league write-access
-- check (the room).
alter table win_board enable row level security;
alter table win_votes enable row level security;
