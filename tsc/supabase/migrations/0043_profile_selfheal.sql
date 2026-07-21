-- 0043_profile_selfheal.sql
-- Fix: Clubhouse Trade Room posts and sign/shred votes failed for any account
-- with no profiles row —
--   "insert or update on table hub_trades violates foreign key constraint
--    hub_trades_owner_id_fkey"
-- hub_trades.owner_id and hub_trade_votes.user_id both reference profiles(id).
-- Profiles were only ever created by the on_auth_user_created trigger (0001),
-- so any account that predated the trigger or where it failed (some OAuth
-- signups) has no profile and can't post or vote. There was also no INSERT
-- policy on profiles, so the app had no way to create the missing row.
--
-- This migration:
--   1. Backfills a profile for every auth user that's missing one.
--   2. Adds an ensure_profile() RPC the API calls to create the caller's own
--      profile on the fly (defense in depth — see the publish/vote routes).
--      A security-definer RPC (not a client insert) because member_code is
--      NOT NULL + unique and has to be generated server-side.

-- 1. Backfill. Mirror handle_new_user()'s member_code generation (profiles
-- .member_code is NOT NULL + unique, 0030) with the same collision retry.
do $$
declare
  u record;
  candidate text;
  attempts int;
begin
  for u in
    select id, coalesce(raw_user_meta_data->>'full_name', email) as name
    from auth.users
    where not exists (select 1 from profiles p where p.id = auth.users.id)
  loop
    attempts := 0;
    loop
      candidate := gen_member_code();
      begin
        insert into profiles (id, display_name, member_code)
        values (u.id, u.name, candidate);
        exit;
      exception when unique_violation then
        attempts := attempts + 1;
        if attempts > 12 then
          raise exception 'could not generate unique member_code for %', u.id;
        end if;
      end;
    end loop;
  end loop;
end$$;

-- 2. ensure_profile(): create the *calling* user's profile if it's missing,
-- generating member_code the same way handle_new_user() does. Security definer
-- so it can write past RLS, but it only ever touches auth.uid()'s own row, so
-- a member can't create or overwrite anyone else's profile.
create or replace function ensure_profile()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  candidate text;
  attempts int := 0;
begin
  if uid is null then return; end if;
  if exists (select 1 from profiles where id = uid) then return; end if;

  loop
    candidate := gen_member_code();
    begin
      insert into profiles (id, display_name, member_code)
      select uid, coalesce(u.raw_user_meta_data->>'full_name', u.email), candidate
      from auth.users u where u.id = uid;
      return;
    exception
      when unique_violation then
        -- member_code collision → retry; a race that already created the
        -- profile (id conflict) → we're done.
        if exists (select 1 from profiles where id = uid) then return; end if;
        attempts := attempts + 1;
        if attempts > 12 then
          raise exception 'could not generate unique member_code for %', uid;
        end if;
    end;
  end loop;
end$$;

grant execute on function ensure_profile() to authenticated;

notify pgrst, 'reload schema';
