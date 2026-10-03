-- The social queue. A Saturday cron writes next week's posts here, Joey gets
-- an email listing them, and an hourly cron sends whatever is due to X and
-- Threads unless he has vetoed it. Nothing is posted by hand.
--
-- One row is one post on both platforms. Each platform keeps its own text
-- (X counts 280, Threads 500) and its own result, so a post that went out on
-- X and failed on Threads retries Threads alone and never double-posts X.
--
-- plan_key ("2026-10-06:regret") makes planning idempotent: re-running the
-- Saturday job, or pressing "Plan next week" twice, skips posts that exist.
--
-- Some posts can't be written on Saturday because their data doesn't exist
-- yet (the Drop Regret Index needs Sunday's scores). Those are stored with
-- `params` and empty texts, and the publisher fills them in just before
-- sending. The slot is still in the digest, so it can still be vetoed.

create table if not exists social_posts (
  id               uuid primary key default gen_random_uuid(),
  plan_key         text unique,
  kind             text not null,
  scheduled_at     timestamptz not null,
  status           text not null default 'queued'
                   check (status in ('queued', 'vetoed', 'sending', 'sent', 'partial', 'failed', 'expired')),
  x_text           text,
  threads_text     text,
  -- Site path of the image ("/api/og/social/<id>/"), absolute URLs allowed.
  -- Threads fetches it from us, so it must be public.
  image_path       text,
  -- Where the post sends people, without UTM tags. The texts carry the tagged
  -- per-platform copy.
  link             text,
  -- Builder inputs captured at plan time, and the card's data once built.
  params           jsonb not null default '{}'::jsonb,
  card             jsonb,
  x_post_id        text,
  threads_post_id  text,
  x_error          text,
  threads_error    text,
  attempts         int not null default 0,
  sent_at          timestamptz,
  edited_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists social_posts_due_idx on social_posts (scheduled_at) where status = 'queued';
create index if not exists social_posts_scheduled_idx on social_posts (scheduled_at desc);

-- Threads long-lived tokens last 60 days and can be refreshed once they are a
-- day old. The Saturday job refreshes weekly and stores the new token here,
-- so the one Joey pastes into THREADS_ACCESS_TOKEN only seeds the first run.
create table if not exists social_tokens (
  platform      text primary key,
  access_token  text not null,
  expires_at    timestamptz,
  refreshed_at  timestamptz not null default now()
);

-- Service role only.
alter table social_posts enable row level security;
alter table social_tokens enable row level security;

notify pgrst, 'reload schema';
