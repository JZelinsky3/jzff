-- 0043_site_admin_league_write.sql
-- The write-side counterpart to 0019 (which gave site admins read access
-- to every league). Adds the is_site_admin() branch to has_league_write()
-- so admins can assist with setup, syncing, and publishing on any league
-- from their own account. Every per-league write policy (seasons,
-- league_sources, managers, matchups, rivalries, etc.) calls this helper,
-- so no per-table policy churn.
--
-- App-level route/action checks gained a matching isSiteAdmin() fallback
-- in the same change; this migration covers the writes that go through
-- the user-scoped client (league settings, live-season toggles, sources).

create or replace function has_league_write(_league_id uuid)
returns boolean
language sql
stable security definer set search_path = public
as $$
  select exists (
    select 1 from leagues l where l.id = _league_id and l.owner_id = auth.uid()
  ) or exists (
    select 1 from league_members m
    where m.league_id = _league_id and m.user_id = auth.uid() and m.role in ('owner','editor')
  ) or is_site_admin(auth.uid());
$$;

notify pgrst, 'reload schema';
