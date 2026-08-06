-- Preseason win-total ballots.
--
-- Every manager projects a win total for all twelve managers before the
-- season starts. Once they're all in, the mean of the ballots becomes the
-- line, and the league votes over/under on it. This table holds phase one.
--
-- `manager_name` is text rather than a managers.id reference on purpose:
-- the ballot is filled in by whoever has the link, with no account, so
-- there is no id to resolve at write time. The roster the ballot renders
-- is a fixed list in src/lib/winBallot.ts, and the name written here is
-- one of those strings. Names are also what the ballot is read back as,
-- so nothing downstream needs the join.
--
-- `picks` is { "Cat": 7, "Charlie": 8, ... }, one key per manager on the
-- roster; `total` is their sum, stored rather than derived so the board can
-- sort and sanity-check without unpacking twelve keys per row.

create table win_ballots (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  league_id    uuid not null references leagues (id) on delete cascade,
  season       int  not null,
  manager_name text not null,

  picks        jsonb not null,
  total        int   not null,

  -- One ballot per manager per season. This is the whole integrity model:
  -- a second submission under a name already used is rejected by the
  -- database, not by a cookie somebody can clear.
  unique (league_id, season, manager_name)
);

-- The room reads every ballot for one league+season at once; the unique
-- index above leads with league_id so it serves that too, but season-scoped
-- reads are the only access pattern and deserve their own.
create index win_ballots_league_season_idx on win_ballots (league_id, season);

-- No policies, by design: RLS on with zero policies denies everything to
-- anon and authenticated clients. Every read and write goes through the
-- service-role client behind either the round's share token (submitting)
-- or a league write-access check (reading the room).
alter table win_ballots enable row level security;
