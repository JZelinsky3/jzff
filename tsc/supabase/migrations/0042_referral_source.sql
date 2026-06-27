-- Capture how new accounts heard about TSC. Optional field on the signup
-- form (Discord / Reddit / Twitter/X / Facebook / AI / Other-with-text).
-- Stored on profiles so it's queryable in admin without paging through
-- auth.users.raw_user_meta_data. Existing users can fill it in later from
-- the /account page, so the column stays nullable.

alter table profiles
  add column referral_source       text,
  add column referral_source_other text;

-- Constrain the canonical channel values so a typo can't sneak in. Free-form
-- detail (e.g. "TikTok", "friend recommended") goes in referral_source_other
-- regardless of which channel is picked — it's a complement, not a substitute.
alter table profiles
  add constraint profiles_referral_source_chk
  check (referral_source is null or referral_source in (
    'discord', 'reddit', 'twitter', 'facebook', 'ai', 'other'
  ));

-- Re-defining handle_new_user so the trigger persists the optional referral
-- fields the signup form passes via supabase.auth.signUp({ options: { data }}).
-- Same member_code generation as 0030 — we keep the loop here so the insert
-- still lands in one round-trip.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  candidate text;
  attempts int := 0;
  ref_src   text;
  ref_other text;
begin
  -- Pull optional referral metadata. Null/empty stays null.
  ref_src   := nullif(new.raw_user_meta_data->>'referral_source', '');
  ref_other := nullif(new.raw_user_meta_data->>'referral_source_other', '');
  -- Defense in depth — the column CHECK will also catch bad values, but
  -- silently dropping an unknown channel keeps signup succeeding.
  if ref_src is not null and ref_src not in ('discord','reddit','twitter','facebook','ai','other') then
    ref_src := null;
  end if;

  loop
    candidate := gen_member_code();
    begin
      insert into profiles (id, display_name, member_code, referral_source, referral_source_other)
      values (
        new.id,
        coalesce(new.raw_user_meta_data->>'full_name', new.email),
        candidate,
        ref_src,
        ref_other
      );
      return new;
    exception when unique_violation then
      attempts := attempts + 1;
      if attempts > 12 then
        raise exception 'could not generate unique member_code on signup after % attempts', attempts;
      end if;
    end;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
