-- The Daily with no account (Joey, 2026-10-31): a browser keeps its one try off a
-- long-lived cookie, and a name goes on at the end. Clearing cookies or a private
-- window gets you another go, which is no different from a second account.
--
-- A run belongs to an account or a guest, so user_id can't be in the primary key
-- any more. The two partial indexes are the same one-run-a-day rule the key was,
-- and raise the same 23505, so nothing that writes here has to know about guests.

alter table pe_daily_runs add column if not exists id uuid not null default gen_random_uuid();
-- pe-seat sha256 of the cookie (see people.ts hashKey), never the cookie itself.
alter table pe_daily_runs add column if not exists guest_key text;

alter table pe_daily_runs drop constraint if exists pe_daily_runs_pkey;
alter table pe_daily_runs add primary key (id);
alter table pe_daily_runs alter column user_id drop not null;

alter table pe_daily_runs drop constraint if exists pe_daily_runs_owner_check;
alter table pe_daily_runs add constraint pe_daily_runs_owner_check check ((user_id is null) <> (guest_key is null));

create unique index if not exists pe_daily_one_run_user
  on pe_daily_runs (day, version, user_id) where user_id is not null;
create unique index if not exists pe_daily_one_run_guest
  on pe_daily_runs (day, version, guest_key) where guest_key is not null;
