-- THE MILK EXAM: one run per manager.
--
-- A twenty-question quiz built from the numbers THE MILK ORDER countdown
-- never spent. Like the win-total ballot (0053) it is played by whoever holds
-- the league's share link, with no account, so `manager_name` is text rather
-- than a managers.id reference: there is no id to resolve at write time. The
-- roster and the questions are a fixed list in src/lib/milkExam.ts and the
-- name written here is one of those strings.
--
-- `picks` is { "0": "Charlie", "1": "Luke", ... }, one key per question index,
-- holding the NAME they chose. The score is stored too, because every read is
-- a leaderboard sort and unpacking twenty keys per row to count them is work
-- the board should not do. It is still recomputed server-side on write: the
-- client sends picks, never a score.

create table exam_runs (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  league_id    uuid not null references leagues (id) on delete cascade,
  edition      text not null,
  manager_name text not null,

  picks        jsonb not null,
  score        int   not null,

  -- One run per manager per edition, enforced here rather than by a cookie
  -- anybody can clear. The answers are revealed question by question as you
  -- play, so a second attempt would be a memory test rather than a quiz.
  unique (league_id, edition, manager_name)
);

-- Both reads are "every run for this league's edition": the board on the
-- public page and the room's breakdown.
create index exam_runs_league_edition_idx on exam_runs (league_id, edition);

-- No policies, by design: RLS on with zero policies denies everything to anon
-- and authenticated clients. Every read and write goes through the
-- service-role client behind either the share token (playing) or a league
-- write-access check (the room).
alter table exam_runs enable row level security;
