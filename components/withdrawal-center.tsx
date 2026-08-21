'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  clearWithdrawalGroups,
  loadWithdrawalGroupMembers,
  loadWithdrawalGroups,
  readWithdrawalGroups,
  saveWithdrawalGroups,
  type RegisteredWithdrawalGroup,
  type WithdrawalMember,
} from '../lib/import-withdrawals'
import {
  deleteWithdrawalMemberAction,
  loadWithdrawalMemberActions,
  saveWithdrawalMemberAction,
  type WithdrawalActionType,
  type WithdrawalMemberAction,
} from '../lib/withdrawal-actions'

type ActiveSection = 'Retiros' | 'Enviadas' | 'Faltantes' | 'Incidencias'
type ReadingMember = { groupId: string; sourceRow: number }
type PersonSearchResult = { group: RegisteredWithdrawalGroup; member: WithdrawalMember }
const READING_MEMBER_KEY = 'newgen-reading-member'

const normalizedSearch = (value: string) => value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function storedReadingMember(): ReadingMember | null {
  if (typeof window === 'undefined') return null
  try {
    const value = JSON.parse(localStorage.getItem(READING_MEMBER_KEY) ?? 'null')
    return value && typeof value.groupId === 'string' && typeof value.sourceRow === 'number' ? value : null
  } catch {
    return null
  }
}

export function WithdrawalCenter({ activeSection, onNavigate }: { activeSection: ActiveSection; onNavigate: (section: Exclude<ActiveSection, 'Retiros'>) => void }) {
  const [groups, setGroups] = useState<RegisteredWithdrawalGroup[]>([])
  const [membersByGroup, setMembersByGroup] = useState<Record<string, WithdrawalMember[]>>({})
  const [actions, setActions] = useState<WithdrawalMemberAction[]>([])
  const [openGroupId, setOpenGroupId] = useState<string | null>(() => typeof window === 'undefined' ? null : localStorage.getItem('newgen-open-group'))
  const [groupSearch, setGroupSearch] = useState(() => typeof window === 'undefined' ? '' : localStorage.getItem('newgen-group-search') || '')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedMember, setSelectedMember] = useState<WithdrawalMember | null>(null)
  const [readingMember, setReadingMember] = useState<ReadingMember | null>(storedReadingMember)
  const [showAccountInfo, setShowAccountInfo] = useState(false)
  const reportedRowTap = useRef<{ actionId: string; timestamp: number } | null>(null)
  const [loadingGroup, setLoadingGroup] = useState(false)
  const [importing, setImporting] = useState(false)
  const [savingAction, setSavingAction] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [message, setMessage] = useState('')

  async function refreshRegistry() {
    try {
      const savedGroups = await loadWithdrawalGroups()
      setGroups(savedGroups)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar los grupos registrados.')
    }

    try {
      setActions(await loadWithdrawalMemberActions())
    } catch {
      // La importación de grupos debe seguir funcionando aunque aún no se haya creado la tabla de acciones.
      setActions([])
    }
  }

  useEffect(() => { refreshRegistry() }, [activeSection])
  useEffect(() => { localStorage.setItem('newgen-group-search', groupSearch) }, [groupSearch])
  useEffect(() => {
    if (readingMember) localStorage.setItem(READING_MEMBER_KEY, JSON.stringify(readingMember))
    else localStorage.removeItem(READING_MEMBER_KEY)
  }, [readingMember])
  useEffect(() => {
    if (openGroupId) localStorage.setItem('newgen-open-group', openGroupId)
    else localStorage.removeItem('newgen-open-group')
  }, [openGroupId])
  useEffect(() => {
    if (!openGroupId || membersByGroup[openGroupId] || !groups.some(group => group.id === openGroupId)) return
    setLoadingGroup(true)
    loadWithdrawalGroupMembers(openGroupId)
      .then(members => setMembersByGroup(current => ({ ...current, [openGroupId]: members })))
      .catch(error => setMessage(error instanceof Error ? error.message : 'No se pudo cargar el grupo.'))
      .finally(() => setLoadingGroup(false))
  }, [openGroupId, groups, membersByGroup])
  useEffect(() => {
    const query = groupSearch.trim()
    if (!query || /^\d+$/.test(query) || !groups.length) return
    const missingGroups = groups.filter(group => !membersByGroup[group.id])
    if (!missingGroups.length) return
    let cancelled = false
    Promise.all(missingGroups.map(async group => [group.id, await loadWithdrawalGroupMembers(group.id)] as const))
      .then(entries => { if (!cancelled) setMembersByGroup(current => ({ ...current, ...Object.fromEntries(entries) })) })
      .catch(error => { if (!cancelled) setMessage(error instanceof Error ? error.message : 'No se pudo buscar por nombre.') })
    return () => { cancelled = true }
  }, [groupSearch, groups, membersByGroup])

  async function importWorkbook(file: File) {
    try {
      setImporting(true)
      setMessage('Leyendo y guardando Excel...')
      const parsedGroups = await readWithdrawalGroups(file)
      if (!parsedGroups.length) {
        setMessage('No se encontraron grupos separados en el Excel.')
        return
      }
      const periodLabel = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(new Date())
      await saveWithdrawalGroups(parsedGroups, periodLabel)
      setMembersByGroup({})
      await refreshRegistry()
      setMessage(`${parsedGroups.length} grupos guardados correctamente.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo importar el Excel.')
    } finally {
      setImporting(false)
    }
  }

  function copyBankIncident(member: WithdrawalMember) {
    const incidentText = `${member.fullName}\nN° TJTA: ${member.cardNumber}\nTarjeta no reconocida por el banco`
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(incidentText)
      return
    }
    const helper = document.createElement('textarea')
    helper.value = incidentText
    helper.style.position = 'fixed'
    helper.style.opacity = '0'
    document.body.appendChild(helper)
    helper.select()
    document.execCommand('copy')
    helper.remove()
  }

  async function registerAction(actionType: WithdrawalActionType) {
    if (!openGroupId || !selectedMember) return
    try {
      setSavingAction(true)
      if (actionType === 'bank_unrecognized') copyBankIncident(selectedMember)
      await saveWithdrawalMemberAction(openGroupId, selectedMember, actionType)
      await refreshRegistry()
      setMessage(actionType === 'sent' ? 'Tarjeta enviada y registrada.' : actionType === 'missing' ? 'Tarjeta no disponible registrada.' : 'Incidencia registrada y copiada al portapapeles.')
    } catch (error) {
      const databaseError = error as { code?: string; message?: string }
      setMessage(databaseError.code === '42P01' ? 'Falta activar los registros de acciones en Supabase: ejecuta withdrawal-actions.sql una sola vez.' : error instanceof Error ? error.message : 'No se pudo guardar esta acción.')
    } finally {
      setSavingAction(false)
    }
  }

  async function revokeAction(action: WithdrawalMemberAction) {
    try {
      await deleteWithdrawalMemberAction(action.id)
      await refreshRegistry()
      setMessage(`Se anuló el registro de ${action.fullName}. La tarjeta volvió a estado normal.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo anular este registro.')
    }
  }

  function openReportedAction(action: WithdrawalMemberAction) {
    const now = Date.now()
    const previousTap = reportedRowTap.current
    if (previousTap?.actionId === action.id && now - previousTap.timestamp < 500) {
      reportedRowTap.current = null
      onNavigate(action.actionType === 'sent' ? 'Enviadas' : action.actionType === 'missing' ? 'Faltantes' : 'Incidencias')
      return
    }
    reportedRowTap.current = { actionId: action.id, timestamp: now }
  }

  function interactWithMember(member: WithdrawalMember, action?: WithdrawalMemberAction) {
    if (action) {
      openReportedAction(action)
      return
    }
    if (openGroupId) setReadingMember({ groupId: openGroupId, sourceRow: member.sourceRow })
    if (selectionMode) setSelectedMember(member)
  }

  async function clearRegistry() {
    try {
      await clearWithdrawalGroups()
      setGroups([])
      setMembersByGroup({})
      setActions([])
      setOpenGroupId(null)
      setSelectedMember(null)
      setConfirmClear(false)
      setMessage('Todos los grupos y registros de retiros fueron eliminados.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo limpiar el registro.')
    }
  }

  const selectedGroup = groups.find(group => group.id === openGroupId) ?? null
  const groupMembers = selectedGroup ? membersByGroup[selectedGroup.id] ?? [] : []
  const readingMemberInfo = readingMember && readingMember.groupId === selectedGroup?.id ? groupMembers.find(member => member.sourceRow === readingMember.sourceRow) : null
  const searchTerm = normalizedSearch(groupSearch.trim())
  const searchByGroupNumber = /^\d+$/.test(groupSearch.trim())
  const personResults = useMemo<PersonSearchResult[]>(() => searchTerm && !searchByGroupNumber ? groups.flatMap(group => (membersByGroup[group.id] ?? []).filter(member => normalizedSearch(member.fullName).includes(searchTerm)).map(member => ({ group, member }))) : [], [groups, membersByGroup, searchByGroupNumber, searchTerm])
  const filteredGroups = useMemo(() => searchByGroupNumber ? groups.filter(group => group.groupNumber.includes(groupSearch.trim())) : searchTerm ? groups.filter(group => personResults.some(result => result.group.id === group.id)) : groups, [groups, groupSearch, personResults, searchByGroupNumber, searchTerm])
  const actionFor = (member: WithdrawalMember) => actions.find(action => action.groupId === openGroupId && action.sourceRow === member.sourceRow)
  const selectedMemberAction = selectedMember ? actionFor(selectedMember) : undefined
  const sentActions = actions.filter(action => action.actionType === 'sent')
  const missingActions = actions.filter(action => action.actionType === 'missing')
  const incidentActions = actions.filter(action => action.actionType === 'bank_unrecognized')
  const groupLabel = (groupId: string) => {
    const group = groups.find(item => item.id === groupId)
    return group ? `${group.organizationName} · Grupo ${group.groupNumber}` : 'Grupo registrado'
  }

  if (activeSection === 'Enviadas') return <ActionRegistry title="Tarjetas enviadas" emptyText="Aún no hay tarjetas registradas como enviadas." actions={sentActions} groupLabel={groupLabel} tone="green" onRevoke={revokeAction} />
  if (activeSection === 'Faltantes') return <ActionRegistry title="Tarjetas faltantes" emptyText="No hay tarjetas marcadas como no disponibles." actions={missingActions} groupLabel={groupLabel} tone="purple" onRevoke={revokeAction} />
  if (activeSection === 'Incidencias') return <ActionRegistry title="Incidencias" emptyText="No hay incidencias registradas." actions={incidentActions} groupLabel={groupLabel} tone="red" onRevoke={revokeAction} />

  return <div className="withdrawal-center">
    <div className="mt-5 max-w-lg"><label className="relative block"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true"><svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[2.4]"><circle cx="10.8" cy="10.8" r="6.5" /><path d="m16 16 4.2 4.2" /></svg></span><input aria-label="Buscar grupo o cliente" type="search" value={groupSearch} placeholder="# de grupo o nombre de cliente" onChange={event => setGroupSearch(event.currentTarget.value)} className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500" /></label>{personResults.length > 0 && <div className="mt-2 overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">{personResults.slice(0, 6).map(result => <button key={`${result.group.id}-${result.member.sourceRow}`} onClick={() => { setOpenGroupId(result.group.id); setReadingMember({ groupId: result.group.id, sourceRow: result.member.sourceRow }); setSelectedMember(null); setSelectionMode(false) }} className="flex w-full items-center justify-between gap-3 border-b border-emerald-50 px-4 py-3 text-left last:border-0 hover:bg-emerald-50"><span><b className="block text-sm text-slate-900">{result.member.fullName}</b><small className="mt-0.5 block text-xs font-bold text-slate-500">{result.group.organizationName} · Grupo {result.group.groupNumber}</small></span><span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-800">Ver</span></button>)}</div>}{groupSearch.trim() && !searchByGroupNumber && personResults.length === 0 && <p className="mt-2 text-sm font-bold text-slate-500">No se encontró una persona con ese nombre.</p>}</div>
    <section className="mt-7 rounded-3xl bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black">Retiros por grupos</h2><p className="mt-1 text-sm text-slate-500">Activa “Seleccionar”, pulsa una persona y registra el estado de su tarjeta.</p></div><label className="cursor-pointer rounded-2xl bg-emerald-700 px-4 py-3 text-center text-sm font-black text-white hover:bg-emerald-800">{importing ? 'Importando...' : 'Importar Excel'}<input className="hidden" type="file" accept=".xlsx,.xls" disabled={importing} onChange={event => { const file = event.target.files?.[0]; if (file) importWorkbook(file) }} /></label></div>
      {message && <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{message}</p>}

      {groups.length > 0 && <div className="mt-7"><p className="text-sm font-black text-slate-800">Grupos registrados</p><div className="mt-3 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="flex gap-2 overflow-x-auto pb-2 lg:block lg:max-h-[640px] lg:space-y-2 lg:overflow-y-auto lg:overflow-x-hidden lg:pr-1">{filteredGroups.map(group => <button key={group.id} onClick={() => { setOpenGroupId(current => current === group.id ? null : group.id); setSelectedMember(null); setSelectionMode(false) }} className={openGroupId === group.id ? 'w-52 shrink-0 rounded-2xl bg-emerald-700 p-4 text-left text-white shadow-lg shadow-emerald-900/15 lg:w-full' : 'w-52 shrink-0 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-slate-800 hover:border-emerald-300 lg:w-full'}><p className={openGroupId === group.id ? 'text-[10px] font-black uppercase tracking-[.12em] text-emerald-100' : 'text-[10px] font-black uppercase tracking-[.12em] text-slate-500'}>{group.periodLabel}</p><p className="mt-1 font-black">{group.organizationName}</p><p className={openGroupId === group.id ? 'mt-1 text-sm font-bold text-emerald-100' : 'mt-1 text-sm font-bold text-emerald-700'}>Grupo {group.groupNumber}</p></button>)}{filteredGroups.length === 0 && <p className="w-full rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">No se encontró ese grupo.</p>}</div>
        <div className="withdrawal-detail min-h-72 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-5">{!selectedGroup ? <div className="grid min-h-60 place-items-center text-center"><div><p className="text-lg font-black text-slate-800">Selecciona un grupo</p><p className="mt-2 text-sm text-slate-500">Aquí aparecerá la información completa de sus integrantes.</p></div></div> : <><div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="withdrawal-group-title">Grupo {selectedGroup.groupNumber}</p><h3 className="mt-2 text-xl font-black text-slate-900">{selectedGroup.organizationName}</h3></div><div className="flex items-end justify-between gap-3 sm:justify-end"><p className="text-sm font-bold text-slate-500">{selectedGroup.periodLabel}</p><div className="flex flex-col items-end gap-2">{readingMemberInfo && (readingMemberInfo.bankName || readingMemberInfo.accountNumber || readingMemberInfo.accountHolder) && <button onClick={() => setShowAccountInfo(true)} className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-emerald-800 hover:bg-emerald-50">⌁ Información de cuenta</button>}<button onClick={() => { setSelectionMode(current => !current); setSelectedMember(null) }} className={selectionMode ? 'rounded-xl bg-slate-800 px-3 py-2 text-xs font-black text-white' : 'rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white hover:bg-emerald-800'}>{selectionMode ? 'Cancelar' : 'Seleccionar'}</button></div></div></div>
          {selectionMode && <p className="mt-4 rounded-xl bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-900">Modo selección activo: elige una persona para ver sus opciones.</p>}
          {showAccountInfo && readingMemberInfo && <div className="withdrawal-modal-backdrop" role="dialog" aria-modal="true" aria-label="Información de cuenta"><div className="withdrawal-modal"><div className="flex items-start justify-between gap-4"><p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-700">Información de cuenta</p><button onClick={() => setShowAccountInfo(false)} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xl font-bold text-slate-600 hover:bg-slate-200" aria-label="Cerrar">×</button></div><div className="mt-5 grid gap-3 rounded-2xl bg-emerald-50 p-4 text-sm sm:grid-cols-3"><p className="sm:col-span-3"><b>Apellidos y nombres</b><span>{readingMemberInfo.fullName}</span></p>{readingMemberInfo.bankName && <p><b>Banco</b><span>{readingMemberInfo.bankName}</span></p>}{readingMemberInfo.accountNumber && <p><b>N° de cuenta</b><span>{readingMemberInfo.accountNumber}</span></p>}{readingMemberInfo.accountHolder && <p><b>Titular de la cuenta</b><span>{readingMemberInfo.accountHolder}</span></p>}</div></div></div>}
          {selectedMember && <div className="withdrawal-modal-backdrop" role="dialog" aria-modal="true" aria-label="Opciones de tarjeta"><div className={`withdrawal-modal ${selectedMemberAction?.actionType === 'sent' ? 'withdrawal-modal-sent' : selectedMemberAction?.actionType === 'bank_unrecognized' ? 'withdrawal-modal-incident' : selectedMemberAction?.actionType === 'missing' ? 'withdrawal-modal-missing' : ''}`}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.12em] text-emerald-700">Persona seleccionada</p><h4 className="mt-1 text-xl font-black text-slate-900">{selectedMember.fullName}</h4></div><button onClick={() => setSelectedMember(null)} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xl font-bold text-slate-600 hover:bg-slate-200" aria-label="Cerrar">×</button></div><div className="mt-5 grid gap-3 rounded-2xl bg-white/65 p-4 text-sm sm:grid-cols-3"><p><b>N° tjta</b><span>{selectedMember.cardNumber}</span></p><p><b>DNI</b><span>{selectedMember.dni}</span></p><p><b>Clave</b><span>{selectedMember.cardKey}</span></p></div>{(selectedMember.bankName || selectedMember.accountNumber) && <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4"><p className="text-xs font-black uppercase tracking-[.12em] text-emerald-700">Datos bancarios</p><div className="mt-2 grid gap-3 text-sm sm:grid-cols-2"><p><b>Banco</b><span>{selectedMember.bankName || '—'}</span></p><p><b>N° de cuenta</b><span>{selectedMember.accountNumber || '—'}</span></p></div></div>}{selectedMemberAction ? <p className={selectedMemberAction.actionType === 'sent' ? 'mt-5 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white' : selectedMemberAction.actionType === 'missing' ? 'mt-5 rounded-xl bg-violet-700 px-4 py-3 text-sm font-black text-white' : 'mt-5 rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white'}>{selectedMemberAction.actionType === 'sent' ? '✓ Tarjeta enviada' : selectedMemberAction.actionType === 'missing' ? '◇ Tarjeta no disponible' : '⚠ Incidencia: tarjeta no reconocida por el banco'}</p> : <div className="mt-5"><p className="text-sm font-bold text-slate-600">Selecciona el estado de esta tarjeta:</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><button disabled={savingAction} onClick={() => registerAction('sent')} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-50">✓ Tarjeta enviada</button><button disabled={savingAction} onClick={() => registerAction('bank_unrecognized')} className="rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50">⚠ Tarjeta no reconocida por el banco</button><button disabled={savingAction} onClick={() => registerAction('missing')} className="rounded-xl bg-violet-700 px-4 py-3 text-sm font-black text-white hover:bg-violet-800 disabled:opacity-50">◇ Tarjeta no disponible</button></div></div>}</div></div>}
          {loadingGroup ? <p className="py-8 text-sm font-bold text-slate-500">Cargando integrantes...</p> : <>
            <div className="mt-4 space-y-2 md:hidden">
              {groupMembers.map((member, index) => {
                const action = actionFor(member)
                const selected = selectedMember?.sourceRow === member.sourceRow
                const reading = readingMember?.groupId === openGroupId && readingMember.sourceRow === member.sourceRow
                const tone = action?.actionType === 'sent' ? 'border-emerald-300 bg-emerald-50' : action?.actionType === 'bank_unrecognized' ? 'border-red-300 bg-red-50' : action?.actionType === 'missing' ? 'border-violet-300 bg-violet-50' : reading ? 'border-emerald-400 bg-emerald-100 ring-2 ring-emerald-300' : 'border-slate-200 bg-white'
                return <button type="button" key={`${member.fullName}-${index}`} onClick={() => interactWithMember(member, action)} className={`w-full rounded-2xl border p-3 text-left shadow-sm ${tone} ${selectionMode ? 'active:scale-[.99]' : ''}`}>
                  <p className="text-sm font-black text-slate-900">{member.fullName}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-200/70 pt-2 text-center">
                    <p><b className="block text-[9px] uppercase tracking-wide text-slate-500">N° tjta</b><span className="mt-1 block text-sm font-black text-slate-800">{member.cardNumber}</span></p>
                    <p><b className="block text-[9px] uppercase tracking-wide text-slate-500">DNI</b><span className="mt-1 block text-sm font-black text-slate-800">{member.dni}</span></p>
                    <p><b className="block text-[9px] uppercase tracking-wide text-slate-500">Clave</b><span className="mt-1 block text-sm font-black text-slate-800">{member.cardKey}</span></p>
                  </div>
                  {action && <p className={action.actionType === 'sent' ? 'mt-2 text-xs font-black text-emerald-800' : action.actionType === 'missing' ? 'mt-2 text-xs font-black text-violet-800' : 'mt-2 text-xs font-black text-red-800'}>{action.actionType === 'sent' ? '✓ Tarjeta enviada' : action.actionType === 'missing' ? '◇ Tarjeta no disponible' : '⚠ Tarjeta no reconocida por el banco'}</p>}
                </button>
              })}
              {groupMembers.length === 0 && <p className="py-5 text-sm text-slate-500">Este grupo aún no tiene integrantes registrados.</p>}
            </div>
            <div className="mt-4 hidden overflow-x-auto md:block"><table className="withdrawal-table min-w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-2 py-2">Apellidos y nombres</th><th className="px-2 py-2">N° tjta</th><th className="px-2 py-2">DNI</th><th className="px-2 py-2">Clave</th></tr></thead><tbody>{groupMembers.map((member, index) => { const action = actionFor(member); const selected = selectedMember?.sourceRow === member.sourceRow; const reading = readingMember?.groupId === openGroupId && readingMember.sourceRow === member.sourceRow; return <tr key={`${member.fullName}-${index}`} data-status={action?.actionType} data-reading={reading || undefined} aria-selected={selected || reading} onClick={() => interactWithMember(member, action)} className={`${selectionMode ? 'cursor-pointer ring-inset hover:ring-2 hover:ring-emerald-400' : 'cursor-pointer'} ${selected ? 'ring-2 ring-emerald-600' : ''}`}><td className="px-2 py-3 font-semibold text-slate-800">{member.fullName}</td><td className="px-2 py-3 text-slate-600">{member.cardNumber}</td><td className="px-2 py-3 text-slate-600">{member.dni}</td><td className="px-2 py-3 text-slate-600">{member.cardKey}</td></tr> })}</tbody></table>{groupMembers.length === 0 && <p className="py-5 text-sm text-slate-500">Este grupo aún no tiene integrantes registrados.</p>}</div>
          </>}
        </>}</div>
      </div></div>}
      <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5"><p className="text-sm font-black text-red-900">Zona de limpieza</p><p className="mt-1 text-sm text-red-700">Elimina todos los grupos y retiros que hayas guardado. Esta acción no se puede deshacer.</p>{confirmClear ? <div className="mt-4 flex flex-wrap gap-3"><button onClick={clearRegistry} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white hover:bg-red-700">Sí, eliminar todo</button><button onClick={() => setConfirmClear(false)} className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-black text-red-700">Cancelar</button></div> : <button onClick={() => setConfirmClear(true)} className="mt-4 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-black text-red-700 hover:bg-red-100">Limpiar todos los retiros</button>}</div>
    </section>
  </div>
}

function ActionRegistry({ title, emptyText, actions, groupLabel, tone, onRevoke }: { title: string; emptyText: string; actions: WithdrawalMemberAction[]; groupLabel: (groupId: string) => string; tone: 'green' | 'red' | 'purple'; onRevoke: (action: WithdrawalMemberAction) => void }) {
  const colors = tone === 'green' ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : tone === 'purple' ? 'border-violet-200 bg-violet-50 text-violet-950' : 'border-red-200 bg-red-50 text-red-950'
  return <section className="mt-7 rounded-3xl bg-white p-6 shadow-sm"><h2 className="font-black">{title}</h2>{actions.length === 0 ? <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">{emptyText}</p> : <div className="mt-5 grid gap-3 md:grid-cols-2">{actions.map(action => <article key={action.id} className={`rounded-2xl border p-4 ${colors}`}><div className="flex items-start justify-between gap-3"><div><p className="font-black">{action.fullName}</p><p className="mt-1 text-sm">N° tjta: {action.cardNumber} · DNI: {action.dni}</p><p className="mt-2 text-xs font-bold uppercase tracking-wide opacity-75">{groupLabel(action.groupId)}</p></div><button onClick={() => onRevoke(action)} className="shrink-0 rounded-xl border border-current/20 bg-white/55 px-3 py-2 text-xs font-black hover:bg-white/85">↶ Anular</button></div></article>)}</div>}</section>
}
