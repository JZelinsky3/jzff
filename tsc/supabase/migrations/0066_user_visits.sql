-- 0066_user_visits.sql
-- Who is coming back?
--
-- The site can already answer "who signed up" (profiles.created_at) and
-- "when did this account last authenticate" (auth.users.last_sign_in_at).
-- Neither answers retention. Supabase refresh tokens keep a session alive for
-- weeks, so somebody who visits every single day signs in ONCE and their
-- last_sign_in_at never moves again. Counting sign-ins would report the most
-- loyal users as the most inactive ones.
--
-- So: one row per user per day they were actually on the site. Not one row
-- per request -- that is a firehose that costs money to store and answers a
-- question nobody asked. Day-grain is exactly the grain of "did they come
-- back", and it makes the table at most (users x days) rows.
--
-- `day` is a date in America/New_York, computed by the API route rather than
-- by the database. Storing UTC days would split a Sunday night session
-- across two rows, and Sunday night is when this league software is used.

create table if not exists user_visits (
  user_id       uuid not null references auth.users (id) on delete cascade,
  day           date not null,
  -- Sessions that day, not page views: the ping fires once per browser tab
  -- session. Enough to tell a bounce from an evening spent in the archive.
  hits          int  not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  -- Where they were when the ping fired. First path of the session, which is
  -- the closest thing to "what brought them back today".
  entry_path    text,
  primary key (user_id, day)
);

-- "Who was active in the last N days" is the only query this table exists to
-- answer, and it scans by day.
create index if not exists user_visits_day_idx on user_visits (day desc);

-- Atomic upsert. Doing this as select-then-insert in the route would race
-- two tabs opened at the same moment and lose one of them.
create or replace function record_visit(p_user uuid, p_day date, p_path text)
returns void
language sql
as $$
  insert into user_visits (user_id, day, entry_path)
  values (p_user, p_day, p_path)
  on conflict (user_id, day) do update
    set hits = user_visits.hits + 1,
        last_seen_at = now();
$$;

-- Service-role only, same posture as site_reviews: the API route writes with
-- the admin client and /admin reads it back. Nothing here should be reachable
-- from a browser session, including the function -- a user being able to
-- stuff their own visit counts would make the retention numbers fiction.
alter table user_visits enable row level security;
revoke execute on function record_visit(uuid, date, text) from public, anon, authenticated;
-- Re-granted explicitly after the revoke: REVOKE ... FROM public strips the
-- default grant from every role that has no grant of its own, and the API
-- route calls this as service_role. Without this line the ping fails with
-- "permission denied for function record_visit" and records nothing.
grant execute on function record_visit(uuid, date, text) to service_role;

notify pgrst, 'reload schema';
