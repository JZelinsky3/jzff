-- Tester reviews collected by /review at the close of the free testing
-- window (Aug 16 2026). One row per submission, not one per user: a tester
-- who sends a second, more considered review should not have the first one
-- silently overwritten, so triage reads the newest and keeps the rest.
--
-- rating is stored in half-star steps (1.0 .. 5.0) because the star control
-- lets people land on 4.5. numeric(2,1) makes that exact; a float would let
-- 4.5 drift and break the "= 4.5" grouping in any later average.

create table site_reviews (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  -- Signed-in submissions carry the user; the email link works signed-out
  -- too, so both stay nullable and at least one is expected in practice.
  user_id      uuid references auth.users (id) on delete set null,
  email        text,
  rating       numeric(2,1) not null check (rating >= 1.0 and rating <= 5.0),
  -- Enforce half-star steps. 4.5 passes, 4.3 does not.
  constraint site_reviews_rating_step_chk check ((rating * 2) = floor(rating * 2)),
  -- What they liked / what needs work. Both optional: a bare star rating is
  -- still a useful signal and demanding prose would cost responses.
  best_part    text,
  needs_work   text,
  -- Opt-in to being quoted publicly, plus the name to attach. Default false:
  -- consent to a testimonial has to be given, never assumed.
  can_quote    boolean not null default false,
  quote_name   text,
  -- Where the submission came from, so the email's one-click stars can be
  -- measured against people who found the page on their own.
  source       text,
  user_agent   text
);

-- Service-role only: the API route writes with the admin client and reads
-- happen in /admin, so RLS is enabled with no policies.
alter table site_reviews enable row level security;

create index site_reviews_created_idx on site_reviews (created_at desc);

notify pgrst, 'reload schema';
