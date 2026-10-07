-- 0075_recap_views.sql
-- Who reads each week's recap, and whether they came from the email.
--
-- The recap email's links carry utm_medium=email plus utm_content=owner or
-- utm_content=list, so a page view can be traced back to the email and to
-- which kind of recipient clicked. The recap page's visit ping (the same one
-- league_visits uses, see 0072) sends those along with the edition.
--
-- One row per (league, edition, visitor): unique readers, not page loads.
-- `views` keeps the raw count. Counted from the browser, so mail scanners
-- that fetch every link in an email (and never run the script) don't count.
-- Admin-only reading, on /admin/mailing-lists.

create table if not exists recap_views (
  league_id     uuid not null references leagues (id) on delete cascade,
  year          int  not null,
  week          int  not null,
  -- 'u:<user id>' when signed in, 'a:<browser id>' otherwise, as league_visits.
  visitor       text not null,
  -- 'owner' (signed in as the commissioner, or clicked the owner's email),
  -- 'subscriber' (clicked a mailing-list copy), 'other' (anyone else).
  role          text not null default 'other' check (role in ('owner', 'subscriber', 'other')),
  -- How they first arrived: the email, a shared link, or neither.
  source        text not null default 'direct' check (source in ('email', 'share', 'direct')),
  views         int  not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  primary key (league_id, year, week, visitor)
);

create index if not exists recap_views_seen_idx on recap_views (first_seen_at desc);

-- Atomic upsert. A reader who clicked the email and later came back from a
-- bookmark stays 'email'; the stronger role and source always win.
create or replace function record_recap_view(p_league uuid, p_year int, p_week int, p_visitor text, p_role text, p_source text)
returns void
language sql
as $$
  insert into recap_views (league_id, year, week, visitor, role, source)
  values (p_league, p_year, p_week, p_visitor, p_role, p_source)
  on conflict (league_id, year, week, visitor) do update
    set views = recap_views.views + 1,
        role = case
          when recap_views.role = 'owner' or excluded.role = 'owner' then 'owner'
          when recap_views.role = 'subscriber' or excluded.role = 'subscriber' then 'subscriber'
          else 'other'
        end,
        source = case
          when recap_views.source = 'email' or excluded.source = 'email' then 'email'
          when recap_views.source = 'share' or excluded.source = 'share' then 'share'
          else 'direct'
        end,
        last_seen_at = now();
$$;

alter table recap_views enable row level security;
revoke execute on function record_recap_view(uuid, int, int, text, text, text) from public, anon, authenticated;
grant execute on function record_recap_view(uuid, int, int, text, text, text) to service_role;
