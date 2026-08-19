-- Ejecutar este archivo una sola vez en Supabase SQL Editor.
create table if not exists withdrawal_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  organization_name text not null,
  group_number text not null,
  period_label text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, organization_name, group_number, period_label)
);

create table if not exists withdrawal_group_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  withdrawal_group_id uuid not null references withdrawal_groups(id) on delete cascade,
  full_name text not null,
  card_group_number text,
  dni text,
  card_key text,
  bank_name text,
  account_number text,
  account_holder text,
  source_row integer,
  created_at timestamptz not null default now()
);

alter table withdrawal_groups enable row level security;
alter table withdrawal_group_members enable row level security;

drop policy if exists "owners manage withdrawal groups" on withdrawal_groups;
drop policy if exists "owners manage withdrawal members" on withdrawal_group_members;

create policy "owners manage withdrawal groups" on withdrawal_groups for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners manage withdrawal members" on withdrawal_group_members for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
