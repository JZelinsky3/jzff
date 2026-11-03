-- 0104_pack_empire_league_redraft.sql
--
-- Mulligans by depth (2026-11-02): the bottom half of the table gets one, the
-- bottom quarter two, and the second is the redraft: once every pack is open,
-- one slot goes back and its pack is opened again. A count replaces the yes/no
-- from 0103, which stays for rows that were set before this.

alter table pe_league_members add column if not exists mulligans int not null default 0;
update pe_league_members set mulligans = 1 where mulligan and mulligans = 0;

-- The slot redrafted this week, and the pack and card thrown back for it.
alter table pe_league_drafts add column if not exists redraft_slot int;
alter table pe_league_drafts add column if not exists redraft_thrown jsonb;
