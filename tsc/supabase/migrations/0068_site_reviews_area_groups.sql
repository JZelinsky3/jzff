-- 0068_site_reviews_area_groups.sql
-- Favourite / least favourite become lists, over groups instead of pages.
--
-- The form used to ask three questions off one list of eight page names:
-- which did you use (many), favourite (one), least favourite (one). Half
-- those options were a single screen each, so "favourite" collected trivia,
-- and nobody has exactly one of either.
--
-- Now it asks two questions over five section groups -- the whole thing,
-- History, Live Season, Trade Desk, Games -- and takes as many answers as
-- someone wants for each. text[] for the same reason used_areas is: the
-- groups will get renamed as the site grows, and a retired name has to stay
-- readable in old rows rather than block a migration.
--
-- The singular favorite_area / least_favorite_area columns stay exactly as
-- they are. They hold every review collected before this, the admin reader
-- falls back to them per row, and dropping them would delete answers.

alter table site_reviews
  add column if not exists favorite_areas       text[],
  add column if not exists least_favorite_areas text[];

notify pgrst, 'reload schema';
