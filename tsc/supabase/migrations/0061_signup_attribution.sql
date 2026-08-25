-- ============================================================
-- SIGNUP ATTRIBUTION
--
-- Two problems this solves.
--
-- 1. Paid and organic Instagram are indistinguishable in referrer data —
--    ad clicks, bio-link taps and organic posts all arrive as
--    l.instagram.com. Without a campaign tag there is no way to tell whether
--    ad spend produced a signup. utm_* columns fix that, and Vercel's UTM
--    reporting is Pro-only so this has to live in our own table anyway.
--
-- 2. referral_source is self-reported and structurally blind: 87% of accounts
--    sign up with Google, and those people answer the dropdown 20% of the
--    time because it sits inside the email/password form they skip past.
--    first_referrer is captured automatically and needs nobody to fill
--    anything in, so chatgpt.com / bing.com signups become countable.
--
-- All five are FIRST-TOUCH and write-once: the capture route only fills a
-- column that is still null. Someone who arrives from an Instagram ad, leaves,
-- and comes back a week later via Google search stays attributed to the ad
-- that actually found them.
--
-- referral_prompt_dismissed_at backs the one-time dashboard prompt. Null and
-- a null referral_source means "still worth asking"; any value means the user
-- either answered or waved it off, and we never ask again.
-- ============================================================

alter table profiles
  add column utm_source     text,
  add column utm_medium     text,
  add column utm_campaign   text,
  -- document.referrer at first landing, host only (no path, no query — we do
  -- not want to store where on chatgpt.com someone came from, just that they
  -- did). Null for direct traffic.
  add column first_referrer text,
  add column referral_prompt_dismissed_at timestamptz;

-- Cheap partial index: the admin breakdown groups by source, and every query
-- that cares filters out the nulls anyway.
create index profiles_utm_source_idx on profiles (utm_source)
  where utm_source is not null;
create index profiles_first_referrer_idx on profiles (first_referrer)
  where first_referrer is not null;

notify pgrst, 'reload schema';
