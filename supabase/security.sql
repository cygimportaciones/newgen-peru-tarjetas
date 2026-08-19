-- Ejecutar después de schema.sql en Supabase SQL Editor.
alter table loan_clients enable row level security;
alter table cards enable row level security;
alter table loans enable row level security;
alter table client_accounts enable row level security;
alter table loan_payments enable row level security;
alter table card_incidents enable row level security;

create policy "authenticated users manage clients" on loan_clients for all to authenticated using (true) with check (true);
create policy "authenticated users manage cards" on cards for all to authenticated using (true) with check (true);
create policy "authenticated users manage loans" on loans for all to authenticated using (true) with check (true);
create policy "authenticated users manage accounts" on client_accounts for all to authenticated using (true) with check (true);
create policy "authenticated users manage payments" on loan_payments for all to authenticated using (true) with check (true);
create policy "authenticated users manage incidents" on card_incidents for all to authenticated using (true) with check (true);
