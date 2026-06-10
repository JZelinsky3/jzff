-- 0038_league_promotion.sql
-- Newsstand promotion: commissioners can opt a PUBLISHED league onto the
-- Clubhouse Newsstand's "On the market" board with a short pitch and an
-- optional recruiting link (league invite, Discord, email, etc.).
--
--   promoted_at — null = not promoted. Set when the owner opts in; cleared
--                 when they take it down. Doubles as the board sort key.
--   promo_text  — the pitch, capped at 280 chars.
--   promo_link  — optional http(s) URL for "looking for managers" contact.
--
-- No new RLS needed: writes go through the existing "leagues update if
-- owner" policy via the user's own client; the public board reads through
-- the admin client and filters on published_at + promoted_at.

alter table leagues
  add column if not exists promoted_at timestamptz,
  add column if not exists promo_text  text,
  add column if not exists promo_link  text;

alter table leagues drop constraint if exists leagues_promo_text_len;
alter table leagues add constraint leagues_promo_text_len
  check (promo_text is null or char_length(promo_text) <= 280);

alter table leagues drop constraint if exists leagues_promo_link_len;
alter table leagues add constraint leagues_promo_link_len
  check (promo_link is null or char_length(promo_link) <= 300);

create index if not exists leagues_promoted_idx
  on leagues(promoted_at desc)
  where promoted_at is not null;
