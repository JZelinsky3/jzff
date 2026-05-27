-- 0024_trade_revisit_summary.sql
-- Trade-level revisit summary (the "Verdict" — 4 weeks after the original
-- grade). Mirrors the ai_summary columns from 0023 but for the revisit
-- pass. Per-side trade_grades.revisit_grade still holds the letter; the
-- revisit prose lives here.

alter table trades
  add column if not exists revisit_summary text,
  add column if not exists revisit_model   text,
  add column if not exists revisited_at    timestamptz;

create index if not exists trades_revisited_at_idx on trades(revisited_at desc) where revisited_at is not null;

notify pgrst, 'reload schema';
