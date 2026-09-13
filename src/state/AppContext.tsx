import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Casa, MoradorCompleto } from '../types'

interface AppState {
  user: User | null
  session: Session | null
  loading: boolean
  casa: Casa | null
  moradores: MoradorCompleto[]
  minhaMoradorId: string | null
  refreshCasa: () => Promise<void>
  signOut: () => Promise<void>
}

const AppContext = createContext<AppState>({
  user: null,
  session: null,
  loading: true,
  casa: null,
  moradores: [],
  minhaMoradorId: null,
  refreshCasa: async () => {},
  signOut: async () => {},
})

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [casa, setCasa] = useState<Casa | null>(null)
  const [moradores, setMoradores] = useState<MoradorCompleto[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setLoading(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const loadCasa = async (uid: string) => {
    const { data: membros, error } = await supabase
      .from('casa_morador')
      .select('casa_id, criado_em')
      .eq('user_id', uid)
      .eq('ativo', true)
      .order('criado_em', { ascending: false })

    if (error || !membros?.length) {
      setCasa(null)
      setMoradores([])
      return
    }

    const { data: casaRow } = await supabase
      .from('casas')
      .select('*')
      .eq('id', membros[0].casa_id)
      .single()

    setCasa(casaRow ?? null)

    if (casaRow) {
      const { data: perfis } = await supabase.rpc('casa_moradores', {
        p_casa_id: casaRow.id,
      })
      const completo: MoradorCompleto[] = (perfis ?? []).map(
        (p: {
          id: string
          user_id: string | null
          nome: string | null
          email: string | null
          role: string | null
          tipo: string | null
        }) => ({
          id: p.id,
          user_id: p.user_id,
          nome: p.nome || 'Morador',
          email: p.email ?? '',
          role: (p.role ?? 'member') === 'owner' ? 'owner' : 'member',
          tipo: (p.tipo ?? 'usuario') === 'extra' ? 'extra' : 'usuario',
        }),
      )
      setMoradores(completo)
    } else {
      setMoradores([])
    }
  }

  const refreshCasa = async () => {
    const uid = session?.user?.id
    if (uid) await loadCasa(uid)
  }

  useEffect(() => {
    const uid = session?.user?.id
    if (uid) void loadCasa(uid)
    else {
      setCasa(null)
      setMoradores([])
    }
  }, [session?.user?.id])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const minhaMoradorId = (() => {
    const uid = session?.user?.id
    if (!uid) return null
    return moradores.find((m) => m.user_id === uid)?.id ?? null
  })()

  return (
    <AppContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        casa,
        moradores,
        minhaMoradorId,
        refreshCasa,
        signOut,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}

export function nomeMorador(moradores: MoradorCompleto[], id: string | null): string {
  if (!id) return '—'
  return moradores.find((m) => m.id === id)?.nome ?? id.slice(0, 8)
}