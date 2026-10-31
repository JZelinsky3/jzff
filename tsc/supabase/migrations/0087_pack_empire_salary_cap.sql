-- 0087_pack_empire_salary_cap.sql
--
-- Salary Cap joins the difficulties a Versus can be played on. Empire Builder's
-- board needs nothing: it's a new mode on game_runs, 'offense-cap', which isn't
-- blind, so it posts like Standard.

alter table pe_versus drop constraint if exists pe_versus_difficulty_check;
alter table pe_versus
  add constraint pe_versus_difficulty_check check (difficulty in ('open', 'range', 'season', 'cap'));
