-- The high and low ballot behind each line, kept with the line itself.
--
-- The voting card shows what the room's ballots actually ran to, not just
-- the average they collapsed into: a 6.5 that every ballot agreed on is a
-- different bet from a 6.5 drawn from 3s and 10s.
--
-- Frozen at lock time for the same reason the lines are (see 0054): a late
-- ballot must not quietly widen a range somebody already bet against.
--
-- Separate from 0054 so it applies cleanly whether or not that migration
-- has already been run. The code treats a missing spread as "no range to
-- show" rather than an error, so an unmigrated board still votes.

alter table win_board
  add column if not exists spread jsonb not null default '{}'::jsonb;

comment on column win_board.spread is
  '{ "Cat": { "high": 9, "low": 4 }, ... } the ballot range behind each line.';
