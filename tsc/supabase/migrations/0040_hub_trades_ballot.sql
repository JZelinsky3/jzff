-- 0040_hub_trades_ballot.sql
-- Corrective pass on 0039, which was applied before the Trade Room design
-- settled. Two changes:
--
--   1. Votes moved from Side A / Fair / Side B to the Rumor Mill's
--      sign/shred ballot. Any rows cast under the old scheme (almost
--      certainly zero — the feature hadn't shipped) don't map onto the
--      new semantics, so they're dropped rather than guessed at.
--   2. Roster-aware analyses now store the hand-entered rosters
--      (name/position only) so the docket can render team trades with
--      their context.

delete from hub_trade_votes where vote not in ('sign','shred');

alter table hub_trade_votes
  drop constraint if exists hub_trade_votes_vote_check;
alter table hub_trade_votes
  add constraint hub_trade_votes_vote_check
  check (vote in ('sign','shred'));

alter table hub_trades
  add column if not exists roster_a jsonb,
  add column if not exists roster_b jsonb;

notify pgrst, 'reload schema';
