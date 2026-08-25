-- Split the catch-all 'ai' channel and add the search engines that actually
-- show up in referrer data.
--
-- Web Analytics (enabled 2026-08-25) showed that of ~45 genuine external
-- arrivals in a week, chatgpt.com drove 44%, bing.com 22% and google.com 18%.
-- The dropdown collapsed all of that into one 'ai' option plus 'google', so
-- the single biggest acquisition channel was invisible in self-reported data:
-- seven people had ever picked 'ai' while ChatGPT alone sent 20 visitors in
-- one week.
--
-- 'ai' is KEPT rather than migrated. The seven existing rows genuinely mean
-- "some AI assistant" and we cannot retroactively tell which, so 'ai' now
-- means "an AI other than ChatGPT" going forward and old rows stay honest.
--
-- New: chatgpt, bing, youtube. youtube also appeared in referrers and is not
-- otherwise capturable, since a video description sends no useful referrer
-- once someone retypes the URL.

alter table profiles
  drop constraint profiles_referral_source_chk;

alter table profiles
  add constraint profiles_referral_source_chk
  check (referral_source is null or referral_source in (
    'chatgpt', 'ai', 'google', 'bing', 'youtube',
    'discord', 'reddit', 'twitter', 'facebook', 'instagram', 'other'
  ));

-- Re-define handle_new_user so its defense-in-depth allowlist matches the
-- constraint. Otherwise a new signup picking ChatGPT would be silently
-- nulled out. Body otherwise identical to 0047.
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
    'discord','reddit','twitter','facebook','instagram','other'
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
