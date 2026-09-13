import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../state/AppContext'
import { useDespesas } from '../lib/dados'
import { calcularRateio } from '../lib/rateio'
import { formatBR, parseCentavos } from '../lib/format'
import type { Categoria, TipoRateio } from '../types'

const categorias: Categoria[] = ['aluguel', 'luz', 'agua', 'internet', 'mercado', 'outro']
const labels: Record<Categoria, string> = {
  aluguel: 'Aluguel',
  luz: 'Luz',
  agua: 'Água',
  internet: 'Internet',
  mercado: 'Mercado',
  outro: 'Outro',
}

export function NovaDespesa() {
  const { casa, minhaMoradorId, moradores } = useApp()
  const { despesas } = useDespesas(casa?.id ?? null)
  const navigate = useNavigate()

  const [fornecedor, setFornecedor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [categoria, setCategoria] = useState<Categoria>('outro')
  const [pagoPor, setPagoPor] = useState(minhaMoradorId ?? moradores[0]?.id ?? '')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [tipoRateio, setTipoRateio] = useState<TipoRateio>('igual')
  const [incluidos, setIncluidos] = useState<Set<string>>(new Set(moradores.map((m) => m.id)))
  const [percentuais, setPercentuais] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const fornecedoresHistoricos = useMemo(
    () => Array.from(new Set(despesas.map((d) => d.fornecedor))).sort(),
    [despesas],
  )

  const saldoMensal = useMemo(() => {
    const p = parseCentavos(valor)
    if (p === null) return null
    const itens = calcularRateio(p, moradores.map((m) => ({ user_id: m.id })), {
      regra: tipoRateio,
      percentuais: Object.fromEntries(
        Object.entries(percentuais).map(([k, v]) => [k, Number(v) || 0]),
      ),
      incluidos: Array.from(incluidos),
    })
    return itens.reduce((a, b) => a + b.valor_rateado, 0)
  }, [valor, tipoRateio, percentuais, incluidos, moradores])

  const toggleIncluido = (id: string) => {
    setIncluidos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const setPercentual = (id: string, raw: string) => {
    const limpo = raw.replace(/[^\d.]/g, '')
    setPercentuais((prev) => ({ ...prev, [id]: limpo }))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    const pagoPorId = pagoPor || minhaMoradorId
    const valorNum = parseCentavos(valor)
    if (!fornecedor.trim()) return setErro('Informe o fornecedor')
    if (valorNum === null || valorNum <= 0) return setErro('Informe um valor válido')
    if (!pagoPorId) return setErro('Quem pagou?')
    if (!casa) return
    if (tipoRateio === 'consumo' && incluidos.size === 0)
      return setErro('Selecione ao menos um morador participante')

    const itens = calcularRateio(
      valorNum,
      moradores.map((m) => ({ user_id: m.id })),
      {
        regra: tipoRateio,
        percentuais: Object.fromEntries(
          Object.entries(percentuais).map(([k, v]) => [k, Number(v) || 0]),
        ),
        incluidos: Array.from(incluidos),
      },
    )
    if (itens.length === 0) return setErro('O rateio não possui participantes válidos')

    setEnviando(true)
    try {
      const { data: despesa, error } = await supabase
        .from('despesas')
        .insert({
          casa_id: casa.id,
          fornecedor: fornecedor.trim(),
          descricao: descricao.trim() || null,
          valor: valorNum,
          categoria,
          pago_por: pagoPorId,
          tipo_rateio: tipoRateio,
          status: 'confirmada',
          data,
        })
        .select('id')
        .single()
      if (error) throw error

      const rateioRows = itens.map((i) => ({
        despesa_id: despesa.id,
        morador_id: i.morador_id,
        valor_rateado: i.valor_rateado,
      }))
      const { error: errRateios } = await supabase.from('rateios').insert(rateioRows)
      if (errRateios) throw errRateios

      navigate('/mes')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar despesa')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <h1 style={{ fontSize: 20 }}>Nova despesa</h1>

      <label htmlFor="fornecedor">Fornecedor</label>
      <input
        id="fornecedor"
        list="fornecedores"
        required
        value={fornecedor}
        onChange={(e) => setFornecedor(e.target.value)}
        placeholder="Ex.: Enel, Supermercado Extra"
      />
      <datalist id="fornecedores">
        {fornecedoresHistoricos.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>

      <label htmlFor="descricao">Descrição (opcional)</label>
      <input
        id="descricao"
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        placeholder="Ex.: Conta de luz de junho"
      />

      <label htmlFor="valor">Valor</label>
      <input
        id="valor"
        required
        inputMode="decimal"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="0,00"
      />

      <label htmlFor="categoria">Categoria</label>
      <select id="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)}>
        {categorias.map((c) => (
          <option key={c} value={c}>
            {labels[c]}
          </option>
        ))}
      </select>

      <div className="field-row">
        <div>
          <label htmlFor="pagoPor">Quem pagou</label>
          <select id="pagoPor" value={pagoPor} onChange={(e) => setPagoPor(e.target.value)}>
            {moradores.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="data">Data</label>
          <input id="data" type="date" required value={data} onChange={(e) => setData(e.target.value)} />
        </div>
      </div>

      <label>Como dividir?</label>
      <div className="field-row">
        <select value={tipoRateio} onChange={(e) => setTipoRateio(e.target.value as TipoRateio)}>
          <option value="igual">Igual para todos</option>
          <option value="percentual">Por percentual</option>
          <option value="consumo">Só quem consumiu</option>
        </select>
      </div>

      {tipoRateio === 'consumo' && (
        <div className="card mt">
          {moradores.map((m) => (
            <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, margin: 4 }}>
              <input
                type="checkbox"
                checked={incluidos.has(m.id)}
                onChange={() => toggleIncluido(m.id)}
                style={{ width: 'auto' }}
              />
              {m.nome}
            </label>
          ))}
        </div>
      )}

      {tipoRateio === 'percentual' && (
        <div className="card mt">
          {moradores.map((m) => (
            <div className="row" key={m.id} style={{ margin: '6px 0' }}>
              <span className="small">{m.nome}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="text"
                  inputMode="numeric"
                  style={{ width: 80 }}
                  placeholder="0"
                  value={percentuais[m.id] ?? ''}
                  onChange={(e) => setPercentual(m.id, e.target.value)}
                />
                <span className="muted">%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card mt" style={{ background: 'var(--accent-soft)', border: 'none' }}>
        <div className="row">
          <span className="small">Rateio ({tipoRateio === 'consumo' ? 'participantes' : 'moradores'})</span>
          <strong>{saldoMensal !== null ? formatBR(saldoMensal) : '—'}</strong>
        </div>
      </div>

      {erro && <div className="error-box">{erro}</div>}

      <button type="submit" className="btn btn-primary mt-lg" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Salvar despesa'}
      </button>
    </form>
  )
}