-- 0072_league_visits.sql
-- How active is each league?
--
-- user_visits (0066) only sees signed-in accounts, and most of a league
-- never signs in: they open the almanac link from the group chat. So this
-- counts browsers, per league, per day. A signed-out browser is a random id
-- the page keeps in localStorage; a signed-in one is its account, so the
-- same person on a phone and a laptop counts once.
--
-- One row per (league, day, visitor). `visits` is sessions, not page views:
-- a gap of 30 minutes or more starts a new one, so an evening spent in the
-- record book is one visit and coming back after dinner is two. `views`
-- keeps the raw page count alongside.
--
-- `day` is America/New_York, computed by the API route, same as user_visits.
-- Admin-only reading: nothing here is shown to commissioners.

create table if not exists league_visits (
  league_id     uuid not null references leagues (id) on delete cascade,
  day           date not null,
  -- 'u:<user id>' when signed in, 'a:<browser id>' otherwise.
  visitor       text not null,
  -- 'owner' (the commissioner), 'member' (any other signed-in account) or
  -- 'visitor' (signed out). The owner's own checks are split out on the
  -- admin page so a commissioner editing their league doesn't read as a
  -- league that's busy.
  role          text not null default 'visitor' check (role in ('owner', 'member', 'visitor')),
  visits        int  not null default 1,
  views         int  not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  primary key (league_id, day, visitor)
);

create index if not exists league_visits_day_idx on league_visits (day desc);

-- Atomic upsert, for the same reason as record_visit: two tabs opening at
-- once would race a select-then-insert.
create or replace function record_league_visit(p_league uuid, p_day date, p_visitor text, p_role text)
returns void
language sql
as $$
  insert into league_visits (league_id, day, visitor, role)
  values (p_league, p_day, p_visitor, p_role)
  on conflict (league_id, day, visitor) do update
    set views = league_visits.views + 1,
        visits = league_visits.visits
          + case when league_visits.last_seen_at < now() - interval '30 minutes' then 1 else 0 end,
        role = case
          when league_visits.role = 'owner' or excluded.role = 'owner' then 'owner'
          when league_visits.role = 'member' or excluded.role = 'member' then 'member'
          else 'visitor'
        end,
        last_seen_at = now();
$$;

-- Service-role only, same posture as user_visits.
alter table league_visits enable row level security;
revoke execute on function record_league_visit(uuid, date, text, text) from public, anon, authenticated;
grant execute on function record_league_visit(uuid, date, text, text) to service_role;

notify pgrst, 'reload schema';
