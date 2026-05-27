-- 0021_yahoo_tokens.sql
-- Per-user Yahoo OAuth 2.0 tokens. Yahoo Fantasy API requires per-user auth
-- (no public read path like Sleeper has), so the commissioner has to log in
-- to Yahoo once and grant our app read access. We store the resulting tokens
-- here, keyed by Supabase auth.users.id.
--
-- access_token expires after 1h; refresh_token is long-lived. We refresh
-- transparently on use. yahoo_guid is the Yahoo user identifier — useful for
-- enumerating that user's leagues without an extra round-trip.
--
-- RLS: a user can only read/write their own tokens. The service role bypasses
-- RLS as usual when we need to refresh in background jobs.

create table if not exists yahoo_tokens (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  yahoo_guid    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table yahoo_tokens enable row level security;

create policy "yahoo_tokens own select" on yahoo_tokens
  for select using (user_id = auth.uid());

create policy "yahoo_tokens own write" on yahoo_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
