import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../state/AppContext'
import { gerarPrevistas } from '../lib/recorrencia'
import { parseCentavos, formatBR } from '../lib/format'
import type { Categoria, IntervaloRecorrencia, Recorrencia, TipoRateio } from '../types'

const categorias: Categoria[] = ['aluguel', 'luz', 'agua', 'internet', 'mercado', 'outro']
const labelsCat: Record<Categoria, string> = {
  aluguel: 'Aluguel', luz: 'Luz', agua: 'Água', internet: 'Internet', mercado: 'Mercado', outro: 'Outro',
}

export function Recorrencias() {
  const { casa, moradores, user } = useApp()
  const [recorrencias, setRecorrencias] = useState<Recorrencia[]>([])
  const [modoForm, setModoForm] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const [fornecedor, setFornecedor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [categoria, setCategoria] = useState<Categoria>('luz')
  const [dia, setDia] = useState('10')
  const [intervalo, setIntervalo] = useState<IntervaloRecorrencia>('mensal')
  const [tipoRateio, setTipoRateio] = useState<TipoRateio>('igual')
  const [pagador, setPagador] = useState(user?.id ?? '')
  const [dataInicio, setDataInicio] = useState(() => new Date().toISOString().slice(0, 10))

  const carregar = useCallback(async () => {
    if (!casa) return
    const { data } = await supabase
      .from('recorrencias')
      .select('*')
      .eq('casa_id', casa.id)
      .order('fornecedor')
    setRecorrencias((data ?? []) as Recorrencia[])
  }, [casa])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const criar = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    const valorNum = parseCentavos(valor)
    if (!fornecedor.trim()) return setErro('Informe o fornecedor')
    if (valorNum === null || valorNum <= 0) return setErro('Informe um valor previsto válido')
    const diaNum = Number(dia)
    if (!Number.isInteger(diaNum) || diaNum < 1 || diaNum > 31) return setErro('Dia de vencimento inválido')
    if (!casa) return

    setEnviando(true)
    try {
      const { data: rec, error } = await supabase
        .from('recorrencias')
        .insert({
          casa_id: casa.id,
          fornecedor: fornecedor.trim(),
          descricao: descricao.trim() || null,
          categoria,
          valor_previsto: valorNum,
          data_inicio: dataInicio,
          dia_vencimento: diaNum,
          intervalo,
          tipo_rateio: tipoRateio,
          pagador_padrao: pagador || null,
        })
        .select('*')
        .single()
      if (error) throw error

      const horizonte = new Date()
      horizonte.setMonth(horizonte.getMonth() + 12)
      const prev = gerarPrevistas(rec as Recorrencia, horizonte)
      const hojeInicio = new Date()
      hojeInicio.setHours(0, 0, 0, 0)
      const futuras = prev.filter((p) => p.data >= hojeInicio)

      if (futuras.length) {
        const linhas = futuras.map((p) => ({
          casa_id: casa.id,
          fornecedor: p.fornecedor,
          descricao: p.descricao,
          valor: p.valor_previsto,
          categoria: p.categoria,
          tipo_rateio: rec.tipo_rateio,
          status: 'prevista' as const,
          origem_recorrencia_id: rec.id,
          data: p.data.toISOString().slice(0, 10),
        }))
        const { error: errPrev } = await supabase.from('despesas').insert(linhas)
        if (errPrev) throw errPrev
      }

      setModoForm(false)
      setFornecedor('')
      setDescricao('')
      setValor('')
      await carregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar recorrência')
    } finally {
      setEnviando(false)
    }
  }

  const desativar = async (id: string) => {
    await supabase.from('recorrencias').update({ ativa: false }).eq('id', id)
    await carregar()
  }

  return (
    <>
      <div className="row">
        <h1 style={{ fontSize: 20, margin: 0 }}>Recorrências</h1>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setModoForm((v) => !v)}>
          {modoForm ? 'Fechar' : '+ Nova'}
        </button>
      </div>

      {modoForm && (
        <form className="card mt" onSubmit={criar}>
          <label htmlFor="fornecedor">Fornecedor</label>
          <input id="fornecedor" required value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} placeholder="Ex.: Enel" />

          <label htmlFor="descricao">Descrição (opcional)</label>
          <input id="descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} />

          <div className="field-row">
            <div>
              <label htmlFor="valor">Valor previsto</label>
              <input id="valor" inputMode="decimal" required value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <label htmlFor="categoria">Categoria</label>
              <select id="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)}>
                {categorias.map((c) => <option key={c} value={c}>{labelsCat[c]}</option>)}
              </select>
            </div>
          </div>

          <div className="field-row">
            <div>
              <label>Dia de vencimento</label>
              <input type="number" min={1} max={31} value={dia} onChange={(e) => setDia(e.target.value)} />
            </div>
            <div>
              <label>Repetição</label>
              <select value={intervalo} onChange={(e) => setIntervalo(e.target.value as IntervaloRecorrencia)}>
                <option value="mensal">Mensal</option>
                <option value="semanal">Semanal</option>
                <option value="quinzenal">Quinzenal</option>
                <option value="anual">Anual</option>
              </select>
            </div>
          </div>

          <label>Como dividir?</label>
          <select value={tipoRateio} onChange={(e) => setTipoRateio(e.target.value as TipoRateio)}>
            <option value="igual">Igual para todos</option>
            <option value="percentual">Por percentual fixo</option>
            <option value="consumo">Só quem consumiu</option>
          </select>

          <label htmlFor="pagador">Quem paga por padrão</label>
          <select id="pagador" value={pagador} onChange={(e) => setPagador(e.target.value)}>
            <option value="">Definir na confirmação</option>
            {moradores.map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.nome}</option>
            ))}
          </select>

          <label htmlFor="dataInicio">Começa em</label>
          <input id="dataInicio" type="date" required value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />

          {erro && <div className="error-box">{erro}</div>}

          <button type="submit" className="btn btn-primary mt" disabled={enviando}>
            {enviando ? 'Criando…' : 'Criar recorrência e previsões'}
          </button>
          <p className="small muted mt">Vai gerar automaticamente as próximas 12 previsões para você só confirmar a cada mês.</p>
        </form>
      )}

      {recorrencias.length === 0 ? (
        <div className="empty">Nenhuma recorrência cadastrada.</div>
      ) : (
        recorrencias.map((r) => (
          <div className="card" key={r.id}>
            <div className="row">
              <div>
                <strong>{r.fornecedor}</strong>
                <div className="small muted">
                  {labelsCat[r.categoria]} · dia {r.dia_vencimento ?? '—'} · {r.intervalo}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong className="mono">{formatBR(r.valor_previsto)}</strong>
                {r.ativa ? (
                  <div><button type="button" className="btn btn-sm btn-secondary mt" onClick={() => desativar(r.id)}>Desativar</button></div>
                ) : (
                  <div><span className="badge badge-muted mt">inativa</span></div>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </>
  )
}