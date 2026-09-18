import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../state/AppContext'
import { supabase } from '../lib/supabase'
import { formatBR, mesAnoBR } from '../lib/format'
import { labelCategoria } from '../lib/categorias'

interface LinhaResumo {
  mes: string
  total_confirmado: number
  total_previsto: number
  num_confirmadas: number
  num_previstas: number
  por_categoria: Record<string, number> | null
}

const JANELAS = [3, 6, 12] as const

export function Relatorios() {
  const { casa } = useApp()
  const [janela, setJanela] = useState<(typeof JANELAS)[number]>(6)
  const [linhas, setLinhas] = useState<LinhaResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!casa) return
    let ativo = true
    setCarregando(true)
    setErro('')
    void supabase
      .rpc('resumo_mensal', { p_casa: casa.id, p_meses: janela })
      .then(({ data, error }) => {
        if (!ativo) return
        setLinhas(error ? [] : ((data ?? []) as unknown as LinhaResumo[]))
        if (error) setErro(error.message)
        setCarregando(false)
      })
    return () => {
      ativo = false
    }
  }, [casa, janela])

  const ordenadas = useMemo(() => [...linhas].reverse(), [linhas])

  const maxTotal = useMemo(
    () => Math.max(1, ...linhas.map((l) => Math.max(l.total_confirmado, l.total_previsto))),
    [linhas],
  )

  const pctBarra = (valor: number) => `${Math.min(100, (valor / maxTotal) * 100)}%`

  return (
    <>
      <h1 className="page-title">Relatórios</h1>
      <p className="page-sub">Comparativo mês a mês da casa</p>

      <div className="seg seg-3">
        {JANELAS.map((j) => (
          <button
            key={j}
            type="button"
            className={janela === j ? 'seg-on' : ''}
            onClick={() => setJanela(j)}
          >
            {j} meses
          </button>
        ))}
      </div>

      {erro && <div className="error-box mt">{erro}</div>}

      {carregando ? (
        <div className="empty">Carregando…</div>
      ) : ordenadas.length === 0 ? (
        <div className="empty">
          <div className="empty-icone" aria-hidden>📊</div>
          <p>Ainda não há lançamentos para comparar.</p>
        </div>
      ) : (
        ordenadas.map((l) => {
          const categoriasDestaque = Object.entries(l.por_categoria ?? {})
            .map(([cat, tot]) => ({ cat, tot: Number(tot) || 0 }))
            .sort((a, b) => b.tot - a.tot)
          return (
            <details key={l.mes} className="opcoes card mt">
              <summary>
                <div>
                  <strong>{mesAnoBR(`${l.mes}-01`)}</strong>
                  <div className="small muted">
                    {formatBR(l.total_confirmado)}
                    {l.total_previsto > 0 ? ` confirmados · ${formatBR(l.total_previsto)} previstos` : ''}
                  </div>
                </div>
                <span>
                  {l.num_confirmadas > 0 && <span className="badge badge-ok">{l.num_confirmadas}</span>}
                  {l.num_previstas > 0 && <span className="badge badge-warn" style={{ marginLeft: 'var(--space-1)' }}>{l.num_previstas} prev.</span>}
                </span>
              </summary>
              <div className="opcoes-corpo">
                <div className="row small" style={{ marginBottom: 'var(--space-1)' }}>
                  <span>Confirmado</span>
                  <strong className="mono">{formatBR(l.total_confirmado)}</strong>
                </div>
                <div className="barra" aria-hidden>
                  <div className="barra-fill" style={{ width: pctBarra(l.total_confirmado) }} />
                </div>
                {l.total_previsto > 0 && (
                  <>
                    <div className="row small" style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-1)' }}>
                      <span>Previsto</span>
                      <strong className="mono">{formatBR(l.total_previsto)}</strong>
                    </div>
                    <div className="barra" aria-hidden>
                      <div className="barra-fill previsto" style={{ width: pctBarra(l.total_previsto) }} />
                    </div>
                  </>
                )}
                {categoriasDestaque.length > 0 && (
                  <div className="mt" style={{ marginBottom: 'var(--space-1)' }}>
                    {categoriasDestaque.map((c) => (
                      <div className="row small" key={c.cat} style={{ padding: 'var(--space-1) 0' }}>
                        <span>{labelCategoria(c.cat, casa?.categorias)}</span>
                        <span className="mono">{formatBR(c.tot)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          )
        })
      )}

      <p className="small muted mt-lg" style={{ marginBottom: 0 }}>
        Comparativo cobre as despesas da casa. Navegue para um mês em "Extrato" e veja a lista completa de lançamentos.
      </p>
    </>
  )
}