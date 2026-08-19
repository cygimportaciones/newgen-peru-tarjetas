import { supabase } from './supabase'
import type { WithdrawalMember } from './import-withdrawals'

export type WithdrawalActionType = 'sent' | 'bank_unrecognized' | 'missing'

export type WithdrawalMemberAction = {
  id: string
  groupId: string
  sourceRow: number
  fullName: string
  cardNumber: string
  dni: string
  cardKey: string
  actionType: WithdrawalActionType
  createdAt: string
}

export async function loadWithdrawalMemberActions(): Promise<WithdrawalMemberAction[]> {
  const { data, error } = await supabase
    .from('withdrawal_member_actions')
    .select('id, withdrawal_group_id, source_row, full_name, card_group_number, dni, card_key, action_type, created_at')
    .order('created_at', { ascending: false })

  if (error) throw error

  return data.map(action => ({
    id: action.id,
    groupId: action.withdrawal_group_id,
    sourceRow: action.source_row,
    fullName: action.full_name,
    cardNumber: action.card_group_number ?? '',
    dni: action.dni ?? '',
    cardKey: action.card_key ?? '',
    actionType: action.action_type as WithdrawalActionType,
    createdAt: action.created_at,
  }))
}

export async function saveWithdrawalMemberAction(groupId: string, member: WithdrawalMember, actionType: WithdrawalActionType) {
  const { error } = await supabase
    .from('withdrawal_member_actions')
    .upsert({
      withdrawal_group_id: groupId,
      source_row: member.sourceRow,
      full_name: member.fullName,
      card_group_number: member.cardNumber || null,
      dni: member.dni || null,
      card_key: member.cardKey || null,
      action_type: actionType,
    }, { onConflict: 'owner_id,withdrawal_group_id,source_row' })

  if (error) throw error
}

export async function deleteWithdrawalMemberAction(actionId: string) {
  const { error } = await supabase.from('withdrawal_member_actions').delete().eq('id', actionId)
  if (error) throw error
}
