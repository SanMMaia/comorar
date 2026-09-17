import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from './AppContext'
import type { Notificacao } from '../types'

interface Estado {
  notificacoes: Notificacao[]
  naoLidas: number
  carregando: boolean
  marcarLida: (id: string) => Promise<void>
  marcarTodasLidas: () => Promise<void>
  recarregar: () => Promise<void>
}

const Contexto = createContext<Estado>({
  notificacoes: [],
  naoLidas: 0,
  carregando: true,
  marcarLida: async () => {},
  marcarTodasLidas: async () => {},
  recarregar: async () => {},
})

export function NotificacoesProvider({ children }: { children: ReactNode }) {
  const { user } = useApp()
  const uid = user?.id ?? null
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [carregando, setCarregando] = useState(true)

  const carregar = async () => {
    if (!uid) {
      setNotificacoes([])
      setCarregando(false)
      return
    }
    setCarregando(true)
    const { data, error } = await supabase
      .from('notificacoes')
      .select('*')
      .eq('user_id', uid)
      .order('criado_em', { ascending: false })
      .limit(100)
    if (!error) setNotificacoes((data ?? []) as unknown as Notificacao[])
    setCarregando(false)
  }

  useEffect(() => {
    void carregar()
  }, [uid])

  useEffect(() => {
    if (!uid) return
    const canal = supabase
      .channel(`notificacoes:${uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `user_id=eq.${uid}` },
        (payload) => {
          const nova = payload.new as Notificacao
          setNotificacoes((antes) => [nova, ...antes.filter((n) => n.id !== nova.id)])
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notificacoes', filter: `user_id=eq.${uid}` },
        (payload) => {
          const atual = payload.new as Notificacao
          setNotificacoes((antes) => antes.map((n) => (n.id === atual.id ? atual : n)))
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(canal)
    }
  }, [uid])

  const marcarLida = async (id: string) => {
    setNotificacoes((antes) => antes.map((n) => (n.id === id ? { ...n, lida: true } : n)))
    await supabase.from('notificacoes').update({ lida: true }).eq('id', id)
  }

  const marcarTodasLidas = async () => {
    if (naoLidas === 0) return
    setNotificacoes((antes) => antes.map((n) => (n.lida ? n : { ...n, lida: true })))
    await supabase.from('notificacoes').update({ lida: true }).eq('user_id', uid).eq('lida', false)
  }

  const naoLidas = notificacoes.filter((n) => !n.lida).length

  return (
    <Contexto.Provider
      value={{ notificacoes, naoLidas, carregando, marcarLida, marcarTodasLidas, recarregar: carregar }}
    >
      {children}
    </Contexto.Provider>
  )
}

export function useNotificacoes() {
  return useContext(Contexto)
}