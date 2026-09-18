import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../state/AppContext'
import { gravarPrevistas } from '../lib/recorrencia'
import { invalidarCacheDespesas } from '../lib/dados'
import { formatBR, parseCentavos } from '../lib/format'
import { frmDeRec, validarFrm, type Frm } from '../lib/recorrenciaForm'
import { CamposForm } from '../components/RecorrenciaForm'
import type { Recorrencia } from '../types'

export function RecorrenciaEditar() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { casa, moradores, minhaMoradorId } = useApp()
  const [rec, setRec] = useState<Recorrencia | null>(null)
  const [carregado, setCarregado] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

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

  const [formEdit, setFormEdit] = useState<Frm | null>(null)

  useEffect(() => {
    if (rec && !formEdit) setFormEdit(frmDeRec(rec))
  }, [rec, formEdit])

  const voltar = () => navigate(-1)

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
      const { error: errDel } = await supabase
        .from('despesas')
        .delete()
        .eq('origem_recorrencia_id', rec.id)
        .eq('status', 'prevista')
      if (errDel) throw errDel
      if (casa) await gravarPrevistas(casa.id, atualizada as Recorrencia)
      invalidarCacheDespesas(casa?.id)
      voltar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar alterações')
    } finally {
      setEnviando(false)
    }
  }

  const alternarAtiva = async () => {
    if (!rec) return
    const novoEstado = !rec.ativa
    if (!novoEstado) {
      if (!window.confirm(`Desativar "${rec.fornecedor}"? As previsões futuras serão removidas (os lançamentos pagos são mantidos).`))
        return
    }
    setEnviando(true)
    try {
      if (!novoEstado) {
        const { error: errDel } = await supabase
          .from('despesas')
          .delete()
          .eq('origem_recorrencia_id', rec.id)
          .eq('status', 'prevista')
        if (errDel) throw errDel
      }
      const { data: atualizada, error } = await supabase
        .from('recorrencias')
        .update({ ativa: novoEstado })
        .eq('id', rec.id)
        .select('*')
        .single()
      if (error) throw error
      if (novoEstado && casa) await gravarPrevistas(casa.id, atualizada as Recorrencia)
      invalidarCacheDespesas(casa?.id)
      voltar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao alterar recorrência')
    } finally {
      setEnviando(false)
    }
  }

  const excluir = async () => {
    if (!rec) return
    if (!window.confirm(`Excluir a recorrência "${rec.fornecedor}" e suas previsões futuras? Os lançamentos já confirmados serão mantidos.`))
      return
    await supabase
      .from('despesas')
      .delete()
      .eq('origem_recorrencia_id', rec.id)
      .eq('status', 'prevista')
    await supabase.from('recorrencias').delete().eq('id', rec.id)
    invalidarCacheDespesas(casa?.id)
    navigate('/perfil/contas', { replace: true })
  }

  if (!carregado) return <div className="empty">Carregando…</div>

  return (
    <>
      <div className="nav-back">
        <button type="button" onClick={voltar}>
          <span aria-hidden>‹</span> Voltar
        </button>
      </div>

      {!rec ? (
        <div className="empty">{erro || 'Recorrência não encontrada.'}</div>
      ) : !souOwner ? (
        <div className="empty">
          Somente o dono da casa edita esta recorrência.
          <div className="mt">
            <button type="button" className="btn btn-secondary" onClick={voltar}>
              Voltar
            </button>
          </div>
        </div>
      ) : (
        <>
          <h1 className="page-title">Editar recorrência</h1>
          <div className="small muted mb-lg">
            {rec.fornecedor} · <strong className="mono">{formatBR(rec.valor_previsto)}</strong> por{' '}
            {rec.intervalo}
          </div>

          {formEdit && (
            <form
              className="card"
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
              <button type="button" className="btn btn-secondary mt" onClick={voltar}>
                Cancelar
              </button>
            </form>
          )}

          <div
            className="row mt"
            style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="btn btn-sm btn-secondary" disabled={enviando} onClick={() => void alternarAtiva()}>
              {enviando ? 'Salvando…' : rec.ativa ? 'Desativar' : 'Ativar'}
            </button>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => void excluir()}>
              Excluir
            </button>
          </div>
        </>
      )}
    </>
  )
}