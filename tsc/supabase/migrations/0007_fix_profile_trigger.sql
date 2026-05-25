-- Fix the ensure_manager_profile trigger introduced in 0006.
--
-- Bug: BEFORE INSERT triggers fire even when the row will conflict-update
-- (Postgres semantics). The previous trigger generated a fresh profile_id
-- on every upsert and the ON CONFLICT DO UPDATE then re-pointed the
-- existing manager.profile_id to the new profile — leaving the previous
-- profile orphaned. After many syncs, manager_profiles fills with one
-- ghost row per (manager × sync).
--
-- Fix: trigger now looks up the existing manager by (league_id, external_id);
-- if found, preserves its current profile_id. Only truly-new managers get a
-- freshly created profile.

create or replace function ensure_manager_profile()
returns trigger as $$
declare
  pid uuid;
  existing_pid uuid;
begin
  -- Upsert with conflict on (league_id, external_id): grab the existing
  -- manager's profile_id and use it, so we don't create a duplicate.
  if new.external_id is not null then
    select profile_id into existing_pid
    from managers
    where league_id = new.league_id and external_id = new.external_id
    limit 1;
    if existing_pid is not null then
      new.profile_id := existing_pid;
      return new;
    end if;
  end if;

  -- Truly new manager (no existing row with this league_id+external_id).
  if new.profile_id is null then
    insert into manager_profiles (league_id, canonical_name)
    values (new.league_id, coalesce(new.display_name, 'Unknown'))
    returning id into pid;
    new.profile_id := pid;
  end if;
  return new;
end$$ language plpgsql;

-- Clean up: remove any profile that no manager points to.
delete from manager_profiles mp
where not exists (
  select 1 from managers m where m.profile_id = mp.id
);

-- New: free-form prize pool note shown on the public almanac.
alter table leagues
  add column if not exists prize_pool text;

notify pgrst, 'reload schema';
