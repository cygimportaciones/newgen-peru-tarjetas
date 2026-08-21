'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { supabase } from '../lib/supabase'
import { clearWithdrawalGroups, loadWithdrawalGroupMembers, loadWithdrawalGroups, readWithdrawalGroups, saveWithdrawalGroups, type RegisteredWithdrawalGroup, type WithdrawalGroup, type WithdrawalMember } from '../lib/import-withdrawals'
import { WithdrawalCenter } from '../components/withdrawal-center'

type Tab = 'Dashboard' | 'Tarjetas' | 'Retiros' | 'Enviadas' | 'Faltantes' | 'Incidencias' | 'Usuarios'
type RainBill = { id: string; createdAt: number; left: number; width: number; duration: number; drift: number; rotation: number; glowDelay: number }
const tabs: [Tab, string][] = [['Dashboard', '⌂'], ['Tarjetas', '▣'], ['Retiros', '↙'], ['Enviadas', '✓'], ['Faltantes', '◇'], ['Incidencias', '⚠'], ['Usuarios', '◉']]

export default function Home() {
  const [tab, setTab] = useState<Tab>(() => typeof window === 'undefined' ? 'Dashboard' : (localStorage.getItem('newgen-active-tab') as Tab) || 'Dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const navigationSound = useRef<AudioContext | null>(null)
  const [rainBills, setRainBills] = useState<RainBill[]>([])
  const [withdrawalGroups, setWithdrawalGroups] = useState<WithdrawalGroup[]>([])
  const [registeredWithdrawalGroups, setRegisteredWithdrawalGroups] = useState<RegisteredWithdrawalGroup[]>([])
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(() => typeof window === 'undefined' ? null : localStorage.getItem('newgen-open-group'))
  const [groupMembers, setGroupMembers] = useState<Record<string, WithdrawalMember[]>>({})
  const [loadingGroupId, setLoadingGroupId] = useState<string | null>(null)
  const [withdrawalMessage, setWithdrawalMessage] = useState('')
  const [savingWithdrawals, setSavingWithdrawals] = useState(false)
  const [clearWithdrawalsReady, setClearWithdrawalsReady] = useState(false)
  const [clearingWithdrawals, setClearingWithdrawals] = useState(false)
  const [groupSearch, setGroupSearch] = useState(() => typeof window === 'undefined' ? '' : localStorage.getItem('newgen-group-search') || '')
  const router = useRouter()
  async function logout() { await supabase.auth.signOut(); router.replace('/login') }
  function playNavigationSound() {
    if (typeof window === 'undefined') return
    try {
      const context = navigationSound.current ?? new window.AudioContext()
      navigationSound.current = context
      if (context.state === 'suspended') void context.resume()
      const oscillator = context.createOscillator()
      const volume = context.createGain()
      const now = context.currentTime
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(720, now)
      oscillator.frequency.exponentialRampToValueAtTime(560, now + .075)
      volume.gain.setValueAtTime(.0001, now)
      volume.gain.exponentialRampToValueAtTime(.055, now + .008)
      volume.gain.exponentialRampToValueAtTime(.0001, now + .09)
      oscillator.connect(volume)
      volume.connect(context.destination)
      oscillator.start(now)
      oscillator.stop(now + .095)
    } catch {
      // El cambio de sección debe continuar aunque el dispositivo no permita audio.
    }
  }
  async function refreshWithdrawalRegistry() {
    try { setRegisteredWithdrawalGroups(await loadWithdrawalGroups()) }
    catch (error) { setWithdrawalMessage(error instanceof Error ? error.message : 'No se pudo cargar el registro de retiros.') }
  }
  function toggleWithdrawalGroup(groupId: string) { setExpandedGroupId(current => current === groupId ? null : groupId) }
  async function previewWithdrawals(file: File) {
    try {
      setSavingWithdrawals(true)
      setWithdrawalMessage('Leyendo y guardando Excel...')
      const groups = await readWithdrawalGroups(file)
      setWithdrawalGroups(groups)
      if (!groups.length) { setWithdrawalMessage('No se encontraron grupos separados en el Excel.'); return }
      const periodLabel = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(new Date())
      await saveWithdrawalGroups(groups, periodLabel)
      await refreshWithdrawalRegistry()
      setWithdrawalMessage('')
    } catch (error) { setWithdrawalGroups([]); setWithdrawalMessage(error instanceof Error ? error.message : 'No se pudo leer el Excel.') }
    finally { setSavingWithdrawals(false) }
  }
  async function clearWithdrawals() {
    try {
      setClearingWithdrawals(true)
      await clearWithdrawalGroups()
      setWithdrawalGroups([])
      setRegisteredWithdrawalGroups([])
      setGroupMembers({})
      setExpandedGroupId(null)
      setWithdrawalMessage('Todos los grupos y retiros guardados fueron eliminados.')
      setClearWithdrawalsReady(false)
    } catch (error) { setWithdrawalMessage(error instanceof Error ? error.message : 'No se pudieron limpiar los retiros.') }
    finally { setClearingWithdrawals(false) }
  }
  useEffect(() => {
    let timer: number
    function addBill() {
      const now = Date.now()
      const newBills = Array.from({ length: 1 }, () => ({ id: crypto.randomUUID(), createdAt: now, left: 7 + Math.random() * 80, width: 34 + Math.random() * 18, duration: 18 + Math.random() * 9, drift: -20 + Math.random() * 44, rotation: -22 + Math.random() * 44, glowDelay: -(Math.random() * 5) }))
      setRainBills(current => [...current.filter(bill => now - bill.createdAt < 21000), ...newBills])
      timer = window.setTimeout(addBill, 3500 + Math.random() * 2500)
    }
    addBill()
    return () => window.clearTimeout(timer)
  }, [])
  useEffect(() => { if (tab === 'Retiros') refreshWithdrawalRegistry() }, [tab])
  useEffect(() => { localStorage.setItem('newgen-active-tab', tab) }, [tab])
  useEffect(() => { if (expandedGroupId) localStorage.setItem('newgen-open-group', expandedGroupId); else localStorage.removeItem('newgen-open-group') }, [expandedGroupId])
  useEffect(() => { localStorage.setItem('newgen-group-search', groupSearch) }, [groupSearch])
  useEffect(() => {
    if (!expandedGroupId || groupMembers[expandedGroupId] || !registeredWithdrawalGroups.some(group => group.id === expandedGroupId)) return
    setLoadingGroupId(expandedGroupId)
    loadWithdrawalGroupMembers(expandedGroupId).then(members => setGroupMembers(current => ({ ...current, [expandedGroupId]: members }))).catch(error => setWithdrawalMessage(error instanceof Error ? error.message : 'No se pudieron cargar los integrantes del grupo.')).finally(() => setLoadingGroupId(null))
  }, [expandedGroupId, registeredWithdrawalGroups])
  useEffect(() => { document.querySelectorAll('button').forEach(button => { if (button.textContent?.includes('Grupo ')) button.style.display = !groupSearch || button.textContent.includes(`Grupo ${groupSearch.trim()}`) ? '' : 'none' }) }, [groupSearch, registeredWithdrawalGroups, expandedGroupId])
  const selectedWithdrawalGroup = registeredWithdrawalGroups.find(group => group.id === expandedGroupId) ?? null
  const pageTitle = tab === 'Enviadas' ? 'Tarjetas enviadas' : tab === 'Faltantes' ? 'Tarjetas faltantes' : tab
  const pageIcon = tabs.find(([name]) => name === tab)?.[1] ?? '⌂'

  return <main className="min-h-screen bg-slate-100"><div className="flex min-h-screen">
    {mobileMenuOpen && <button aria-label="Cerrar menú" className="newgen-mobile-scrim" onClick={() => setMobileMenuOpen(false)} />}
    <aside className={`newgen-sidebar newgen-pro-sidebar ${mobileMenuOpen ? 'newgen-mobile-open' : ''} flex w-full shrink-0 flex-col p-4 lg:h-screen lg:w-80 lg:sticky lg:top-0 lg:overflow-y-auto lg:p-5`}>
      <div className="border-b border-white/10 pb-5">
        <Image src="/brand/newgen-peru.png" alt="Newgen Peru" width={560} height={280} className="h-16 w-32 object-contain lg:h-20 lg:w-40" />
        <p className="mt-1 text-xs font-black uppercase tracking-[.23em] text-white/75">Newgen Peru</p>
      </div>
      <span className="sidebar-money-rain" aria-hidden="true">{rainBills.map(bill => <span key={bill.id} className="sidebar-rain-bill" style={{ left: `${bill.left}%`, width: `${bill.width + 8}px`, height: `${Math.round((bill.width + 8) * .62)}px`, '--bill-duration': `${bill.duration}s`, '--bill-drift': `${bill.drift}px`, '--bill-rotation': `${bill.rotation}deg`, '--bill-glow-delay': `${bill.glowDelay}s` } as CSSProperties}>$</span>)}</span>
      <nav className="mt-5 grid grid-cols-4 gap-2 lg:block lg:space-y-2">
        {tabs.map(([name, icon]) => <button key={name} onClick={() => { playNavigationSound(); setTab(name); setMobileMenuOpen(false) }} className={tab === name ? 'newgen-nav-active w-full rounded-2xl px-4 py-4 text-center text-xs font-black lg:text-left lg:text-lg' : 'w-full rounded-2xl px-4 py-4 text-center text-xs font-bold text-white/75 hover:bg-white/10 hover:text-white lg:text-left lg:text-lg'}><span className="mr-0 text-lg lg:mr-4">{icon}</span>{name}</button>)}
      </nav>
      <div className="mt-6 lg:mt-auto">
        <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-[.16em] text-emerald-100/60">Usuario:</p>
        <div className="newgen-user-card rounded-3xl p-4 text-white"><p className="break-all text-sm font-black leading-5 text-white">luis.gutierrez.lg526@gmail.com</p><div className="mt-4 flex justify-center"><span className="newgen-role-badge inline-block rounded-full bg-emerald-400/20 px-3 py-1.5 text-xs font-black text-emerald-100">Administrador / Luis</span></div></div>
        <button onClick={logout} className="mt-4 w-full rounded-2xl bg-red-600 px-4 py-4 text-sm font-black text-white shadow-lg shadow-red-950/20 hover:bg-red-700">↪ &nbsp; Cerrar sesión</button>
      </div>
    </aside>

    <section className="newgen-workspace min-w-0 flex-1">
      <header className="newgen-topbar"><button aria-label="Abrir menú" onClick={() => setMobileMenuOpen(true)} className="newgen-mobile-menu"><i /><i /><i /></button><div className="newgen-topbar-title"><span className="newgen-desktop-section-icon" aria-hidden="true">{pageIcon}</span><p><span className="newgen-desktop-title">{pageTitle}</span><span className="newgen-mobile-title">{pageTitle}</span></p></div><div className="newgen-user-badge"><span>●</span><div><b>Admin / Luis</b></div></div></header>
      <div className={`newgen-content p-5 sm:p-8 lg:p-10 ${tab === 'Retiros' ? 'newgen-retiros-content' : ''}`}>
          <h1 className="text-3xl font-black text-slate-900">{pageTitle}</h1>
          {(tab === 'Retiros' || tab === 'Enviadas' || tab === 'Faltantes' || tab === 'Incidencias') && <WithdrawalCenter activeSection={tab} onNavigate={section => setTab(section)} />}
        {tab === 'Retiros' && <div className="mt-5 max-w-sm"><label className="text-xs font-black uppercase tracking-[.12em] text-slate-500">Buscar por número de grupo<input type="search" inputMode="numeric" value={groupSearch} placeholder="Ej. 802, 091, 078" onChange={event => setGroupSearch(event.currentTarget.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500" /></label></div>}
        {tab === 'Dashboard' && <div className="mt-7 grid gap-4 sm:grid-cols-3">{[['Tarjetas registradas', '3'], ['Sin incidencias', '2'], ['Incidencias pendientes', '1']].map(x => <article key={x[0]} className="rounded-3xl bg-white p-6 shadow-sm"><p className="text-sm font-bold text-slate-500">{x[0]}</p><p className="mt-2 text-3xl font-black text-emerald-700">{x[1]}</p></article>)}</div>}
        {tab === 'Tarjetas' && <section className="mt-7 rounded-3xl bg-white p-6 shadow-sm"><h2 className="font-black">Tarjetas registradas</h2><p className="mt-2 text-slate-500">La importación mensual aparecerá aquí.</p></section>}
        {tab === 'Retiros' && <section className="mt-7 rounded-3xl bg-white p-6 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black">Retiros por grupos</h2><p className="mt-1 text-sm text-slate-500">Importa el Excel: la institución inicia el grupo y el último N° tjta verde lo identifica.</p></div><label className="cursor-pointer rounded-2xl bg-emerald-700 px-4 py-3 text-center text-sm font-black text-white hover:bg-emerald-800">{savingWithdrawals ? 'Importando...' : 'Importar Excel'}<input className="hidden" type="file" accept=".xlsx,.xls" disabled={savingWithdrawals} onChange={event => { const file = event.target.files?.[0]; if (file) previewWithdrawals(file) }} /></label></div>{withdrawalMessage && <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{withdrawalMessage}</p>}{registeredWithdrawalGroups.length > 0 && <div className="mt-7"><p className="text-sm font-black text-slate-800">Grupos registrados</p><div className="mt-3 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]"><div className="space-y-2 lg:max-h-[640px] lg:overflow-y-auto lg:pr-1">{registeredWithdrawalGroups.map(group => <button key={group.id} onClick={() => toggleWithdrawalGroup(group.id)} className={expandedGroupId === group.id ? 'w-full rounded-2xl bg-emerald-700 p-4 text-left text-white shadow-lg shadow-emerald-900/15' : 'w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-slate-800 hover:border-emerald-300'}><p className={expandedGroupId === group.id ? 'text-[10px] font-black uppercase tracking-[.12em] text-emerald-100' : 'text-[10px] font-black uppercase tracking-[.12em] text-slate-500'}>{group.periodLabel}</p><p className="mt-1 font-black">{group.organizationName}</p><p className={expandedGroupId === group.id ? 'mt-1 text-sm font-bold text-emerald-100' : 'mt-1 text-sm font-bold text-emerald-700'}>Grupo {group.groupNumber}</p></button>)}</div><div className="min-h-72 rounded-3xl border border-slate-200 bg-slate-50 p-5">{!selectedWithdrawalGroup ? <div className="grid min-h-60 place-items-center text-center"><div><p className="text-lg font-black text-slate-800">Selecciona un grupo</p><p className="mt-2 text-sm text-slate-500">Aquí aparecerá la información completa de sus integrantes.</p></div></div> : <><div className="flex flex-col gap-1 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[.12em] text-emerald-700">Grupo {selectedWithdrawalGroup.groupNumber}</p><h3 className="mt-1 text-xl font-black text-slate-900">{selectedWithdrawalGroup.organizationName}</h3></div><p className="text-sm font-bold text-slate-500">{selectedWithdrawalGroup.periodLabel}</p></div>{loadingGroupId === selectedWithdrawalGroup.id ? <p className="py-8 text-sm font-bold text-slate-500">Cargando integrantes...</p> : <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-2 py-2">Apellidos y nombres</th><th className="px-2 py-2">N° tjta</th><th className="px-2 py-2">DNI</th><th className="px-2 py-2">Clave</th></tr></thead><tbody>{(groupMembers[selectedWithdrawalGroup.id] ?? []).map((member, index) => <tr key={`${member.fullName}-${index}`} className="border-b border-slate-100 last:border-0"><td className="px-2 py-3 font-semibold text-slate-800">{member.fullName}</td><td className="px-2 py-3 text-slate-600">{member.cardNumber}</td><td className="px-2 py-3 text-slate-600">{member.dni}</td><td className="px-2 py-3 text-slate-600">{member.cardKey}</td></tr>)}</tbody></table>{(groupMembers[selectedWithdrawalGroup.id] ?? []).length === 0 && <p className="py-5 text-sm text-slate-500">Este grupo aún no tiene integrantes registrados.</p>}</div>}</>}</div></div></div>}<div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5"><p className="text-sm font-black text-red-900">Zona de limpieza</p><p className="mt-1 text-sm text-red-700">Elimina todos los grupos y retiros que hayas guardado. Esta acción no se puede deshacer.</p>{clearWithdrawalsReady ? <div className="mt-4 flex flex-wrap gap-3"><button disabled={clearingWithdrawals} onClick={clearWithdrawals} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50">{clearingWithdrawals ? 'Limpiando...' : 'Sí, eliminar todo'}</button><button onClick={() => setClearWithdrawalsReady(false)} className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-black text-red-700">Cancelar</button></div> : <button onClick={() => setClearWithdrawalsReady(true)} className="mt-4 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-black text-red-700 hover:bg-red-100">Limpiar todos los retiros</button>}</div></section>}
        {tab === 'Incidencias' && <section className="mt-7 rounded-3xl bg-white p-6 shadow-sm"><h2 className="font-black">Incidencias pendientes</h2><p className="mt-3 rounded-2xl bg-red-50 p-4 text-red-800">La tarjeta de José Luis Mendoza Paredes requiere revisión.</p></section>}
        {tab === 'Usuarios' && <section className="mt-7 rounded-3xl bg-white p-6 shadow-sm"><h2 className="font-black">Usuarios autorizados</h2><div className="mt-4 rounded-2xl bg-emerald-50 p-4"><b>Administrador</b><p className="text-sm text-slate-600">Acceso completo al sistema.</p></div></section>}
      </div>
    </section>
  </div></main>
}
