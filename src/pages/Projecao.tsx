import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../state/AppContext'
import { useDespesas } from '../lib/dados'
import { formatBR, dataBR, mesAnoBR } from '../lib/format'
import { labelsCat, labelsIntervalo } from '../lib/recorrenciaForm'
import type { Despesa, Recorrencia } from '../types'

export function Projecao() {
  const { casa } = useApp()
  const { despesas, recarregar, carregando } = useDespesas(casa?.id ?? null)
  const [recorrencias, setRecorrencias] = useState<Recorrencia[]>([])

  const carregarRec = useCallback(async () => {
    if (!casa) return
    const { data } = await supabase
      .from('recorrencias')
      .select('*')
      .eq('casa_id', casa.id)
      .order('fornecedor')
    setRecorrencias((data ?? []) as Recorrencia[])
  }, [casa])

  useEffect(() => {
    void carregarRec()
  }, [carregarRec])

  const previstas = useMemo(
    () =>
      despesas
        .filter((d) => d.status === 'prevista')
        .sort((a, b) => a.data.localeCompare(b.data)),
    [despesas],
  )

  const chaveMes = (data: string) => data.slice(0, 7)

  const previstasPorMes = useMemo(() => {
    const grupos = new Map<string, { total: number; lancamentos: Despesa[] }>()
    for (const d of previstas) {
      const chave = chaveMes(d.data)
      const grupo = grupos.get(chave)
      if (grupo) {
        grupo.total += d.valor
        grupo.lancamentos.push(d)
      } else {
        grupos.set(chave, { total: d.valor, lancamentos: [d] })
      }
    }
    return grupos
  }, [previstas])

  const [mesesAbertos, setMesesAbertos] = useState<Set<string>>(() => {
    const hoje = new Date()
    const atual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
    const proximo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1)
    const seguinte = `${proximo.getFullYear()}-${String(proximo.getMonth() + 1).padStart(2, '0')}`
    return new Set([atual, seguinte])
  })

  const alternarMes = (chave: string) =>
    setMesesAbertos((prev) => {
      const next = new Set(prev)
      if (next.has(chave)) next.delete(chave)
      else next.add(chave)
      return next
    })

  const lancamentosDe = (recId: string) =>
    despesas
      .filter((d) => d.origem_recorrencia_id === recId)
      .sort((a, b) => a.data.localeCompare(b.data))

  const ignorarMes = async (d: Despesa) => {
    await supabase.from('despesas').update({ status: 'cancelada' }).eq('id', d.id)
    await recarregar()
  }

  if (carregando) return <div className="empty">Carregando…</div>

  return (
    <>
      <div className="nav-back">
        <Link to="/perfil" viewTransition>
          <span aria-hidden>‹</span> Voltar
        </Link>
      </div>
      <div className="row">
        <h1 style={{ fontSize: 20, margin: 0 }}>Contas recorrentes</h1>
        <Link to="/recorrencia/nova" viewTransition className="btn btn-primary btn-sm">
          + Nova
        </Link>
      </div>
      <p className="small muted">Toque em uma conta para ver os lançamentos e gerenciar a recorrência.</p>

      {recorrencias.length === 0 ? (
        <div className="empty">Nenhuma recorrência cadastrada.</div>
      ) : (
        recorrencias.map((r) => {
          const lancamentos = lancamentosDe(r.id)
          return (
            <Link to={`/recorrencia/${r.id}`} viewTransition key={r.id} className="card mt link-card">
              <div className="row">
                <div style={{ textAlign: 'left' }}>
                  <strong>{r.fornecedor}</strong>
                  <div className="small muted">
                    {labelsCat[r.categoria]} · dia {r.dia_vencimento ?? '—'} · {labelsIntervalo[r.intervalo]}
                    {r.data_fim &&
                      ` · até ${new Date(r.data_fim + 'T00:00:00').toLocaleDateString('pt-BR')}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong className="mono">{formatBR(r.valor_previsto)}</strong>
                  <div className="small">
                    {r.ativa ? <span className="badge badge-muted">{lancamentos.length} lançamento(s)</span> : <span className="badge badge-muted">inativa</span>}
                  </div>
                </div>
                <span className="small muted">›</span>
              </div>
            </Link>
          )
        })
      )}

      <h2 style={{ fontSize: 15, marginTop: 24 }}>Próximas contas</h2>
      {previstas.length === 0 ? (
        <div className="empty">Nenhuma previsão ativa. Crie uma recorrência acima para gerar.</div>
      ) : (
        Array.from(previstasPorMes.entries()).map(([chave, grupo]) => {
          const aberto = mesesAbertos.has(chave)
          const [ano, mes] = chave.split('-').map(Number)
          return (
            <div className="card" key={chave} style={{ padding: 0 }}>
              <button type="button" className="link-row" style={{ padding: 14 }} onClick={() => alternarMes(chave)}>
                <div className="row">
                  <div style={{ textAlign: 'left' }}>
                    <strong>{mesAnoBR(new Date(ano, mes - 1, 1))}</strong>
                    <div className="small muted">
                      {aberto ? '▾' : '▸'} {grupo.lancamentos.length} conta(s)
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong className="mono">{formatBR(grupo.total)}</strong>
                  </div>
                </div>
              </button>

              {aberto && (
                <div style={{ padding: '0 14px 8px' }}>
                  {grupo.lancamentos.map((d) => (
                    <div className="row" key={d.id} style={{ padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                      <div className="small">
                        <strong>{d.fornecedor}</strong>
                        <span className="muted"> · {dataBR(d.data)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong className="mono small">{formatBR(d.valor)}</strong>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => ignorarMes(d)}>
                          Ignorar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })
      )}
    </>
  )
}