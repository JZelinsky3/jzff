-- 0102_pack_empire_league_cpu.sql
--
-- CPU teams in League Mode. The commissioner adds them before the season to
-- fill seats (or every seat but their own). A CPU team has no account, so
-- user_id goes nullable on the members and on their drafts; is_cpu says so,
-- and the check keeps the two in step. unique (league_id, user_id) lets any
-- number of nulls through, which is what a league of CPUs needs.
-- Additive: every existing row has a user and is_cpu false.

alter table pe_league_members alter column user_id drop not null;
alter table pe_league_members add column if not exists is_cpu boolean not null default false;
alter table pe_league_members drop constraint if exists pe_league_members_cpu_check;
alter table pe_league_members add constraint pe_league_members_cpu_check check (is_cpu = (user_id is null));

alter table pe_league_drafts alter column user_id drop not null;
