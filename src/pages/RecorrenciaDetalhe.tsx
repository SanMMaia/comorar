import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp, nomeMorador } from '../state/AppContext'
import { useDespesas } from '../lib/dados'
import { formatBR, dataBR, estaAtrasada } from '../lib/format'
import { labelsIntervalo, labelsRateio } from '../lib/recorrenciaForm'
import { labelCategoria } from '../lib/categorias'
import type { Despesa, Recorrencia } from '../types'

export function RecorrenciaDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { casa, moradores } = useApp()
  const { despesas, recarregar, carregando } = useDespesas(casa?.id ?? null)
  const [rec, setRec] = useState<Recorrencia | null>(null)
  const [carregado, setCarregado] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    if (!id) return
    const { data, error } = await supabase.from('recorrencias').select('*').eq('id', id).single()
    setCarregado(true)
    if (error || !data) {
      setErro(error?.message ?? 'Recorrência não encontrada')
      return
    }
    setRec(data as unknown as Recorrencia)
  }, [id])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const lancamentos = useMemo(
    () =>
      despesas
        .filter((d) => d.origem_recorrencia_id === id)
        .sort((a, b) => a.data.localeCompare(b.data)),
    [despesas, id],
  )

  const voltar = () => navigate(-1)

  const ignorarMes = async (d: Despesa) => {
    await supabase.from('despesas').update({ status: 'cancelada' }).eq('id', d.id)
    await recarregar()
  }

  const reativarMes = async (d: Despesa) => {
    await supabase.from('despesas').update({ status: 'prevista' }).eq('id', d.id)
    await recarregar()
  }

  if (carregando || !carregado) return <div className="empty">Carregando…</div>

  return (
    <>
      <div className="nav-back">
        <button type="button" onClick={voltar}>
          <span aria-hidden>‹</span> Voltar
        </button>
      </div>

      {!rec ? (
        <div className="empty">{erro || 'Recorrência não encontrada.'}</div>
      ) : (
        <>
          <Link
            to={`/recorrencia/${rec.id}/editar`}
            viewTransition
            className="card mt"
            style={{ display: 'block' }}
          >
            <div className="row">
              <div>
                <div className="row" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                  <h1 className="bar-title">{rec.fornecedor}</h1>
                  {rec.ativa ? (
                    <span className="badge badge-ok">ativa</span>
                  ) : (
                    <span className="badge badge-muted">inativa</span>
                  )}
                </div>
                <div className="small muted">
                  {labelCategoria(rec.categoria, casa?.categorias)} · dia {rec.dia_vencimento ?? '—'} · {labelsIntervalo[rec.intervalo]}
                  {rec.data_fim ? ` · até ${dataBR(rec.data_fim)}` : ''}
                </div>
                {rec.descricao && <div className="small mt">{rec.descricao}</div>}
                <div className="small muted mt">
                  Divisão: <strong>{labelsRateio[rec.tipo_rateio]}</strong>
                  <br />
                  Pagador padrão: <strong>{rec.pagador_padrao ? nomeMorador(moradores, rec.pagador_padrao) : 'definir depois'}</strong>
                  <br />
                  Começa em: <strong>{dataBR(rec.data_inicio)}</strong>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong className="mono" style={{ fontSize: 'var(--text-2xl)' }}>{formatBR(rec.valor_previsto)}</strong>
                <div className="small muted">próximo valor</div>
                <div className="small" style={{ color: 'var(--accent)', marginTop: 'var(--space-2)' }}>
                  ✎ editar ›
                </div>
              </div>
            </div>
          </Link>

          <h2 className="section-title" style={{ marginTop: 'var(--space-5)' }}>Contas</h2>
          {lancamentos.length === 0 ? (
            <div className="empty">
              <div className="empty-icone" aria-hidden>🧾</div>
              <p>Nenhuma conta ainda.</p>
            </div>
          ) : (
            <div className="card-flush mt">
              {lancamentos.map((d) => (
                <div className="list-line" key={d.id}>
                  <div className="item-linha">
                    <div className="item-corpo small">
                      <strong>{dataBR(d.data)}</strong>{' '}
                      {d.status === 'confirmada' && <span className="badge badge-ok">Paga</span>}
                      {d.status === 'cancelada' && <span className="badge badge-muted">Ignorada</span>}
                      {d.status === 'prevista' && estaAtrasada(d.data) && (
                        <span className="badge badge-danger">Atrasada</span>
                      )}
                      {d.status === 'prevista' && !estaAtrasada(d.data) && (
                        <span className="badge badge-warn">A vencer</span>
                      )}
                    </div>
                    <div className="item-lado">
                      <strong className="mono">{formatBR(d.valor)}</strong>
                    </div>
                    {d.status === 'prevista' && (
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => ignorarMes(d)}>
                        Ignorar mês
                      </button>
                    )}
                    {d.status === 'cancelada' && (
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => reativarMes(d)}>
                        Reativar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}