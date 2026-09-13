import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp, nomeMorador } from '../state/AppContext'
import { useDespesas } from '../lib/dados'
import { gravarPrevistas } from '../lib/recorrencia'
import { formatBR, dataBR, parseCentavos } from '../lib/format'
import {
  frmDeRec,
  labelsCat,
  labelsIntervalo,
  labelsRateio,
  validarFrm,
  type Frm,
} from '../lib/recorrenciaForm'
import { CamposForm } from '../components/RecorrenciaForm'
import type { Despesa, Recorrencia } from '../types'

export function RecorrenciaDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { casa, moradores, minhaMoradorId } = useApp()
  const { despesas, recarregar, carregando } = useDespesas(casa?.id ?? null)
  const [rec, setRec] = useState<Recorrencia | null>(null)
  const [carregado, setCarregado] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [editando, setEditando] = useState(false)
  const [formEdit, setFormEdit] = useState<Frm | null>(null)

  const souOwner = moradores.find((m) => m.id === minhaMoradorId)?.role === 'owner'

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

  const alternarAtiva = async () => {
    if (!rec || !casa) return
    await supabase.from('recorrencias').update({ ativa: !rec.ativa }).eq('id', rec.id)
    await carregar()
  }

  const excluir = async () => {
    if (!rec) return
    if (!window.confirm(`Excluir a recorrência "${rec.fornecedor}" e suas previsões futuras? Os lançamentos já confirmados serão mantidos.`)) return
    await supabase.from('despesas').delete().eq('origem_recorrencia_id', rec.id).eq('status', 'prevista')
    await supabase.from('recorrencias').delete().eq('id', rec.id)
    navigate('/projecao', { replace: true })
  }

  const ignorarMes = async (d: Despesa) => {
    await supabase.from('despesas').update({ status: 'cancelada' }).eq('id', d.id)
    await recarregar()
  }

  const reativarMes = async (d: Despesa) => {
    await supabase.from('despesas').update({ status: 'prevista' }).eq('id', d.id)
    await recarregar()
  }

  const salvarEdicao = async () => {
    if (!formEdit || !rec) return
    setErro('')
    const invalido = validarFrm(formEdit)
    if (invalido) return setErro(invalido)
    setEnviando(true)
    try {
      const { data: atualizada, error } = await supabase
        .from('recorrencias')
        .update({
          fornecedor: formEdit.fornecedor.trim(),
          descricao: formEdit.descricao.trim() || null,
          categoria: formEdit.categoria,
          valor_previsto: parseCentavos(formEdit.valor)!,
          data_inicio: formEdit.dataInicio,
          data_fim: formEdit.dataFim.trim() || null,
          dia_vencimento: Number(formEdit.dia),
          intervalo: formEdit.intervalo,
          tipo_rateio: formEdit.tipoRateio,
          pagador_padrao: formEdit.pagador || null,
        })
        .eq('id', rec.id)
        .select('*')
        .single()
      if (error) throw error
      await supabase.from('despesas').delete().eq('origem_recorrencia_id', rec.id).eq('status', 'prevista')
      if (casa) await gravarPrevistas(casa.id, atualizada as Recorrencia)
      setRec(atualizada as Recorrencia)
      setEditando(false)
      setFormEdit(null)
      await recarregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar alterações')
    } finally {
      setEnviando(false)
    }
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
          <div className="row">
            <h1 style={{ fontSize: 20, margin: 0 }}>{rec.fornecedor}</h1>
            {rec.ativa ? <span className="badge badge-ok">ativa</span> : <span className="badge badge-muted">inativa</span>}
          </div>

          <div className="card mt">
            <div className="row">
              <div>
                <div className="small muted">
                  {labelsCat[rec.categoria]} · dia {rec.dia_vencimento ?? '—'} · {labelsIntervalo[rec.intervalo]}
                </div>
                {rec.descricao && <div className="small mt">{rec.descricao}</div>}
                <div className="small muted mt">
                  Rateio: <strong>{labelsRateio[rec.tipo_rateio]}</strong>
                  <br />
                  Pagador padrão: <strong>{rec.pagador_padrao ? nomeMorador(moradores, rec.pagador_padrao) : 'definir depois'}</strong>
                  <br />
                  Começa em: <strong>{dataBR(rec.data_inicio)}</strong>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong className="mono" style={{ fontSize: 20 }}>{formatBR(rec.valor_previsto)}</strong>
                <div className="small muted">valor previsto</div>
              </div>
            </div>
          </div>

          <h2 style={{ fontSize: 15, marginTop: 20 }}>Lançamentos</h2>
          {lancamentos.length === 0 ? (
            <div className="empty">Nenhum lançamento ainda.</div>
          ) : (
            lancamentos.map((d) => (
              <div className="card" key={d.id}>
                <div className="row">
                  <span className="small">
                    {dataBR(d.data)} · {formatBR(d.valor)}{' '}
                    {d.status === 'confirmada' && <span className="badge badge-ok">pago</span>}
                    {d.status === 'cancelada' && <span className="badge badge-muted">ignorado</span>}
                    {d.status === 'prevista' && <span className="badge badge-warn">previsto</span>}
                  </span>
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
            ))
          )}

          {souOwner && (
            <div className="mt" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => {
                  if (editando) {
                    setEditando(false)
                    setFormEdit(null)
                  } else {
                    setEditando(true)
                    setFormEdit(frmDeRec(rec))
                    setErro('')
                  }
                }}
              >
                {editando ? 'Cancelar edição' : 'Editar'}
              </button>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => alternarAtiva()}>
                {rec.ativa ? 'Desativar' : 'Ativar'}
              </button>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => excluir()}>
                Excluir
              </button>
            </div>
          )}

          {editando && formEdit && (
            <form
              className="card mt"
              onSubmit={(e) => {
                e.preventDefault()
                void salvarEdicao()
              }}
            >
              <CamposForm
                f={formEdit}
                onChange={(p) => setFormEdit((prev) => (prev ? { ...prev, ...p } : prev))}
                moradores={moradores}
              />
              {erro && <div className="error-box">{erro}</div>}
              <button type="submit" className="btn btn-primary mt" disabled={enviando}>
                {enviando ? 'Salvando…' : 'Salvar e recalcular previsões'}
              </button>
            </form>
          )}

          {erro && !editando && <div className="error-box mt">{erro}</div>}
        </>
      )}
    </>
  )
}