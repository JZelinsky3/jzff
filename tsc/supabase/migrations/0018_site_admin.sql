-- 0018_site_admin.sql
-- Site-wide administrator role and DB-backed comp grants.
--
-- site_admins: tiny allowlist of auth.users who can see all leagues/profiles
-- through the /admin route. Membership is service-role only; users cannot
-- promote themselves.
--
-- comp_grants: DB-controlled twin of LIFETIME_USER_IDS (env). A row here means
-- the user has comped/unlimited access without a Stripe subscription. Lets a
-- site admin grant free access from inside the app instead of editing env vars
-- and redeploying. The Stripe-side gating helpers OR these two sources
-- together (see lib/stripe.ts → isCompUser).

create table if not exists site_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists comp_grants (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  note       text,
  created_at timestamptz not null default now()
);

alter table site_admins enable row level security;
alter table comp_grants enable row level security;

-- Users can read their own admin/comp row (so the client knows whether to
-- show the /admin link / comp badge). Writes are service-role only.
create policy "site_admins self read"
  on site_admins for select
  using (auth.uid() = user_id);

create policy "comp_grants self read"
  on comp_grants for select
  using (auth.uid() = user_id);

-- SQL helper mirroring the TS isSiteAdmin() — kept around for future RLS
-- policies that want to grant site admins blanket SELECT on other tables.
create or replace function is_site_admin(_user_id uuid)
returns boolean
language sql
stable security definer set search_path = public
as $$
  select exists (select 1 from site_admins where user_id = _user_id);
$$;

-- Seed: bootstrap the founding admin by email so the migration is self-
-- sufficient. Idempotent — re-runs no-op if the row exists. If the auth user
-- doesn't exist yet (fresh DB), the select returns zero rows and nothing is
-- inserted; the admin can be added later via SQL editor.
insert into site_admins (user_id)
select id from auth.users
where email in ('zelinskyjoey18@gmail.com', 'jzffgames@gmail.com')
on conflict (user_id) do nothing;

notify pgrst, 'reload schema';
