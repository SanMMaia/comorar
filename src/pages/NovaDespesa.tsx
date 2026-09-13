import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../state/AppContext'
import { useDespesas } from '../lib/dados'
import { calcularRateio } from '../lib/rateio'
import { subirComprovante } from '../lib/comprovante'
import { formatBR, dataBR, parseCentavos } from '../lib/format'
import type { Categoria, Despesa, RegraRateio, TipoRateio } from '../types'

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
  const { casa, user, minhaMoradorId, moradores } = useApp()
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
  const [comprovante, setComprovante] = useState<File | null>(null)
  const comprovanteUrl = useMemo(
    () => (comprovante ? URL.createObjectURL(comprovante) : null),
    [comprovante],
  )
  const inputFoto = useRef<HTMLInputElement>(null)
  const [usarPrevisao, setUsarPrevisao] = useState(true)

  useEffect(() => {
    if (!casa) return
    supabase
      .from('regras_rateio')
      .select('*')
      .eq('casa_id', casa.id)
      .then(({ data }) => {
        if (!data?.length) return
        const porUsuario = new Map((data as RegraRateio[]).map((r) => [r.user_id, String(r.percentual)]))
        setPercentuais((prev) => {
          const completo = { ...prev }
          for (const m of moradores) {
            if (m.user_id && porUsuario.has(m.user_id)) {
              completo[m.id] = porUsuario.get(m.user_id)!
            }
          }
          return completo
        })
      })
  }, [casa, moradores])

  const fornecedoresHistoricos = useMemo(
    () => Array.from(new Set(despesas.map((d) => d.fornecedor))).sort(),
    [despesas],
  )

  const previstaMatch = useMemo(() => {
    const f = fornecedor.trim().toLowerCase()
    if (!f) return null
    const alvo = new Date(data)
    const candidatas = despesas.filter(
      (d) => d.status === 'prevista' && d.fornecedor.trim().toLowerCase() === f,
    )
    if (candidatas.length === 0) return null
    const doMes = candidatas.filter((d) => {
      const dt = new Date(d.data)
      return dt.getMonth() === alvo.getMonth() && dt.getFullYear() === alvo.getFullYear()
    })
    const pool = doMes.length > 0 ? doMes : candidatas
    return pool.reduce<Despesa | null>((melhor, d) => {
      const dist = Math.abs(new Date(d.data).getTime() - alvo.getTime())
      if (!melhor) return d
      return Math.abs(new Date(melhor.data).getTime() - alvo.getTime()) <= dist ? melhor : d
    }, null)
  }, [despesas, fornecedor, data])

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
      let comprovante_url: string | null = null
      if (comprovante) {
        comprovante_url = await subirComprovante(casa.id, comprovante)
      }

      if (previstaMatch && usarPrevisao) {
        const { error } = await supabase
          .from('despesas')
          .update({
            status: 'confirmada',
            valor: valorNum,
            pago_por: pagoPorId,
            comprovante_url,
            tipo_rateio: tipoRateio,
            descricao: descricao.trim() || previstaMatch.descricao,
          })
          .eq('id', previstaMatch.id)
        if (error) throw error
        const rows = itens.map((i) => ({
          despesa_id: previstaMatch.id,
          morador_id: i.morador_id,
          valor_rateado: i.valor_rateado,
          pago: i.morador_id === pagoPorId,
          pago_em: i.morador_id === pagoPorId ? new Date().toISOString() : null,
          confirmado_por: i.morador_id === pagoPorId ? (user?.id ?? null) : null,
        }))
        const { error: errRateios } = await supabase.from('rateios').insert(rows)
        if (errRateios) throw errRateios
        navigate(`/despesa/${previstaMatch.id}`)
        return
      }

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
          comprovante_url,
        })
        .select('id')
        .single()
      if (error) throw error

      const rateioRows = itens.map((i) => ({
        despesa_id: despesa.id,
        morador_id: i.morador_id,
        valor_rateado: i.valor_rateado,
        pago: i.morador_id === pagoPorId,
        pago_em: i.morador_id === pagoPorId ? new Date().toISOString() : null,
        confirmado_por: i.morador_id === pagoPorId ? (user?.id ?? null) : null,
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

      <label htmlFor="comprovante">Comprovante / boleto (opcional)</label>
      <input
        ref={inputFoto}
        id="comprovante"
        type="file"
        accept="image/*"
        onChange={(e) => setComprovante(e.target.files?.[0] ?? null)}
      />
      {comprovanteUrl && (
        <div className="card mt" style={{ padding: 10 }}>
          <img src={comprovanteUrl} alt="Comprovante" style={{ width: '100%', borderRadius: 8, display: 'block' }} />
          <button
            type="button"
            className="btn btn-sm btn-secondary mt"
            onClick={() => {
              setComprovante(null)
              if (inputFoto.current) inputFoto.current.value = ''
            }}
          >
            Remover foto
          </button>
        </div>
      )}

      {previstaMatch && (
        <label className="card mt" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, cursor: 'pointer' }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={usarPrevisao}
            onChange={(e) => setUsarPrevisao(e.target.checked)}
          />
          <span className="small">
            Confirmar a previsão <strong>{previstaMatch.fornecedor}</strong> de {dataBR(previstaMatch.data)} (
            {formatBR(previstaMatch.valor)} previstos) em vez de criar outra despesa
          </span>
        </label>
      )}

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