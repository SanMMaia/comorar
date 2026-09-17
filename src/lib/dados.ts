import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Despesa, Rateio } from '../types'

export interface DespesaComRateios extends Despesa {
  rateios: Rateio[]
}

const cacheDespesas = new Map<string, { despesas: DespesaComRateios[]; ts: number }>()
const CACHE_TTL_MS = 30_000

/** Descarta o cache em memória (após criar/editar/excluir despesas ou rateios). */
export function invalidarCacheDespesas(casaId?: string) {
  if (casaId) cacheDespesas.delete(casaId)
  else cacheDespesas.clear()
}

export function useDespesas(casaId: string | null) {
  const [despesas, setDespesas] = useState<DespesaComRateios[]>(() => {
    const c = casaId ? cacheDespesas.get(casaId) : undefined
    return c && Date.now() - c.ts < CACHE_TTL_MS ? c.despesas : []
  })
  const [carregando, setCarregando] = useState(() => {
    const c = casaId ? cacheDespesas.get(casaId) : undefined
    return !(c && Date.now() - c.ts < CACHE_TTL_MS)
  })

  const carregar = useCallback(
    async () => {
      if (!casaId) {
        setDespesas([])
        setCarregando(false)
        return
      }
      const c = cacheDespesas.get(casaId)
      if (c) {
        // stale-while-revalidate: mostra o cache já e revalida em seguida
        setDespesas(c.despesas)
        setCarregando(false)
      } else {
        setCarregando(true)
      }
      const { data, error } = await supabase
        .from('despesas')
        .select('*, rateios(*)')
        .eq('casa_id', casaId)
        .order('data', { ascending: false })

      if (!error) {
        const lista = (data ?? []) as unknown as DespesaComRateios[]
        cacheDespesas.set(casaId, { despesas: lista, ts: Date.now() })
        setDespesas(lista)
      }
      setCarregando(false)
    },
    [casaId],
  )

  useEffect(() => {
    void carregar()
  }, [carregar])

  return { despesas, carregando, recarregar: carregar }
}

export interface SaldoPessoal {
  direcao: 'devo' | 'me_devem'
  contraparte_id: string
  valor: number
}

/**
 * Saldo do morador logado (o que deve e quem lhe deve). Vem de RPC
 * `meu_saldo`, pois a RLS esconde o rateio de terceiros. `gatilho` dispara
 * nova consulta (ex.: a lista de despesas, que muda após um pagamento).
 */
export function useMeuSaldo(
  casaId: string | null,
  mes: string | null,
  gatilho?: unknown,
) {
  const [saldos, setSaldos] = useState<SaldoPessoal[]>([])

  useEffect(() => {
    if (!casaId) {
      setSaldos([])
      return
    }
    let vivo = true
    void supabase
      .rpc('meu_saldo', { p_casa: casaId, p_mes: mes })
      .then(({ data }) => {
        if (vivo) setSaldos((data ?? []) as SaldoPessoal[])
      })
    return () => {
      vivo = false
    }
  }, [casaId, mes, gatilho])

  return saldos
}

export interface ObrigacaoCalculada {
  devedor_id: string
  credor_id: string
  valor: number
  despesa_id: string
  rateio_id: string
}

/** Obrigações abertas (rateios não pagos) a partir das despesas confirmadas. */
export function obrigacoesDe(
  despesas: DespesaComRateios[],
): ObrigacaoCalculada[] {
  const lista: ObrigacaoCalculada[] = []
  for (const d of despesas) {
    if (d.status !== 'confirmada' || !d.pago_por) continue
    for (const r of d.rateios) {
      if (r.pago) continue
      lista.push({
        devedor_id: r.morador_id,
        credor_id: d.pago_por,
        valor: r.valor_rateado,
        despesa_id: d.id,
        rateio_id: r.id,
      })
    }
  }
  return lista
}