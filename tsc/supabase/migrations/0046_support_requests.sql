-- Support desk inbox. Every note sent from the floating Support widget
-- (public almanac pages + /league management pages) lands here first, then
-- the API route best-effort emails a copy to the support address. Keeping
-- the row is the durability guarantee: if the email provider is down or the
-- key is missing, nothing is lost.

create table support_requests (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  email        text not null,
  topic        text not null check (topic in (
    'bug', 'suggestion', 'feedback', 'question', 'billing', 'other'
  )),
  subject      text not null,
  message      text not null,
  -- Context captured automatically by the widget/route so triage doesn't
  -- depend on the reporter describing where they were.
  league_slug  text,
  page_url     text,
  user_id      uuid references auth.users (id) on delete set null,
  user_agent   text,
  -- Whether the copy-to-inbox email actually went out (false = stored only).
  emailed      boolean not null default false,
  status       text not null default 'new' check (status in ('new', 'read', 'resolved'))
);

-- Service-role only: the API route writes with the admin client and there is
-- no client-side read path, so RLS is enabled with no policies.
alter table support_requests enable row level security;

create index support_requests_created_idx on support_requests (created_at desc);

notify pgrst, 'reload schema';
