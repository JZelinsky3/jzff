-- 0050_game_runs_multiverse.sql
--
-- Lets The Multiverse Draft onto the leaderboard.
--
-- game_runs.game carries a CHECK listing the games with boards, and the new
-- one was not in it, so every post came back 23514 and the board stayed
-- permanently empty. Widening the list is the whole change: no column, no
-- index and no RPC needs to know about a new game, because a board is a
-- (game, mode, pool) triple and the queries are already generic over it.
--
-- Multiverse stores a PACKED score rather than a plain one: wins, then win
-- rate, then points a game, in a single integer (see rankScore in
-- src/lib/minigames/multiverse.ts). It is still just "higher is better", so
-- the ordering indexes and the board RPCs read it like any other game — but
-- it is not a number to print, and BoardTable prints the record instead.

alter table game_runs
  drop constraint if exists game_runs_game_check;

alter table game_runs
  add constraint game_runs_game_check
  check (game in (
    'roulette', 'guess-the-draft', 'gauntlet', 'over-under', 'redraft', 'multiverse'
  ));
