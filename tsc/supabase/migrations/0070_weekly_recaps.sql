-- Weekly recaps: one row per league per finished week, the log of who each
-- one was emailed to, and the list of addresses that must never get one.
--
-- weekly_recaps.facts is the frozen snapshot the email was written from. The
-- page renders from it, so the page and the email can never disagree, even if
-- a stat correction moves a score later in the week.

create table if not exists weekly_recaps (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references leagues(id) on delete cascade,
  season_year   int  not null,
  week          int  not null,
  facts         jsonb,
  intro         text,
  intro_source  text check (intro_source in ('ai', 'template')),
  subject       text,
  -- ready: built and checked, not yet emailed
  -- held:  the week failed a completeness check; hold_reason says which
  -- sent:  the commissioner's email went out
  status        text not null default 'ready' check (status in ('ready', 'held', 'sent')),
  hold_reason   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (league_id, season_year, week)
);

-- The unique pair is what makes a double send impossible: the send job
-- claims (recap, user) with an insert BEFORE calling Resend, so a second run
-- that reaches the same pair hits the constraint and skips. A send that dies
-- halfway leaves the row 'pending' and is never retried automatically, on
-- purpose: one missed recap is better than two identical ones.
create table if not exists recap_sends (
  id          uuid primary key default gen_random_uuid(),
  recap_id    uuid not null references weekly_recaps(id) on delete cascade,
  user_id     uuid not null,
  email       text not null,
  status      text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  resend_id   text,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (recap_id, user_id)
);

-- Keyed by address, lowercased, because bounces, complaints and Resend's own
-- unsubscribe list all arrive as addresses rather than user ids.
create table if not exists email_suppressions (
  email       text primary key,
  reason      text not null check (reason in ('unsubscribe', 'bounce', 'complaint', 'imported')),
  created_at  timestamptz not null default now()
);

create index if not exists weekly_recaps_league_idx on weekly_recaps (league_id, season_year desc, week desc);

-- Service role only. Nothing in the browser reads these directly.
alter table weekly_recaps      enable row level security;
alter table recap_sends        enable row level security;
alter table email_suppressions enable row level security;

notify pgrst, 'reload schema';
