-- 0085_game_runs_guests.sql
--
-- Pack Empire's board takes a run from someone with no account: they type a
-- name and it goes up. Signing in later moves those runs onto the account,
-- which is what files their cards in a binder. Nothing else changes: every
-- other board still needs an account, and the route enforces that.
--
-- A guest is a random key the browser keeps. game_runs is publicly readable,
-- so only the key's hash is stored here, the same as a guest's Versus seat
-- (see src/lib/packEmpire/people.ts).

alter table game_runs alter column user_id drop not null;

alter table game_runs
  add column if not exists guest_key text,
  add column if not exists guest_name text;

-- Every run has exactly one owner, an account or a guest.
alter table game_runs drop constraint if exists game_runs_owner_check;
alter table game_runs
  add constraint game_runs_owner_check check (
    (user_id is not null and guest_key is null and guest_name is null)
    or (user_id is null and guest_key is not null and guest_name is not null)
  );

-- game_runs_one_per_seed_idx can't see these rows (a null never collides), so
-- this is the same rule for guests: a deal goes on the board once.
create unique index if not exists game_runs_one_guest_per_seed_idx
  on game_runs (game, pool_id, coalesce(mode, ''), seed)
  where user_id is null and week_start is null;

-- Finding a device's runs when it signs in.
create index if not exists game_runs_guest_key_idx
  on game_runs (guest_key)
  where guest_key is not null;

-- Same as 0048, with the guest's typed name when there's no account.
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
    coalesce(r.guest_name, game_board_name(p.display_name, p.member_code)),
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

-- Same as 0048, accounts only. The career board groups by user_id, so guests
-- would otherwise all fold into one nameless player.
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
      and r.user_id is not null
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
