-- Leaderboards for the Games Page.
--
-- One row per POSTED RUN, not one per player. The primary board is a best-run
-- board and the same person may hold several slots on it: if someone played a
-- lot to get there, that is the board working, not a bug. Deduplicating to a
-- player's best is done by the WEEKLY board's query, and nowhere else.
--
-- Nothing here is written from the browser. The client posts a seed plus the
-- choices it made; the API route re-deals that seed server-side, replays the
-- choices, derives the score itself and writes the row with the admin client.
-- There is no client-supplied number on this table.

create table game_runs (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  -- Board identity. A board is a (game, mode, pool) triple, plus whether it
  -- is the free-play board or one week's board. Modes are never merged:
  -- gauntlet 'ten' is hits out of ten and 'endless' is a streak, and one
  -- ladder over both would flatter one and insult the other.
  game         text not null check (game in (
    'roulette', 'guess-the-draft', 'gauntlet', 'over-under', 'redraft'
  )),
  mode         text,
  -- League slug, a comma-joined combined wheel, 'site', or 'demo'.
  pool_id      text not null,

  -- Null = free play, which is the primary board. Set = the Monday of the
  -- week whose shared seed this run was played on. The weekly is the only
  -- place a duplicated deal exists on purpose: everyone gets the same board,
  -- one attempt each, and at the end of the week you see who did best.
  week_start   date,

  seed         text not null,
  user_id      uuid not null references auth.users (id) on delete cascade,

  -- The ranking key, server-derived, higher is better. Roulette stores PPG
  -- (the record is derived from it linearly, so they order identically and
  -- PPG breaks ties the record cannot); the guessing games store correct
  -- answers; redraft stores its margin.
  score        numeric not null,

  -- Career board inputs, kept as a fraction rather than a rate so runs of
  -- different lengths can be summed: roulette 14/17, gauntlet-ten 8/10, a
  -- 12-long endless streak 12/13 (twelve right, then the one that ended it).
  rate_num     numeric not null,
  rate_den     numeric not null check (rate_den > 0),

  -- What the board row prints: record, ppg, streak, whatever that game shows.
  -- Display only; never read back as an input to a score.
  display      jsonb not null default '{}'::jsonb,
  -- The choices, kept so any row can be re-verified later and so a run can
  -- be replayed into a recap from the board.
  detail       jsonb not null default '{}'::jsonb,

  -- Server-measured: the gap between the deal being issued and the run
  -- coming back. A client-reported duration is the one number worth faking
  -- on a board full of perfect scores.
  elapsed_ms   int
);

-- The board query: everything for one board, best first, and among equal
-- scores the one that got there FIRST holds the higher slot. A tie can never
-- be taken off you later by someone matching it.
create index game_runs_board_idx
  on game_runs (game, pool_id, mode, week_start, score desc, created_at asc);

-- "You are 77th" is a count of better runs on the same board, which rides
-- the index above. Nothing extra needed for it.

-- One posted run per seed per player on the free-play boards. Free play
-- deals from an 8-character seed space and never repeats a wheel by
-- accident, so this costs an honest player nothing; what it stops is
-- replaying a wheel you have already solved until the record is perfect.
create unique index game_runs_one_per_seed_idx
  on game_runs (game, pool_id, coalesce(mode, ''), seed, user_id)
  where week_start is null;

-- ONE ATTEMPT at the weekly, per player, per week. This is the constraint
-- the whole weekly board rests on: everyone plays the identical board once,
-- so the scores compare directly and there is nothing to grind. It is also
-- what keeps the guessing games honest — a second attempt at a fixed seed
-- is a memory test of the first attempt, not of the league's history.
create unique index game_runs_one_per_week_idx
  on game_runs (game, pool_id, coalesce(mode, ''), week_start, user_id)
  where week_start is not null;

-- The career board sums every run a player has posted in a pool.
create index game_runs_career_idx
  on game_runs (user_id, game, pool_id, mode);

alter table game_runs enable row level security;

-- Boards are public: anyone can read them, signed in or not, the same way
-- anyone can play. Writes go through the API route's admin client only, so
-- there is deliberately no insert/update/delete policy.
create policy game_runs_public_read on game_runs
  for select using (true);

-- ============================================================
-- Board queries
-- ============================================================
--
-- These are SQL functions rather than PostgREST selects because two of the
-- three need work PostgREST cannot express: the weekly board is a
-- `distinct on` (each player's highest that week) and the career board is an
-- aggregate. Doing either by over-fetching and folding in JavaScript gets
-- the ranks wrong the moment a board is longer than the page.
--
-- The name on a board row: `display_name` unless it looks like an email
-- address, in which case the member code stands in. New accounts are seeded
-- with `full_name` or, failing that, the signup email — and an email address
-- has no business on a public leaderboard.

create or replace function game_board_name(p_display text, p_code text)
returns text language sql immutable as $$
  select case
    when p_display is null or btrim(p_display) = '' then coalesce(p_code, 'Manager')
    when position('@' in p_display) > 0 then coalesce(p_code, 'Manager')
    else btrim(p_display)
  end
$$;

-- The primary board: best runs, one row per RUN. Ties go to whoever posted
-- first, so a slot can never be taken off you by someone matching it later.
create or replace function game_board_best(
  p_game text,
  p_pool text,
  p_mode text,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  rank bigint,
  run_id uuid,
  user_id uuid,
  name text,
  score numeric,
  display jsonb,
  created_at timestamptz
)
language sql stable as $$
  select
    row_number() over (order by r.score desc, r.created_at asc) + p_offset,
    r.id,
    r.user_id,
    game_board_name(p.display_name, p.member_code),
    r.score,
    r.display,
    r.created_at
  from game_runs r
  left join profiles p on p.id = r.user_id
  where r.game = p_game
    and r.pool_id = p_pool
    and coalesce(r.mode, '') = coalesce(p_mode, '')
    and r.week_start is null
  order by r.score desc, r.created_at asc
  offset p_offset
  limit p_limit
$$;

-- Where one run sits on its board. Counts the runs strictly ahead of it
-- under the same ordering, so it agrees with the board functions exactly.
-- This is what answers "your best is 77th" when the board only shows fifty.
--
-- `p_week` null selects the free-play board, a date selects that week's;
-- `is not distinct from` handles both without a second function.
create or replace function game_rank(
  p_game text,
  p_pool text,
  p_mode text,
  p_week date,
  p_run uuid
)
returns bigint
language sql stable as $$
  select 1 + count(*)
  from game_runs r, game_runs me
  where me.id = p_run
    and r.game = p_game
    and r.pool_id = p_pool
    and coalesce(r.mode, '') = coalesce(p_mode, '')
    and r.week_start is not distinct from p_week
    and (r.score > me.score or (r.score = me.score and r.created_at < me.created_at))
$$;

-- How many runs are on a board at all, so a rank can be shown as "77th of
-- 812" rather than as a number with no scale.
create or replace function game_board_size(
  p_game text,
  p_pool text,
  p_mode text,
  p_week date
)
returns bigint
language sql stable as $$
  select count(*)
  from game_runs r
  where r.game = p_game
    and r.pool_id = p_pool
    and coalesce(r.mode, '') = coalesce(p_mode, '')
    and r.week_start is not distinct from p_week
$$;

-- The weekly board: one shared seed, one attempt each. The
-- game_runs_one_per_week_idx index means this is already one row per player,
-- so there is nothing to deduplicate — it is a straight ordering.
create or replace function game_board_weekly(
  p_game text,
  p_pool text,
  p_mode text,
  p_week date,
  p_limit int default 50
)
returns table (
  rank bigint,
  run_id uuid,
  user_id uuid,
  name text,
  score numeric,
  display jsonb,
  created_at timestamptz
)
language sql stable as $$
  select
    row_number() over (order by r.score desc, r.created_at asc),
    r.id,
    r.user_id,
    game_board_name(p.display_name, p.member_code),
    r.score,
    r.display,
    r.created_at
  from game_runs r
  left join profiles p on p.id = r.user_id
  where r.game = p_game
    and r.pool_id = p_pool
    and coalesce(r.mode, '') = coalesce(p_mode, '')
    and r.week_start = p_week
  order by r.score desc, r.created_at asc
  limit p_limit
$$;

-- The career board: every run a player has posted in this pool, as a rate.
-- Ranked on the rate rather than the total so playing more cannot buy a
-- higher place; the minimum-runs bar is what stops one lucky wheel topping
-- it. Players below the bar are still returned, flagged, so someone can see
-- how close they are to qualifying.
create or replace function game_board_career(
  p_game text,
  p_pool text,
  p_mode text,
  p_min_runs int default 10,
  p_limit int default 50
)
returns table (
  rank bigint,
  user_id uuid,
  name text,
  runs bigint,
  rate numeric,
  num numeric,
  den numeric,
  best numeric,
  qualified boolean
)
language sql stable as $$
  with agg as (
    select
      r.user_id,
      count(*) as runs,
      sum(r.rate_num) as num,
      sum(r.rate_den) as den,
      max(r.score) as best,
      min(r.created_at) as first_at
    from game_runs r
    where r.game = p_game
      and r.pool_id = p_pool
      and coalesce(r.mode, '') = coalesce(p_mode, '')
    group by r.user_id
  )
  select
    case when a.runs >= p_min_runs
      then row_number() over (
        order by (a.runs >= p_min_runs) desc, a.num / a.den desc, a.first_at asc
      )
      else null
    end,
    a.user_id,
    game_board_name(p.display_name, p.member_code),
    a.runs,
    round(a.num / a.den, 4),
    a.num,
    a.den,
    a.best,
    a.runs >= p_min_runs
  from agg a
  left join profiles p on p.id = a.user_id
  order by (a.runs >= p_min_runs) desc, a.num / a.den desc, a.first_at asc
  limit p_limit
$$;

notify pgrst, 'reload schema';
