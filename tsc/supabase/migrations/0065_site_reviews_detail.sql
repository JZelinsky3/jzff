-- 0065_site_reviews_detail.sql
-- More than one number per review.
--
-- The original form asked for a single overall rating plus two prose boxes.
-- That tells you whether someone liked it, not which part they liked, and
-- the two questions that actually change what gets built next -- "does it
-- look right" and "could you find anything" -- were buried inside free text
-- that most people leave blank.
--
-- Four sub-ratings, all nullable and all optional in the form: a review with
-- only the overall star is still a complete review. NULL here means "not
-- answered", which is why none of these get a default. Same numeric(2,1) +
-- half-step check as the overall rating so 4.5 stays exact and the columns
-- can be averaged against each other without unit drift.

alter table site_reviews
  add column if not exists rating_design     numeric(2,1),
  add column if not exists rating_navigation numeric(2,1),
  add column if not exists rating_speed      numeric(2,1),
  add column if not exists rating_value      numeric(2,1),
  -- Which surfaces they actually opened. Free-form text[] rather than an
  -- enum: the option list on the form will change as pages ship, and a
  -- retired option should stay readable in old rows instead of blocking a
  -- migration.
  add column if not exists used_areas        text[],
  -- Which single part they liked most and least. The checklist above says
  -- what got opened; these two say how the sections rank against each other,
  -- which is the answer that decides what gets built next.
  add column if not exists favorite_area       text,
  add column if not exists least_favorite_area text,
  -- "Anything you wanted that isn't there." Kept apart from needs_work:
  -- a missing feature is a roadmap item, a broken page is a bug.
  add column if not exists wish              text;

-- One constraint per column instead of a shared one, so a bad value names
-- the field it came from. Dropped first so the whole file stays re-runnable.
do $$
declare col text;
begin
  foreach col in array array['rating_design', 'rating_navigation', 'rating_speed', 'rating_value']
  loop
    execute format('alter table site_reviews drop constraint if exists site_reviews_%s_chk', col);
    execute format(
      'alter table site_reviews add constraint site_reviews_%s_chk
         check (%I is null or (%I >= 1.0 and %I <= 5.0 and (%I * 2) = floor(%I * 2)))',
      col, col, col, col, col, col
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
