import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../state/AppContext'
import { useDespesas } from '../lib/dados'
import { calcularRateio } from '../lib/rateio'
import { subirComprovante } from '../lib/comprovante'
import { parseCentavos } from '../lib/format'
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

export function DespesaAvulsa() {
  const { casa, user, minhaMoradorId, moradores } = useApp()
  const { despesas } = useDespesas(casa?.id ?? null)
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

  const [fornecedor, setFornecedor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [categoria, setCategoria] = useState<Categoria>('outro')
  const [pagoPor, setPagoPor] = useState(minhaMoradorId ?? moradores[0]?.id ?? '')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [tipoRateio, setTipoRateio] = useState<TipoRateio>('igual')
  const [incluidos, setIncluidos] = useState<Set<string>>(new Set(moradores.map((m) => m.id)))
  const [percentuais, setPercentuais] = useState<Record<string, string>>({})
  const [comprovante, setComprovante] = useState<File | null>(null)
  const comprovanteUrl = useMemo(
    () => (comprovante ? URL.createObjectURL(comprovante) : null),
    [comprovante],
  )
  const inputFoto = useRef<HTMLInputElement>(null)
  const [erro, setErro] = useState('')

  const [menuFornecedor, setMenuFornecedor] = useState(false)
  const opcoesFornecedores = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const d of despesas) mapa.set(d.fornecedor.trim().toLowerCase(), d.fornecedor.trim())
    for (const r of recorrencias) mapa.set(r.fornecedor.trim().toLowerCase(), r.fornecedor.trim())
    const lista = Array.from(mapa.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    const termo = fornecedor.trim().toLowerCase()
    return termo ? lista.filter((o) => o.toLowerCase().includes(termo)) : lista
  }, [despesas, recorrencias, fornecedor])

  const toggleIncluido = (id: string) => {
    setIncluidos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const voltar = () => navigate(-1)

  const salvar = async (e: FormEvent) => {
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

    const itens = calcularRateio(valorNum, moradores.map((m) => ({ user_id: m.id })), {
      regra: tipoRateio,
      percentuais: Object.fromEntries(
        Object.entries(percentuais).map(([k, v]) => [k, Number(v) || 0]),
      ),
      incluidos: Array.from(incluidos),
    })
    if (itens.length === 0) return setErro('O rateio não possui participantes válidos')

    try {
      let comprovante_url: string | null = null
      if (comprovante) comprovante_url = await subirComprovante(casa.id, comprovante)

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
      setErro(err instanceof Error ? err.message : 'Erro ao salvar despesa')
    }
  }

  return (
    <>
      <div className="nav-back">
        <button type="button" onClick={voltar}>
          <span aria-hidden>‹</span> Voltar
        </button>
      </div>

      <h1 style={{ fontSize: 20, margin: 0 }}>Nova despesa avulsa</h1>
      <p className="small muted">Lançamento pontual que não se repete todo mês.</p>

      <form className="card mt" onSubmit={salvar}>
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

        <div className="field-row">
          <div>
            <label>Valor</label>
            <input required inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <label>Categoria</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)}>
              {categorias.map((c) => (
                <option key={c} value={c}>{labels[c]}</option>
              ))}
            </select>
          </div>
        </div>

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

        <details className="opcoes">
          <summary>Mais opções</summary>
          <div className="opcoes-corpo">
            <label>Descrição (opcional)</label>
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Compras da semana" />

            <label>Comprovante (opcional)</label>
            <input ref={inputFoto} type="file" accept="image/*" onChange={(e) => setComprovante(e.target.files?.[0] ?? null)} />
            {comprovanteUrl && (
              <img src={comprovanteUrl} alt="Comprovante" style={{ width: '100%', borderRadius: 8, marginTop: 8, display: 'block' }} />
            )}
          </div>
        </details>

        {erro && <div className="error-box">{erro}</div>}

        <button type="submit" className="btn btn-primary mt-lg">Salvar despesa</button>
      </form>
    </>
  )
}