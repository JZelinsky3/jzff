-- 0035_trade_desk_settings.sql
-- Per-league Trade Desk settings. Stored as JSONB so the shape can evolve
-- (TE premium, scoring profile, roster slot overrides) without one
-- migration per knob.
--
-- All fields are commish overrides on top of platform auto-detection.
-- NULL inside the JSON means "trust the auto-detect"; only explicit
-- values are honored as overrides. See src/lib/tradeDesk/settings.ts for
-- the canonical shape + defaults + merge logic.
--
-- Reads: anyone viewing the league hub can read these (drawer is
-- read-only for viewers, editable for owner/editor — gated in the API
-- layer, not via RLS).
-- Writes: only the route handler (admin client) writes this column, and
-- only after the owner/editor check passes.

alter table leagues
  add column if not exists trade_desk_settings jsonb;

comment on column leagues.trade_desk_settings is
  'Commish overrides for the Trade Desk. NULL = use platform auto-detect for everything. See src/lib/tradeDesk/settings.ts for shape.';

notify pgrst, 'reload schema';
