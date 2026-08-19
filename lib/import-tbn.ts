import * as XLSX from 'xlsx'
import { supabase } from './supabase'

const text = (value: unknown) => String(value ?? '').trim()
const number = (value: unknown) => Number(String(value ?? 0).replace(',', '.')) || 0
const normalized = (value: unknown) => text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export async function importTbn(file: File, monthLabel: string) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const sheetName = workbook.SheetNames.find((name) => normalized(name) === 't. b.n')
  if (!sheetName) throw new Error('No se encontró la hoja T. B.N.')

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: '' })
  const headerIndex = rows.findIndex((row) => row.some((cell) => normalized(cell).includes('apellidos nombres')))
  if (headerIndex < 0) throw new Error('No se identificaron los encabezados de T. B.N.')
  const headers = rows[headerIndex].map(normalized)
  const index = (name: string) => headers.findIndex((header) => header.includes(name))
  const col = (row: unknown[], name: string) => row[index(name)]
  let imported = 0

  for (const row of rows.slice(headerIndex + 1)) {
    const fullName = text(col(row, 'apellidos nombres'))
    const dni = text(col(row, 'dni'))
    if (!fullName || !dni) continue
    const { data: client, error: clientError } = await supabase.from('loan_clients').upsert({ full_name: fullName, dni }, { onConflict: 'dni' }).select('id').single()
    if (clientError) throw clientError
    const cardDigits = text(col(row, 'nº tarjeta')).replace(/\D/g, '').slice(-4)
    let cardId: string | null = null
    if (cardDigits) {
      const { data: existing } = await supabase.from('cards').select('id').eq('client_id', client.id).eq('last_four_digits', cardDigits).maybeSingle()
      if (existing) cardId = existing.id
      else { const { data, error } = await supabase.from('cards').insert({ client_id: client.id, card_reference: text(col(row, 'nº tjta')), last_four_digits: cardDigits, bank: text(col(row, 'banco')), web_code: text(col(row, 'cod. web')) || null }).select('id').single(); if (error) throw error; cardId = data.id }
    }
    const account = text(col(row, '# de ctas'))
    if (account) { const { error } = await supabase.from('client_accounts').insert({ client_id: client.id, bank: text(col(row, 'banco')), account_number: account, account_holder: text(col(row, 'titular cta')) || fullName }); if (error) throw error }
    imported++
  }
  return { imported }
}
