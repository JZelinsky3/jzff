-- 0019_site_admin_league_access.sql
-- Lets site admins (rows in site_admins from 0018) read any league's data
-- without being on the membership roster. Extends the existing
-- has_league_access() SQL helper so every per-league SELECT policy
-- (seasons, managers, manager_seasons, matchups, drafts, draft_picks,
-- rivalries, league_members, league_sources, manager_profiles, pickems_*,
-- etc.) inherits the new path with zero policy churn.
--
-- Write access (has_league_write) is intentionally NOT extended — admins
-- should be able to inspect setups but not silently edit someone else's
-- league. If we want admin writes later, add a separate is_site_admin()
-- branch to has_league_write.
--
-- Also updates the leagues SELECT policy so admins see the row itself
-- (the helper is used inside the policy, but the policy also has its
-- own owner_id short-circuit; we add an OR is_site_admin clause for
-- clarity / future readers).

create or replace function has_league_access(_league_id uuid)
returns boolean
language sql
stable security definer set search_path = public
as $$
  select exists (
    select 1 from leagues l where l.id = _league_id and l.owner_id = auth.uid()
  ) or exists (
    select 1 from league_members m where m.league_id = _league_id and m.user_id = auth.uid()
  ) or is_site_admin(auth.uid());
$$;

-- Refresh the leagues SELECT policy to make the admin path explicit.
drop policy if exists "leagues select if member" on leagues;
create policy "leagues select if member" on leagues
  for select using (
    owner_id = auth.uid()
    or has_league_access(id)
    or is_site_admin(auth.uid())
  );

notify pgrst, 'reload schema';
