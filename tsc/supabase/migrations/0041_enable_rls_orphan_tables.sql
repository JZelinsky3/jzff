-- Four tables shipped without `enable row level security` because their
-- route handlers only touch them through the admin client. That reasoning
-- was wrong: Supabase grants anon SELECT/INSERT/UPDATE/DELETE through
-- PostgREST by default, and without RLS those grants don't filter
-- anything. Anyone with the public anon key (it lives in the browser
-- bundle) could hit /rest/v1/<table> directly and read or mutate rows.
--
-- Enabling RLS with zero policies denies all anon + authenticated access
-- via PostgREST while leaving the service-role admin client (which
-- bypasses RLS) untouched. No app behavior changes; the public REST
-- surface closes.

alter table weekly_lineups          enable row level security;
alter table sunday_live_frames      enable row level security;
alter table trade_desk_mock_trades  enable row level security;
alter table trade_desk_mock_votes   enable row level security;
