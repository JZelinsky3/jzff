-- Fires the social publisher from Postgres, on the minute.
--
-- GitHub Actions starts the hourly social-publish run hours late or not at
-- all (2026-10-06: 5 of 15 hourly runs started; the 8am post went out at
-- 2:29pm). pg_cron runs inside the database on time, and pg_net makes the
-- HTTP call. The GitHub schedule stays as a backup: publishDue claims each
-- post before sending, so two runs at once can't double-post.
--
-- BEFORE RUNNING: put the real CRON_SECRET (Vercel > Settings > Environment
-- Variables) in place of the placeholder in step 2. It goes into Supabase
-- Vault, not into this file or the cron job text.

-- 1. Extensions (Supabase ships both; this just switches them on).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. The secret. Run once. To change it later:
--    select vault.update_secret((select id from vault.secrets where name = 'cron_secret'), '<new>');
select vault.create_secret('PASTE_CRON_SECRET_HERE', 'cron_secret');

-- 3. Every hour at :02. Posts are slotted on the hour, so they land two
-- minutes late. All 24 hours: a run with nothing due does nothing.
select cron.unschedule('social-publish')
where exists (select 1 from cron.job where jobname = 'social-publish');

select cron.schedule(
  'social-publish',
  '2 * * * *',
  $$
  select net.http_get(
    url := 'https://thesundaychronicle.app/api/cron/social-publish/',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 120000
  );
  $$
);

-- Check it is firing (after the next :02):
--   select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'social-publish')
--   order by start_time desc limit 5;
-- and the HTTP result (401 means the secret is wrong):
--   select status_code, left(content::text, 200), created from net._http_response
--   order by created desc limit 5;
