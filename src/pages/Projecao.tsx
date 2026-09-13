import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../state/AppContext'
import { useDespesas } from '../lib/dados'
import { gerarPrevistas } from '../lib/recorrencia'
import { formatBR, dataBR, parseCentavos } from '../lib/format'
import type { Categoria, Despesa, IntervaloRecorrencia, Recorrencia, TipoRateio } from '../types'

const categorias: Categoria[] = ['aluguel', 'luz', 'agua', 'internet', 'mercado', 'outro']
const labelsCat: Record<Categoria, string> = {
  aluguel: 'Aluguel', luz: 'Luz', agua: 'Água', internet: 'Internet', mercado: 'Mercado', outro: 'Outro',
}

interface Frm {
  fornecedor: string
  descricao: string
  valor: string
  categoria: Categoria
  dia: string
  intervalo: IntervaloRecorrencia
  tipoRateio: TipoRateio
  pagador: string
  dataInicio: string
}

const frmVazio = (pagador: string): Frm => ({
  fornecedor: '',
  descricao: '',
  valor: '',
  categoria: 'luz',
  dia: '10',
  intervalo: 'mensal',
  tipoRateio: 'igual',
  pagador,
  dataInicio: new Date().toISOString().slice(0, 10),
})

const frmDeRec = (r: Recorrencia): Frm => ({
  fornecedor: r.fornecedor,
  descricao: r.descricao ?? '',
  valor: String(r.valor_previsto),
  categoria: r.categoria,
  dia: String(r.dia_vencimento ?? 10),
  intervalo: r.intervalo,
  tipoRateio: r.tipo_rateio,
  pagador: r.pagador_padrao ?? '',
  dataInicio: r.data_inicio,
})

function validarFrm(f: Frm): string | null {
  if (!f.fornecedor.trim()) return 'Informe o fornecedor'
  const v = parseCentavos(f.valor)
  if (v === null || v <= 0) return 'Informe um valor previsto válido'
  const dia = Number(f.dia)
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) return 'Dia de vencimento inválido'
  return null
}

function CamposForm({ f, onChange, moradores }: { f: Frm; onChange: (p: Partial<Frm>) => void; moradores: { id: string; nome: string }[] }) {
  return (
    <>
      <label>Fornecedor</label>
      <input id="fornecedor" required value={f.fornecedor} onChange={(e) => onChange({ fornecedor: e.target.value })} placeholder="Ex.: Enel" />

      <label>Descrição (opcional)</label>
      <input value={f.descricao} onChange={(e) => onChange({ descricao: e.target.value })} />

      <div className="field-row">
        <div>
          <label>Valor previsto</label>
          <input inputMode="decimal" required value={f.valor} onChange={(e) => onChange({ valor: e.target.value })} placeholder="0,00" />
        </div>
        <div>
          <label>Categoria</label>
          <select value={f.categoria} onChange={(e) => onChange({ categoria: e.target.value as Categoria })}>
            {categorias.map((c) => <option key={c} value={c}>{labelsCat[c]}</option>)}
          </select>
        </div>
      </div>

      <div className="field-row">
        <div>
          <label>Dia de vencimento</label>
          <input type="number" min={1} max={31} value={f.dia} onChange={(e) => onChange({ dia: e.target.value })} />
        </div>
        <div>
          <label>Repetição</label>
          <select value={f.intervalo} onChange={(e) => onChange({ intervalo: e.target.value as IntervaloRecorrencia })}>
            <option value="mensal">Mensal</option>
            <option value="semanal">Semanal</option>
            <option value="quinzenal">Quinzenal</option>
            <option value="anual">Anual</option>
          </select>
        </div>
      </div>

      <label>Como dividir?</label>
      <select value={f.tipoRateio} onChange={(e) => onChange({ tipoRateio: e.target.value as TipoRateio })}>
        <option value="igual">Igual para todos</option>
        <option value="percentual">Por percentual fixo</option>
        <option value="consumo">Só quem consumiu</option>
      </select>

      <label>Quem paga por padrão</label>
      <select value={f.pagador} onChange={(e) => onChange({ pagador: e.target.value })}>
        <option value="">Definir depois</option>
        {moradores.map((m) => (
          <option key={m.id} value={m.id}>{m.nome}</option>
        ))}
      </select>

      <label>Começa em</label>
      <input type="date" required value={f.dataInicio} onChange={(e) => onChange({ dataInicio: e.target.value })} />
    </>
  )
}

export function Projecao() {
  const { casa, moradores, minhaMoradorId } = useApp()
  const { despesas, recarregar, carregando } = useDespesas(casa?.id ?? null)
  const [recorrencias, setRecorrencias] = useState<Recorrencia[]>([])
  const [expandidoId, setExpandidoId] = useState<string | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [formEdit, setFormEdit] = useState<Frm | null>(null)
  const [mostrarNovo, setMostrarNovo] = useState(false)
  const [formNovo, setFormNovo] = useState<Frm>(() => frmVazio(''))
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const souOwner = moradores.find((m) => m.id === minhaMoradorId)?.role === 'owner'

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

  const lancamentosDe = (recId: string) =>
    despesas
      .filter((d) => d.origem_recorrencia_id === recId)
      .sort((a, b) => a.data.localeCompare(b.data))

  const gravarPrevistas = async (casaId: string, rec: Recorrencia) => {
    const horizonte = new Date()
    horizonte.setMonth(horizonte.getMonth() + 12)
    const hojeInicio = new Date()
    hojeInicio.setHours(0, 0, 0, 0)
    const linhas = gerarPrevistas(rec, horizonte)
      .filter((p) => p.data >= hojeInicio)
      .map((p) => ({
        casa_id: casaId,
        fornecedor: p.fornecedor,
        descricao: p.descricao,
        valor: p.valor_previsto,
        categoria: p.categoria,
        tipo_rateio: rec.tipo_rateio,
        status: 'prevista' as const,
        origem_recorrencia_id: rec.id,
        data: p.data.toISOString().slice(0, 10),
      }))
    if (linhas.length) {
      const { error } = await supabase.from('despesas').insert(linhas)
      if (error) throw error
    }
  }

  const criar = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    const invalido = validarFrm(formNovo)
    if (invalido) return setErro(invalido)
    if (!casa) return
    setEnviando(true)
    try {
      const valorNum = parseCentavos(formNovo.valor)!
      const { data: rec, error } = await supabase
        .from('recorrencias')
        .insert({
          casa_id: casa.id,
          fornecedor: formNovo.fornecedor.trim(),
          descricao: formNovo.descricao.trim() || null,
          categoria: formNovo.categoria,
          valor_previsto: valorNum,
          data_inicio: formNovo.dataInicio,
          dia_vencimento: Number(formNovo.dia),
          intervalo: formNovo.intervalo,
          tipo_rateio: formNovo.tipoRateio,
          pagador_padrao: formNovo.pagador || null,
        })
        .select('*')
        .single()
      if (error) throw error
      await gravarPrevistas(casa.id, rec as Recorrencia)
      setMostrarNovo(false)
      setFormNovo(frmVazio(''))
      await carregarRec()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar recorrência')
    } finally {
      setEnviando(false)
    }
  }

  const salvarEdicao = async (rec: Recorrencia) => {
    if (!formEdit) return
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
      setEditandoId(null)
      setFormEdit(null)
      await carregarRec()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar alterações')
    } finally {
      setEnviando(false)
    }
  }

  const alternarAtiva = async (rec: Recorrencia) => {
    await supabase.from('recorrencias').update({ ativa: !rec.ativa }).eq('id', rec.id)
    await carregarRec()
  }

  const excluirRec = async (rec: Recorrencia) => {
    if (!window.confirm(`Excluir a recorrência "${rec.fornecedor}" e suas previsões futuras? Os lançamentos já confirmados serão mantidos.`)) return
    await supabase.from('despesas').delete().eq('origem_recorrencia_id', rec.id).eq('status', 'prevista')
    await supabase.from('recorrencias').delete().eq('id', rec.id)
    await carregarRec()
  }

  const ignorarMes = async (d: Despesa) => {
    await supabase.from('despesas').update({ status: 'cancelada' }).eq('id', d.id)
    await recarregar()
  }

  const reativarMes = async (d: Despesa) => {
    await supabase.from('despesas').update({ status: 'prevista' }).eq('id', d.id)
    await recarregar()
  }

  if (carregando) return <div className="empty">Carregando…</div>

  return (
    <>
      <div className="row">
        <h1 style={{ fontSize: 20, margin: 0 }}>Contas recorrentes</h1>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setMostrarNovo((v) => !v)}>
          {mostrarNovo ? 'Fechar' : '+ Nova'}
        </button>
      </div>
      <p className="small muted">Previsões são geradas automaticamente pelas recorrências. Use “ignorar” quando o mês não tiver cobrança.</p>

      {mostrarNovo && (
        <form className="card mt" onSubmit={criar}>
          <CamposForm f={formNovo} onChange={(p) => setFormNovo((prev) => ({ ...prev, ...p }))} moradores={moradores} />
          {erro && <div className="error-box">{erro}</div>}
          <button type="submit" className="btn btn-primary mt" disabled={enviando}>
            {enviando ? 'Criando…' : 'Criar recorrência e previsões'}
          </button>
        </form>
      )}

      {erro && !mostrarNovo && <div className="error-box">{erro}</div>}

      {recorrencias.length === 0 ? (
        <div className="empty">Nenhuma recorrência cadastrada.</div>
      ) : (
        recorrencias.map((r) => {
          const lancamentos = lancamentosDe(r.id)
          const aberta = expandidoId === r.id
          const editando = editandoId === r.id
          return (
            <div className="card mt" key={r.id}>
              <button type="button" className="link-row" onClick={() => setExpandidoId(aberta ? null : r.id)}>
                <div className="row">
                  <div style={{ textAlign: 'left' }}>
                    <strong>{r.fornecedor}</strong>
                    <div className="small muted">
                      {labelsCat[r.categoria]} · dia {r.dia_vencimento ?? '—'} · {r.intervalo}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong className="mono">{formatBR(r.valor_previsto)}</strong>
                    <div className="small">
                      {r.ativa ? <span className="badge badge-muted">{lancamentos.length} lançamento(s)</span> : <span className="badge badge-muted">inativa</span>}
                    </div>
                  </div>
                </div>
              </button>

              {aberta && (
                <div className="mt">
                  <h2 style={{ fontSize: 14, marginBottom: 6 }}>Lançamentos</h2>
                  {lancamentos.length === 0 ? (
                    <div className="small muted">Nenhum lançamento ainda.</div>
                  ) : (
                    lancamentos.map((d) => (
                      <div className="row" key={d.id} style={{ padding: '4px 0', borderTop: '1px solid var(--border)' }}>
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
                    ))
                  )}

                  {souOwner && (
                    <div className="mt" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => {
                          if (editando) {
                            setEditandoId(null)
                            setFormEdit(null)
                          } else {
                            setEditandoId(r.id)
                            setFormEdit(frmDeRec(r))
                            setErro('')
                          }
                        }}
                      >
                        {editando ? 'Cancelar edição' : 'Editar'}
                      </button>
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => alternarAtiva(r)}>
                        {r.ativa ? 'Desativar' : 'Ativar'}
                      </button>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => excluirRec(r)}>
                        Excluir
                      </button>
                    </div>
                  )}

                  {editando && formEdit && (
                    <div className="card mt">
                      <CamposForm f={formEdit} onChange={(p) => setFormEdit((prev) => (prev ? { ...prev, ...p } : prev))} moradores={moradores} />
                      {erro && <div className="error-box">{erro}</div>}
                      <button
                        type="button"
                        className="btn btn-primary mt"
                        disabled={enviando}
                        onClick={() => salvarEdicao(r)}
                      >
                        {enviando ? 'Salvando…' : 'Salvar e recalcular previsões'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}

      <h2 style={{ fontSize: 15, marginTop: 24 }}>Próximas contas</h2>
      {previstas.length === 0 ? (
        <div className="empty">Nenhuma previsão ativa. Crie ou edite uma recorrência acima para gerar.</div>
      ) : (
        previstas.map((d) => (
          <div className="card" key={d.id}>
            <div className="row">
              <div>
                <strong>{d.fornecedor}</strong>
                <div className="small muted">
                  {labelsCat[d.categoria]} · {dataBR(d.data)} · valor previsto
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong className="mono">{formatBR(d.valor)}</strong>
                <div className="small mt">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => ignorarMes(d)}>
                    Ignorar mês
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </>
  )
}