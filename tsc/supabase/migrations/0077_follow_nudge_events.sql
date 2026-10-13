-- 0077_follow_nudge_events.sql
-- The "save this league" card on almanacs (public/pams-template/assets/js/
-- follow-nudge.js): one row per browser, league and step, so /admin can show
-- how many saw it, tapped it, waved it off, and ended up with a bookmark.
--
-- `vid` is the browser's anonymous id (localStorage tsc_vid, same one the
-- league visit counter uses), so a guest who is shown the card, signs up and
-- comes back bookmarked is one browser across all four steps. Unique per
-- step: a reload never counts twice.
--
-- Written only by /api/bookmarks/nudge with the service role; no policies,
-- so nobody reads or writes it from the browser.

create table if not exists follow_nudge_events (
  id          bigint generated always as identity primary key,
  league_id   uuid not null references leagues(id) on delete cascade,
  vid         text not null,
  user_id     uuid references auth.users(id) on delete set null,
  event       text not null check (event in ('shown', 'tapped', 'dismissed', 'bookmarked')),
  signed_in   boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (league_id, vid, event)
);

create index if not exists follow_nudge_events_created_idx on follow_nudge_events (created_at desc);

alter table follow_nudge_events enable row level security;
