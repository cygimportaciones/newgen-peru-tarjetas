-- Ejecutar una sola vez si ya creaste withdrawal_member_actions antes.
alter table withdrawal_member_actions drop constraint if exists withdrawal_member_actions_action_type_check;
alter table withdrawal_member_actions add constraint withdrawal_member_actions_action_type_check
  check (action_type in ('sent', 'bank_unrecognized', 'missing'));
