import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../state/AppContext'
import { useDespesas } from '../lib/dados'
import { formatBR, dataBR, mesAnoBR, estaAtrasada } from '../lib/format'
import { labelsIntervalo } from '../lib/recorrenciaForm'
import { labelCategoria } from '../lib/categorias'
import type { Despesa, Recorrencia } from '../types'
import { Confirmacao } from '../components/Confirmacao'

export function Projecao() {
  const { casa } = useApp()
  const navigate = useNavigate()
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

  const ignorarMes = (d: Despesa) => {
    setIgnorando(d)
  }

  const confirmarIgnorar = async () => {
    if (!ignorando) return
    const d = ignorando
    setIgnorando(null)
    await supabase.from('despesas').update({ status: 'cancelada' }).eq('id', d.id)
    setUltimaIgnorada(d)
    await recarregar()
  }

  const desfazerIgnorar = async () => {
    if (!ultimaIgnorada) return
    await supabase.from('despesas').update({ status: 'prevista' }).eq('id', ultimaIgnorada.id)
    setUltimaIgnorada(null)
    await recarregar()
  }

  const [ultimaIgnorada, setUltimaIgnorada] = useState<Despesa | null>(null)
  const [ignorando, setIgnorando] = useState<Despesa | null>(null)

  if (carregando) return <div className="empty">Carregando…</div>

  return (
    <>
      <div className="nav-back">
        <Link to="/perfil" viewTransition>
          <span aria-hidden>‹</span> Voltar
        </Link>
      </div>
      <div className="row">
        <h1 className="bar-title">Contas que se repetem</h1>
        <Link to="/recorrencia/nova" viewTransition className="btn btn-primary btn-sm">
          + Nova
        </Link>
      </div>
      <p className="small muted">Toque em uma conta para ver as próximas contas e gerenciar a recorrência.</p>

      {ultimaIgnorada && (
        <div className="card row mt" style={{ borderLeft: '4px solid var(--warn, #e0a92e)' }}>
          <span className="small">
            <strong>{ultimaIgnorada.fornecedor}</strong> foi ignorada.
          </span>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => void desfazerIgnorar()}>
            Desfazer
          </button>
        </div>
      )}

      {recorrencias.length === 0 ? (
        <div className="empty">
          <div className="empty-icone" aria-hidden>🔁</div>
          <p>Nenhuma conta que se repete por aqui ainda.</p>
        </div>
      ) : (
        <div className="card-flush mt">
          {recorrencias.map((r) => {
            const lancamentos = lancamentosDe(r.id)
            return (
              <Link to={`/recorrencia/${r.id}`} viewTransition key={r.id} className="list-line">
                <div className="item-linha">
                  <div className="item-corpo">
                    <strong>{r.fornecedor}</strong>
                    <div className="small muted">
                      {labelCategoria(r.categoria, casa?.categorias)} · dia {r.dia_vencimento ?? '—'} · {labelsIntervalo[r.intervalo]}
                      {r.data_fim &&
                        ` · até ${new Date(r.data_fim + 'T00:00:00').toLocaleDateString('pt-BR')}`}
                    </div>
                  </div>
                  <div className="item-lado">
                    <strong className="mono">{formatBR(r.valor_previsto)}</strong>
                    {r.ativa
                      ? <span className="badge badge-muted">{lancamentos.length} conta(s)</span>
                      : <span className="badge badge-muted">inativa</span>}
                  </div>
                  <span className="item-seta" aria-hidden>›</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <h2 className="section-title" style={{ marginTop: 'var(--space-6)' }}>Próximas contas</h2>
      {previstas.length === 0 ? (
        <div className="empty">
          <div className="empty-icone" aria-hidden>📆</div>
          <p>Nenhuma próxima conta. Crie uma conta que se repete acima para gerar.</p>
        </div>
      ) : (
        Array.from(previstasPorMes.entries()).map(([chave, grupo]) => {
          const aberto = mesesAbertos.has(chave)
          const [ano, mes] = chave.split('-').map(Number)
          return (
            <div className="card-flush" key={chave}>
              <button type="button" className="link-row list-line" onClick={() => alternarMes(chave)}>
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
                <div style={{ padding: '0 var(--space-4) var(--space-2)' }}>
                  {grupo.lancamentos.map((d) => (
                    <div
                      key={d.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => navigate(`/despesa/${d.id}`)}
                      onKeyDown={(e) => e.key === 'Enter' && navigate(`/despesa/${d.id}`)}
                      className="row clicavel"
                      style={{ padding: 'var(--space-2) 0', borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                    >
                      <div className="small" style={{ flex: 1, minWidth: 0 }}>
                        <strong>{d.fornecedor}</strong>
                        <span className="muted"> · {dataBR(d.data)}</span>
                        {estaAtrasada(d.data) && (
                          <span className="badge badge-danger">Atrasada</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <strong className="mono small">{formatBR(d.valor)}</strong>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={(e) => {
                            e.stopPropagation()
                            ignorarMes(d)
                          }}
                        >
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

      <Confirmacao
        aberto={ignorando !== null}
        titulo={`Ignorar "${ignorando?.fornecedor ?? ''}" de ${ignorando ? dataBR(ignorando.data) : ''}?`}
        mensagem="Esta conta deixa de aparecer aqui, mas a recorrência continua valendo para os próximos meses."
        rotulo="Ignorar"
        onFechar={() => setIgnorando(null)}
        onConfirmar={() => void confirmarIgnorar()}
      />
    </>
  )
}