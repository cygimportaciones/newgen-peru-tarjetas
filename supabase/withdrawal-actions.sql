-- Ejecutar una sola vez en Supabase SQL Editor.
-- Guarda acciones por persona de los grupos importados: enviadas o incidencias.
create table if not exists withdrawal_member_actions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  withdrawal_group_id uuid not null references withdrawal_groups(id) on delete cascade,
  source_row integer not null,
  full_name text not null,
  card_group_number text,
  dni text,
  card_key text,
  action_type text not null check (action_type in ('sent', 'bank_unrecognized', 'missing')),
  created_at timestamptz not null default now(),
  unique(owner_id, withdrawal_group_id, source_row)
);

alter table withdrawal_member_actions enable row level security;
drop policy if exists "owners manage withdrawal member actions" on withdrawal_member_actions;
create policy "owners manage withdrawal member actions" on withdrawal_member_actions
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
