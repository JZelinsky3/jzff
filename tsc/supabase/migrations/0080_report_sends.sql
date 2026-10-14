-- 0080_report_sends.sql
-- The Progress Report email (src/lib/report/run.ts), sent the Thursday after
-- each report week. One row per recipient per league edition, claimed before
-- Resend is called, so an edition reaches an address at most once.
--
-- Same recipients as recap_sends (0070, 0071): user_id for the commissioner,
-- subscriber_id for a mailing-list member, never both. A report has nothing
-- stored of its own (it is rebuilt from scores), so the edition is keyed by
-- league, season and week rather than by a parent row.
-- Server-only: the send job uses the service role.

create table if not exists report_sends (
  id             uuid primary key default gen_random_uuid(),
  league_id      uuid not null references leagues (id) on delete cascade,
  season_year    int  not null,
  week           int  not null,
  user_id        uuid,
  subscriber_id  uuid references recap_subscribers (id) on delete cascade,
  email          text not null,
  status         text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  resend_id      text,
  error          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint report_sends_one_recipient check ((user_id is null) <> (subscriber_id is null)),
  constraint report_sends_owner_key unique (league_id, season_year, week, user_id),
  constraint report_sends_subscriber_key unique (league_id, season_year, week, subscriber_id)
);

alter table report_sends enable row level security;

notify pgrst, 'reload schema';
