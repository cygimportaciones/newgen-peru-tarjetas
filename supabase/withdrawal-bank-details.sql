-- Ejecutar una sola vez si ya creaste las tablas de retiros.
alter table withdrawal_group_members add column if not exists bank_name text;
alter table withdrawal_group_members add column if not exists account_number text;
alter table withdrawal_group_members add column if not exists account_holder text;
