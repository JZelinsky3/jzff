-- Add Instagram and Google to the canonical referral channels (0042).
-- Google covers both organic search and Google Ads clicks — we can't tell
-- them apart from a self-reported dropdown, and Display placements could
-- surface anywhere anyway.

alter table profiles
  drop constraint profiles_referral_source_chk;

alter table profiles
  add constraint profiles_referral_source_chk
  check (referral_source is null or referral_source in (
    'discord', 'reddit', 'twitter', 'facebook', 'instagram', 'google', 'ai', 'other'
  ));

-- Re-define handle_new_user so its defense-in-depth allowlist matches the
-- constraint. Otherwise a new signup picking Instagram would be silently
-- nulled out. Body otherwise identical to 0042.
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
  if ref_src is not null and ref_src not in ('discord','reddit','twitter','facebook','instagram','google','ai','other') then
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
