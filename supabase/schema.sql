-- NewgenPeru Préstamos: esquema inicial
create table if not exists loan_clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  dni text unique,
  birth_date date,
  work_condition text,
  job_start_date date,
  job_title text,
  organization_unit text,
  created_at timestamptz not null default now()
);

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references loan_clients(id) on delete cascade,
  card_reference text,
  last_four_digits char(4) not null,
  bank text,
  web_code text,
  status text not null default 'active' check (status in ('active', 'incident', 'inactive')),
  created_at timestamptz not null default now()
);

create table if not exists loans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references loan_clients(id) on delete cascade,
  card_id uuid references cards(id) on delete set null,
  capital numeric(12,2) not null default 0,
  interest_rate numeric(6,4) not null default 0,
  interest_amount numeric(12,2) not null default 0,
  remaining_amount numeric(12,2) not null default 0,
  payment_date date,
  month_label text not null,
  status text not null default 'active' check (status in ('active', 'paid', 'overdue')),
  created_at timestamptz not null default now()
);

create table if not exists client_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references loan_clients(id) on delete cascade,
  bank text,
  account_number text,
  account_holder text,
  created_at timestamptz not null default now()
);

create table if not exists loan_payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references loans(id) on delete cascade,
  amount numeric(12,2) not null,
  payment_date date not null default current_date,
  deposit_reference text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists card_incidents (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards(id) on delete cascade,
  note text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
