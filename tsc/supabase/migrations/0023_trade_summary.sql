-- 0023_trade_summary.sql
-- Trade-level AI summary: one combined 3-4 sentence recap per trade,
-- replacing the per-side blurbs we shipped in Phase 2. trade_grades.grade
-- still holds the per-side letter (A-/B+/etc.); the prose moves up to the
-- trade itself so the UI can render one recap above the sides.
--
-- Per-side trade_grades.blurb is kept for backwards compatibility with
-- any rows graded under the Phase 2 prompt — new grades leave it null
-- and the public page reads ai_summary first.

alter table trades
  add column if not exists ai_summary       text,
  add column if not exists ai_summary_model text,
  add column if not exists ai_summary_at    timestamptz;

notify pgrst, 'reload schema';
