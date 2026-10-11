-- Threads as a "where did you hear about us" channel.
--
-- The site has posted to Threads daily since 2026-10-03 (lib/social), and its
-- text posts reach 1-3k people each, so it's a real channel now. Until this,
-- anyone who came from it had to pick Other. Twitter / X was already there.
--
-- Same two places as 0060: the column CHECK, and handle_new_user's allowlist,
-- which would otherwise null a Threads pick at signup. Body otherwise
-- identical to 0060 (checked against the live function 2026-10-10).

alter table profiles
  drop constraint profiles_referral_source_chk;

alter table profiles
  add constraint profiles_referral_source_chk
  check (referral_source is null or referral_source in (
    'chatgpt', 'ai', 'google', 'bing', 'youtube',
    'discord', 'reddit', 'twitter', 'threads', 'facebook', 'instagram', 'other'
  ));

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
  if ref_src is not null and ref_src not in (
    'chatgpt','ai','google','bing','youtube',
    'discord','reddit','twitter','threads','facebook','instagram','other'
  ) then
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
