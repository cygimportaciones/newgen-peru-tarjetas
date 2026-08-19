import * as XLSX from 'xlsx'
import { supabase } from './supabase'

export type WithdrawalMember = { fullName: string; cardNumber: string; dni: string; cardKey: string; bankName: string; accountNumber: string; accountHolder: string; sourceRow: number }
export type WithdrawalGroup = { organizationName: string; groupNumber: string; members: WithdrawalMember[] }
export type RegisteredWithdrawalGroup = { id: string; organizationName: string; groupNumber: string; periodLabel: string }

const text = (value: unknown) => String(value ?? '').trim()
const normalized = (value: unknown) => text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export async function readWithdrawalGroups(file: File): Promise<WithdrawalGroup[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellStyles: true })
  const withdrawalSheets = workbook.SheetNames.filter(name => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: '', blankrows: true, raw: true })
    return rows.some(row => row.some(cell => normalized(cell).includes('apellidos nombres')))
  })
  const sheetName = withdrawalSheets.find(name => normalized(name) === 'hoja2') ?? withdrawalSheets[0]
  if (!sheetName) throw new Error('No se encontró una hoja con la columna “Apellidos nombres”.')

  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: true, raw: true })
  const headerIndex = rows.findIndex(row => row.some(cell => normalized(cell).includes('apellidos nombres')))
  const headers = rows[headerIndex].map(normalized)
  const index = (names: string[]) => headers.findIndex(header => names.some(name => header.includes(name)))
  const nameIndex = index(['apellidos nombres'])
  const cardIndex = index(['nº tjta', 'n° tjta', 'no tjta'])
  const dniIndex = index(['dni'])
  const keyIndex = index(['clave'])
  const bankIndex = index(['banco', 'entidad financiera'])
  const accountIndex = index(['numero de cuenta', 'n° cuenta', 'nº cuenta', 'no cuenta', 'nro cuenta', 'cuenta bancaria', '# de ctas', 'de ctas', 'n° tarjeta', 'nº tarjeta'])
  const accountHolderIndex = index(['titular cta', 'titular cuenta', 'titular de cuenta'])
  if (nameIndex < 0 || cardIndex < 0) throw new Error('Faltan las columnas “Apellidos nombres” o “N° tjta”.')
  const displayedValue = (rowIndex: number, columnIndex: number) => text(sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })]?.w ?? rows[rowIndex][columnIndex])

  const groups: WithdrawalGroup[] = []
  let organizationName = ''
  let members: WithdrawalMember[] = []
  const finishGroup = () => {
    if (!organizationName || !members.length) return
    const lastMember = members[members.length - 1]
    const groupCell = sheet[XLSX.utils.encode_cell({ r: lastMember.sourceRow - 1, c: cardIndex })]
    const groupNumber = text(groupCell?.w ?? lastMember.cardNumber)
    groups.push({ organizationName, groupNumber, members })
    members = []
  }
  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]
    const fullName = text(row[nameIndex])
    const cardNumber = displayedValue(rowIndex, cardIndex)
    const dni = dniIndex >= 0 ? displayedValue(rowIndex, dniIndex) : ''
    const cardKey = keyIndex >= 0 ? displayedValue(rowIndex, keyIndex) : ''
    const bankName = bankIndex >= 0 ? displayedValue(rowIndex, bankIndex) : ''
    const accountNumber = accountIndex >= 0 ? displayedValue(rowIndex, accountIndex) : ''
    const accountHolder = accountHolderIndex >= 0 ? displayedValue(rowIndex, accountHolderIndex) : ''
    if (!fullName && !cardNumber && !dni) {
      finishGroup()
      continue
    }

    if (fullName && !cardNumber && !dni) {
      finishGroup()
      organizationName = fullName
      continue
    }
    if (!organizationName || !fullName) continue

    members.push({ fullName, cardNumber, dni, cardKey, bankName, accountNumber, accountHolder, sourceRow: rowIndex + 1 })
  }
  finishGroup()
  return groups
}

export async function saveWithdrawalGroups(groups: WithdrawalGroup[], periodLabel: string) {
  let saved = 0
  for (const group of groups) {
    const { data, error } = await supabase.from('withdrawal_groups').upsert({ organization_name: group.organizationName, group_number: group.groupNumber, period_label: periodLabel }, { onConflict: 'owner_id,organization_name,group_number,period_label' }).select('id').single()
    if (error) throw error
    const { error: clearMembersError } = await supabase.from('withdrawal_group_members').delete().eq('withdrawal_group_id', data.id)
    if (clearMembersError) throw clearMembersError
    const { error: membersError } = await supabase.from('withdrawal_group_members').insert(group.members.map(member => ({ withdrawal_group_id: data.id, full_name: member.fullName, card_group_number: member.cardNumber, dni: member.dni || null, card_key: member.cardKey || null, bank_name: member.bankName || null, account_number: member.accountNumber || null, account_holder: member.accountHolder || null, source_row: member.sourceRow })))
    if (membersError) throw membersError
    saved++
  }
  return saved
}

export async function clearWithdrawalGroups() {
  const { error } = await supabase.from('withdrawal_groups').delete().not('id', 'is', null)
  if (error) throw error
}

export async function loadWithdrawalGroups(): Promise<RegisteredWithdrawalGroup[]> {
  const { data, error } = await supabase.from('withdrawal_groups').select('id, organization_name, group_number, period_label').order('created_at', { ascending: false })
  if (error) throw error
  return data.map(group => ({ id: group.id, organizationName: group.organization_name, groupNumber: group.group_number, periodLabel: group.period_label }))
}

export async function loadWithdrawalGroupMembers(groupId: string): Promise<WithdrawalMember[]> {
  const { data, error } = await supabase.from('withdrawal_group_members').select('full_name, card_group_number, dni, card_key, bank_name, account_number, account_holder, source_row').eq('withdrawal_group_id', groupId).order('source_row')
  if (error) throw error
  return data.map(member => ({ fullName: member.full_name, cardNumber: member.card_group_number ?? '', dni: member.dni ?? '', cardKey: member.card_key ?? '', bankName: member.bank_name ?? '', accountNumber: member.account_number ?? '', accountHolder: member.account_holder ?? '', sourceRow: member.source_row ?? 0 }))
}
