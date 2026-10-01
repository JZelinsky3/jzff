-- League mailing lists for the weekly recap. Anyone in a league can add
-- their own address at the bottom of a recap page and get the paper every
-- Tuesday, the same email the commissioner gets, without needing an account
-- or the commissioner to forward it.
--
-- Double opt-in: a signup is 'pending' until the address owner presses the
-- button on the confirmation page. Nothing but that one confirmation email
-- ever goes to a pending address, so typing somebody else's address in only
-- ever sends them one email they can ignore.

create table if not exists recap_subscribers (
  id               uuid primary key default gen_random_uuid(),
  league_id        uuid not null references leagues(id) on delete cascade,
  email            text not null,
  status           text not null default 'pending' check (status in ('pending', 'active', 'unsubscribed')),
  confirm_sent_at  timestamptz,
  confirmed_at     timestamptz,
  unsubscribed_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (league_id, email)
);

create index if not exists recap_subscribers_active_idx on recap_subscribers (league_id) where status = 'active';
create index if not exists recap_subscribers_created_idx on recap_subscribers (created_at desc);

-- Subscriber sends go in the same log as the commissioner's. A row is one
-- or the other: user_id for the owner, subscriber_id for a list member. The
-- second unique pair is what keeps a subscriber to one copy per recap, the
-- same way (recap_id, user_id) does for the owner. Postgres treats NULLs as
-- distinct, so the two constraints never trip over each other.
alter table recap_sends alter column user_id drop not null;
alter table recap_sends add column if not exists subscriber_id uuid references recap_subscribers(id) on delete cascade;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recap_sends_recap_subscriber_key') then
    alter table recap_sends add constraint recap_sends_recap_subscriber_key unique (recap_id, subscriber_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recap_sends_one_recipient') then
    alter table recap_sends add constraint recap_sends_one_recipient check ((user_id is null) <> (subscriber_id is null));
  end if;
end $$;

-- Service role only, like the rest of the recap tables.
alter table recap_subscribers enable row level security;

notify pgrst, 'reload schema';
