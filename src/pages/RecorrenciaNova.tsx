import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../state/AppContext'
import { gravarPrevistas } from '../lib/recorrencia'
import { invalidarCacheDespesas } from '../lib/dados'
import { parseCentavos } from '../lib/format'
import { frmVazio, validarFrm, type Frm } from '../lib/recorrenciaForm'
import { CamposForm } from '../components/RecorrenciaForm'
import type { Recorrencia } from '../types'

export function RecorrenciaNova() {
  const { casa, moradores } = useApp()
  const navigate = useNavigate()
  const [form, setForm] = useState<Frm>(() => frmVazio(''))
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const voltar = () => navigate(-1)

  const criar = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    const invalido = validarFrm(form)
    if (invalido) return setErro(invalido)
    if (!casa) return
    setEnviando(true)
    try {
      const valorNum = parseCentavos(form.valor)!
      const { data: rec, error } = await supabase
        .from('recorrencias')
        .insert({
          casa_id: casa.id,
          fornecedor: form.fornecedor.trim(),
          descricao: form.descricao.trim() || null,
          categoria: form.categoria,
          valor_previsto: valorNum,
          data_inicio: form.dataInicio,
          data_fim: form.dataFim.trim() || null,
          dia_vencimento: Number(form.dia),
          intervalo: form.intervalo,
          tipo_rateio: form.tipoRateio,
          pagador_padrao: form.pagador || null,
        })
        .select('*')
        .single()
      if (error) throw error
      await gravarPrevistas(casa.id, rec as Recorrencia)
      invalidarCacheDespesas(casa.id)
      navigate('/perfil/contas')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar recorrência')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <div className="nav-back">
        <button type="button" onClick={voltar}>
          <span aria-hidden>‹</span> Voltar
        </button>
      </div>

      <h1 className="bar-title">Nova recorrência</h1>
      <p className="small muted">As previsões dos próximos 12 meses são geradas automaticamente.</p>

      <form className="card mt" onSubmit={criar}>
        <CamposForm f={form} onChange={(p) => setForm((prev) => ({ ...prev, ...p }))} moradores={moradores} />
        {erro && <div className="error-box">{erro}</div>}
        <button type="submit" className="btn btn-primary mt" disabled={enviando}>
          {enviando ? 'Criando…' : 'Criar recorrência e previsões'}
        </button>
      </form>
    </>
  )
}