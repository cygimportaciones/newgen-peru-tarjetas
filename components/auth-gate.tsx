'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession()
      const signedIn = Boolean(data.session)

      if (!signedIn && pathname !== '/login') router.replace('/login')
      if (signedIn && pathname === '/login') router.replace('/')
      setReady(true)
    }

    checkSession()
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && pathname !== '/login') router.replace('/login')
    })

    return () => listener.subscription.unsubscribe()
  }, [pathname, router])

  if (!ready && pathname !== '/login') {
    return <div className="grid min-h-screen place-items-center bg-slate-100 text-sm font-black text-slate-500">Verificando acceso...</div>
  }

  return <>{children}</>
}
