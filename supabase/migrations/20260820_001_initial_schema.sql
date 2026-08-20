create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.break_nights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  scheduled_for timestamptz,
  status text not null default 'draft' check (status in ('draft','live','completed')),
  created_at timestamptz not null default now()
);

create table public.breaks (
  id uuid primary key default gen_random_uuid(),
  break_night_id uuid not null references public.break_nights(id) on delete cascade,
  sequence_number integer not null,
  title text not null,
  format text not null default 'random_teams',
  total_spots integer not null check (total_spots > 0),
  price_per_spot numeric(10,2) not null default 0,
  currency text not null default 'EUR',
  status text not null default 'open' check (status in ('draft','open','full','randomized','completed')),
  created_at timestamptz not null default now(),
  unique (break_night_id, sequence_number)
);

create table public.spots (
  id uuid primary key default gen_random_uuid(),
  break_id uuid not null references public.breaks(id) on delete cascade,
  spot_number integer not null,
  buyer_name text,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','partial','comped')),
  amount_paid numeric(10,2) not null default 0,
  assignment text,
  created_at timestamptz not null default now(),
  unique (break_id, spot_number)
);

create table public.randomizations (
  id uuid primary key default gen_random_uuid(),
  break_id uuid not null references public.breaks(id) on delete cascade,
  verification_code text not null unique,
  input_snapshot jsonb not null,
  result_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table public.giveaways (
  id uuid primary key default gen_random_uuid(),
  break_night_id uuid not null references public.break_nights(id) on delete cascade,
  break_id uuid references public.breaks(id) on delete set null,
  prize text not null,
  eligible_entries jsonb not null,
  winner jsonb not null,
  verification_code text not null unique,
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
alter table public.break_nights enable row level security;
alter table public.breaks enable row level security;
alter table public.spots enable row level security;
alter table public.randomizations enable row level security;
alter table public.giveaways enable row level security;

create policy "owners manage organizations" on public.organizations
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "owners manage break nights" on public.break_nights
for all using (exists (select 1 from public.organizations o where o.id = organization_id and o.owner_id = auth.uid()))
with check (exists (select 1 from public.organizations o where o.id = organization_id and o.owner_id = auth.uid()));

create policy "owners manage breaks" on public.breaks
for all using (exists (select 1 from public.break_nights n join public.organizations o on o.id = n.organization_id where n.id = break_night_id and o.owner_id = auth.uid()))
with check (exists (select 1 from public.break_nights n join public.organizations o on o.id = n.organization_id where n.id = break_night_id and o.owner_id = auth.uid()));

create policy "owners manage spots" on public.spots
for all using (exists (select 1 from public.breaks b join public.break_nights n on n.id = b.break_night_id join public.organizations o on o.id = n.organization_id where b.id = break_id and o.owner_id = auth.uid()))
with check (exists (select 1 from public.breaks b join public.break_nights n on n.id = b.break_night_id join public.organizations o on o.id = n.organization_id where b.id = break_id and o.owner_id = auth.uid()));

create policy "owners manage randomizations" on public.randomizations
for all using (exists (select 1 from public.breaks b join public.break_nights n on n.id = b.break_night_id join public.organizations o on o.id = n.organization_id where b.id = break_id and o.owner_id = auth.uid()))
with check (exists (select 1 from public.breaks b join public.break_nights n on n.id = b.break_night_id join public.organizations o on o.id = n.organization_id where b.id = break_id and o.owner_id = auth.uid()));

create policy "owners manage giveaways" on public.giveaways
for all using (exists (select 1 from public.break_nights n join public.organizations o on o.id = n.organization_id where n.id = break_night_id and o.owner_id = auth.uid()))
with check (exists (select 1 from public.break_nights n join public.organizations o on o.id = n.organization_id where n.id = break_night_id and o.owner_id = auth.uid()));
