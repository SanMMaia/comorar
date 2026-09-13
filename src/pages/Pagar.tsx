import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../state/AppContext'
import { useDespesas } from '../lib/dados'
import { calcularRateio } from '../lib/rateio'
import { subirComprovante } from '../lib/comprovante'
import { formatBR, dataBR, parseCentavos } from '../lib/format'
import type { Categoria, Recorrencia, RegraRateio, TipoRateio } from '../types'

const categorias: Categoria[] = ['aluguel', 'luz', 'agua', 'internet', 'mercado', 'outro']
const labels: Record<Categoria, string> = {
  aluguel: 'Aluguel',
  luz: 'Luz',
  agua: 'Água',
  internet: 'Internet',
  mercado: 'Mercado',
  outro: 'Outro',
}

export function Pagar() {
  const { casa, user, minhaMoradorId, moradores } = useApp()
  const { despesas, recarregar, carregando } = useDespesas(casa?.id ?? null)
  const navigate = useNavigate()

  const [recorrencias, setRecorrencias] = useState<Recorrencia[]>([])
  const [regramap, setRegramap] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!casa) return
    supabase
      .from('recorrencias')
      .select('*')
      .eq('casa_id', casa.id)
      .then(({ data }) => setRecorrencias((data ?? []) as Recorrencia[]))
    supabase
      .from('regras_rateio')
      .select('*')
      .eq('casa_id', casa.id)
      .then(({ data }) => {
        const m: Record<string, string> = {}
        for (const r of (data ?? []) as RegraRateio[]) m[r.user_id] = String(r.percentual)
        setRegramap(m)
      })
  }, [casa])

  const percentuaisPorMorador = useMemo(() => {
    const m: Record<string, string> = {}
    for (const mo of moradores) {
      if (mo.user_id && regramap[mo.user_id]) m[mo.id] = regramap[mo.user_id]
    }
    return m
  }, [moradores, regramap])

  const proximas = useMemo(() => {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const porRec = new Map<string, typeof despesas>()
    for (const d of despesas) {
      if (d.status !== 'prevista' || new Date(d.data) < hoje) continue
      const chave = d.origem_recorrencia_id ?? `avulsa:${d.id}`
      if (!porRec.has(chave)) porRec.set(chave, [])
      porRec.get(chave)!.push(d)
    }
    const lista: typeof despesas = []
    for (const grupo of porRec.values()) {
      grupo.sort((a, b) => a.data.localeCompare(b.data))
      lista.push(grupo[0])
    }
    return lista.sort((a, b) => a.data.localeCompare(b.data))
  }, [despesas])

  const recDe = (d: { origem_recorrencia_id: string | null }) =>
    recorrencias.find((r) => r.id === d.origem_recorrencia_id)

  const [pagandoId, setPagandoId] = useState<string | null>(null)
  const [valorReal, setValorReal] = useState('')
  const [quemPagou, setQuemPagou] = useState('')
  const [comprovante, setComprovante] = useState<File | null>(null)
  const comprovanteUrl = useMemo(
    () => (comprovante ? URL.createObjectURL(comprovante) : null),
    [comprovante],
  )
  const inputFoto = useRef<HTMLInputElement>(null)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const abrirPagamento = (d: { id: string; valor: number; origem_recorrencia_id: string | null }) => {
    setPagandoId(d.id)
    setValorReal(String(d.valor))
    setQuemPagou(recDe(d)?.pagador_padrao ?? minhaMoradorId ?? '')
    setComprovante(null)
    setErro('')
  }

  const confirmarPagamento = async (d: {
    id: string
    tipo_rateio: TipoRateio
    valor: number
  }) => {
    setErro('')
    const valorNum = parseCentavos(valorReal)
    if (valorNum === null || valorNum <= 0) return setErro('Valor inválido')
    if (!casa) return
    const pagadorId = quemPagou || minhaMoradorId
    if (!pagadorId) return setErro('Quem pagou?')
    setEnviando(true)
    try {
      let comprovante_url: string | null = null
      if (comprovante) comprovante_url = await subirComprovante(casa.id, comprovante)

      const { error: errUpd } = await supabase
        .from('despesas')
        .update({
          status: 'confirmada',
          valor: valorNum,
          pago_por: pagadorId,
          comprovante_url,
        })
        .eq('id', d.id)
      if (errUpd) throw errUpd

      const itens = calcularRateio(valorNum, moradores.map((m) => ({ user_id: m.id })), {
        regra: d.tipo_rateio,
        percentuais: Object.fromEntries(
          Object.entries(percentuaisPorMorador).map(([k, v]) => [k, Number(v) || 0]),
        ),
        incluidos: moradores.map((m) => m.id),
      })
      const { error: errRateios } = await supabase.from('rateios').insert(
        itens.map((i) => ({
          despesa_id: d.id,
          morador_id: i.morador_id,
          valor_rateado: i.valor_rateado,
          pago: i.morador_id === pagadorId,
          pago_em: i.morador_id === pagadorId ? new Date().toISOString() : null,
          confirmado_por: i.morador_id === pagadorId ? (user?.id ?? null) : null,
        })),
      )
      if (errRateios) throw errRateios

      setPagandoId(null)
      await recarregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao confirmar pagamento')
    } finally {
      setEnviando(false)
    }
  }

  const ignorar = async (id: string) => {
    await supabase.from('despesas').update({ status: 'cancelada' }).eq('id', id)
    setPagandoId(null)
    await recarregar()
  }

  const [avulsa, setAvulsa] = useState(false)

  const [fornecedor, setFornecedor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [categoria, setCategoria] = useState<Categoria>('outro')
  const [pagoPor, setPagoPor] = useState(minhaMoradorId ?? moradores[0]?.id ?? '')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [tipoRateio, setTipoRateio] = useState<TipoRateio>('igual')
  const [incluidos, setIncluidos] = useState<Set<string>>(new Set(moradores.map((m) => m.id)))
  const [percentuais, setPercentuais] = useState<Record<string, string>>({})
  const [avulsaComprovante, setAvulsaComprovante] = useState<File | null>(null)
  const avulsaComprovanteUrl = useMemo(
    () => (avulsaComprovante ? URL.createObjectURL(avulsaComprovante) : null),
    [avulsaComprovante],
  )
  const inputFotoAvulsa = useRef<HTMLInputElement>(null)
  const [erroAvulsa, setErroAvulsa] = useState('')

  const [menuFornecedor, setMenuFornecedor] = useState(false)
  const opcoesFornecedores = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const d of despesas) mapa.set(d.fornecedor.trim().toLowerCase(), d.fornecedor.trim())
    for (const r of recorrencias) mapa.set(r.fornecedor.trim().toLowerCase(), r.fornecedor.trim())
    const lista = Array.from(mapa.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    const termo = fornecedor.trim().toLowerCase()
    return termo ? lista.filter((o) => o.toLowerCase().includes(termo)) : lista
  }, [despesas, recorrencias, fornecedor])

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

  const salvarAvulsa = async (e: FormEvent) => {
    e.preventDefault()
    setErroAvulsa('')
    const pagoPorId = pagoPor || minhaMoradorId
    const valorNum = parseCentavos(valor)
    if (!fornecedor.trim()) return setErroAvulsa('Informe o fornecedor')
    if (valorNum === null || valorNum <= 0) return setErroAvulsa('Informe um valor válido')
    if (!pagoPorId) return setErroAvulsa('Quem pagou?')
    if (!casa) return
    if (tipoRateio === 'consumo' && incluidos.size === 0)
      return setErroAvulsa('Selecione ao menos um morador participante')

    const itens = calcularRateio(valorNum, moradores.map((m) => ({ user_id: m.id })), {
      regra: tipoRateio,
      percentuais: Object.fromEntries(
        Object.entries(percentuais).map(([k, v]) => [k, Number(v) || 0]),
      ),
      incluidos: Array.from(incluidos),
    })
    if (itens.length === 0) return setErroAvulsa('O rateio não possui participantes válidos')

    setEnviando(true)
    try {
      let comprovante_url: string | null = null
      if (avulsaComprovante) comprovante_url = await subirComprovante(casa.id, avulsaComprovante)

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

      const { error: errRateios } = await supabase.from('rateios').insert(
        itens.map((i) => ({
          despesa_id: despesa.id,
          morador_id: i.morador_id,
          valor_rateado: i.valor_rateado,
          pago: i.morador_id === pagoPorId,
          pago_em: i.morador_id === pagoPorId ? new Date().toISOString() : null,
          confirmado_por: i.morador_id === pagoPorId ? (user?.id ?? null) : null,
        })),
      )
      if (errRateios) throw errRateios

      navigate('/mes')
    } catch (err) {
      setErroAvulsa(err instanceof Error ? err.message : 'Erro ao salvar despesa')
    } finally {
      setEnviando(false)
    }
  }

  if (carregando) return <div className="empty">Carregando…</div>

  return (
    <>
      <h1 style={{ fontSize: 20 }}>Pagar</h1>

      <div className="row mt">
        <h2 style={{ fontSize: 15, margin: 0 }}>Próximas contas</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAvulsa((v) => !v)}>
          {avulsa ? 'Fechar' : '+ Avulsa'}
        </button>
      </div>
      <p className="small muted">Toque na conta pagar para confirmar o pagamento do mês.</p>

      {avulsa && (
        <form className="card mt" onSubmit={salvarAvulsa}>
          <label>Fornecedor</label>
          <div className="combobox">
            <input
              value={fornecedor}
              onChange={(e) => setFornecedor(e.target.value)}
              onClick={() => setMenuFornecedor(true)}
              onFocus={() => setMenuFornecedor(true)}
              placeholder="Ex.: Supermercado, janta…"
            />
            <button
              type="button"
              className="combobox-arrow"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setMenuFornecedor((v) => !v)}
              aria-label="Listar fornecedores"
            >
              ▾
            </button>
            {menuFornecedor && opcoesFornecedores.length > 0 && (
              <div className="combobox-menu">
                {opcoesFornecedores.map((o) => (
                  <button
                    type="button"
                    key={o}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setMenuFornecedor(false)
                      setFornecedor(o)
                    }}
                  >
                    {o}
                  </button>
                ))}
              </div>
            )}
          </div>

          <label>Descrição (opcional)</label>
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Compras da semana" />

          <label>Valor</label>
          <input required inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />

          <label>Categoria</label>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)}>
            {categorias.map((c) => (
              <option key={c} value={c}>{labels[c]}</option>
            ))}
          </select>

          <div className="field-row">
            <div>
              <label>Quem pagou</label>
              <select value={pagoPor} onChange={(e) => setPagoPor(e.target.value)}>
                {moradores.map((m) => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Data</label>
              <input type="date" required value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>

          <label>Como dividir?</label>
          <select value={tipoRateio} onChange={(e) => setTipoRateio(e.target.value as TipoRateio)}>
            <option value="igual">Igual para todos</option>
            <option value="percentual">Por percentual</option>
            <option value="consumo">Só quem consumiu</option>
          </select>

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
                      value={percentuais[m.id] ?? percentuaisPorMorador[m.id] ?? ''}
                      onChange={(e) =>
                        setPercentuais((prev) => ({ ...prev, [m.id]: e.target.value.replace(/[^\d.]/g, '') }))
                      }
                    />
                    <span className="muted">%</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <label>Comprovante (opcional)</label>
          <input
            ref={inputFotoAvulsa}
            type="file"
            accept="image/*"
            onChange={(e) => setAvulsaComprovante(e.target.files?.[0] ?? null)}
          />
          {avulsaComprovanteUrl && (
            <img src={avulsaComprovanteUrl} alt="Comprovante" style={{ width: '100%', borderRadius: 8, marginTop: 8, display: 'block' }} />
          )}

          <div className="card mt" style={{ background: 'var(--accent-soft)', border: 'none' }}>
            <div className="row">
              <span className="small">Rateio</span>
              <strong>{saldoMensal !== null ? formatBR(saldoMensal) : '—'}</strong>
            </div>
          </div>

          {erroAvulsa && <div className="error-box">{erroAvulsa}</div>}

          <button type="submit" className="btn btn-primary mt-lg" disabled={enviando}>
            {enviando ? 'Salvando…' : 'Salvar despesa avulsa'}
          </button>
        </form>
      )}

      {proximas.length === 0 ? (
        <div className="empty">
          Nenhuma conta a pagar. Cadastre{' '}
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => navigate('/projecao')}>
            contas recorrentes
          </button>
        </div>
      ) : (
        <div className="grid3 mt">
          {proximas.map((d) => {
            const rec = recDe(d)
            return (
              <div className="card grid-card" key={d.id}>
                <strong className="grid-titulo" title={d.fornecedor}>{d.fornecedor}</strong>
                <span className="small muted">{labels[d.categoria]}</span>
                <span className="mono grid-valor">{formatBR(d.valor)}</span>
                <span className="small muted">{dataBR(d.data)}</span>
                {rec && <span className="badge">recorrente</span>}
                <button type="button" className="btn btn-sm btn-primary mt" onClick={() => abrirPagamento(d)}>
                  Pagar
                </button>
              </div>
            )
          })}
        </div>
      )}

      {pagandoId &&
        (() => {
          const d = proximas.find((p) => p.id === pagandoId)
          if (!d) return null
          return (
            <div className="overlay" onClick={() => setPagandoId(null)}>
              <div className="sheet" onClick={(e) => e.stopPropagation()}>
                <div className="row">
                  <div>
                    <strong>{d.fornecedor}</strong>
                    <div className="small muted">
                      previsto {formatBR(d.valor)} · {dataBR(d.data)}
                    </div>
                  </div>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setPagandoId(null)}>
                    Fechar
                  </button>
                </div>

                <label>Valor real do boleto</label>
                <input inputMode="decimal" value={valorReal} onChange={(e) => setValorReal(e.target.value)} />

                <label>Quem pagou</label>
                <select value={quemPagou} onChange={(e) => setQuemPagou(e.target.value)}>
                  {moradores.map((m) => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
                </select>

                <label>Comprovante (opcional)</label>
                <input
                  ref={inputFoto}
                  type="file"
                  accept="image/*"
                  onChange={(e) => setComprovante(e.target.files?.[0] ?? null)}
                />
                {comprovanteUrl && (
                  <img src={comprovanteUrl} alt="Comprovante" style={{ width: '100%', borderRadius: 8, marginTop: 8, display: 'block' }} />
                )}

                {erro && <div className="error-box">{erro}</div>}

                <div className="row mt">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => ignorar(d.id)}>
                    Ignorar mês
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={enviando}
                    onClick={() => confirmarPagamento({ id: d.id, tipo_rateio: d.tipo_rateio, valor: d.valor })}
                  >
                    {enviando ? '…' : 'Confirmar pagamento'}
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

      <p className="small muted center mt">
        Gerencie recorrências (editar, datas, ignorar) em{' '}
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => navigate('/projecao')}>
          Contas
        </button>
      </p>
    </>
  )
}