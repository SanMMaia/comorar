import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../state/AppContext'
import { useDespesas, invalidarCacheDespesas } from '../lib/dados'
import { calcularRateio } from '../lib/rateio'
import {
  removerComprovante,
  subirComprovante,
  urlComprovante,
} from '../lib/comprovante'
import { parseCentavos } from '../lib/format'
import { lerBoletoLocal, onOcrCarregamento } from '../lib/ocr-local'
import { categoriasEfetivas } from '../lib/categorias'
import type { ResultadoOCR } from '../lib/ocr'
import type { Categoria, Despesa, Rateio, Recorrencia, RegraRateio, TipoRateio } from '../types'

export function DespesaAvulsa() {
  const { id } = useParams()
  const editando = Boolean(id)
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
  const [pagoPor, setPagoPor] = useState(minhaMoradorId ?? '')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [tipoRateio, setTipoRateio] = useState<TipoRateio>('igual')
  const [incluidos, setIncluidos] = useState<Set<string>>(new Set(moradores.map((m) => m.id)))
  const [percentuais, setPercentuais] = useState<Record<string, string>>({})
  const [comprovante, setComprovante] = useState<File | null>(null)
  const [comprovanteExistente, setComprovanteExistente] = useState<string | null>(null)
  const [comprovanteUrlExistente, setComprovanteUrlExistente] = useState<string | null>(null)
  const [removerAnexo, setRemoverAnexo] = useState(false)
  const [ocrErro, setOcrErro] = useState('')
  const [ocrBaixando, setOcrBaixando] = useState(false)
  const [comprovantePath, setComprovantePath] = useState<string | null>(null)
  const [ocrStatus, setOcrStatus] = useState<'ocioso' | 'processando' | 'ok' | 'falha'>('ocioso')
  const [ocrDados, setOcrDados] = useState<ResultadoOCR | null>(null)
  const [salvoOK, setSalvoOK] = useState(false)
  const [carregandoEdit, setCarregandoEdit] = useState(editando)
  const comprovanteUrl = useMemo(
    () => (comprovante ? URL.createObjectURL(comprovante) : null),
    [comprovante],
  )
  const inputFoto = useRef<HTMLInputElement>(null)
  const inputFotoCamera = useRef<HTMLInputElement>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    onOcrCarregamento(setOcrBaixando)
    return () => onOcrCarregamento(null)
  }, [])

  const aoEscolherArquivo = (e: ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0] ?? null
    setComprovante(arquivo)
    if (arquivo) {
      setRemoverAnexo(false)
      setOcrDados(null)
      setOcrErro('')
      void processarOCR(arquivo)
    } else {
      setOcrStatus('ocioso')
      setOcrErro('')
    }
    e.target.value = ''
  }

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

  useEffect(() => {
    if (!id || !casa) return
    let ativo = true
    supabase
      .from('despesas')
      .select('*')
      .eq('id', id)
      .single()
      .then(async ({ data, error }) => {
        if (!ativo || error || !data) return
        const d = data as unknown as Despesa
        setFornecedor(d.fornecedor)
        setDescricao(d.descricao ?? '')
        setValor(String(d.valor).replace('.', ','))
        setCategoria((d.categoria ?? 'outro') as Categoria)
        setPagoPor(d.pago_por ?? minhaMoradorId ?? '')
        setData(d.data.slice(0, 10))
        setTipoRateio((d.tipo_rateio ?? 'igual') as TipoRateio)
        setComprovanteExistente(d.comprovante_url)
        if (d.comprovante_url) {
          setComprovanteUrlExistente((await urlComprovante(d.comprovante_url)) ?? null)
        }
        const { data: rateios } = await supabase
          .from('rateios')
          .select('*')
          .eq('despesa_id', d.id)
        if (!ativo) return
        const rs = (rateios ?? []) as Rateio[]
        setIncluidos(new Set(rs.map((r) => r.morador_id)))
        const pct: Record<string, string> = {}
        for (const r of rs) {
          const p = d.valor > 0 ? (r.valor_rateado / d.valor) * 100 : 0
          pct[r.morador_id] = String(Math.round(p * 10) / 10)
        }
        setPercentuais(pct)
        setCarregandoEdit(false)
      })
    return () => {
      ativo = false
    }
  }, [id, casa, minhaMoradorId, moradores])

  const processarOCR = async (arquivo: File) => {
    setOcrStatus('processando')
    setErro('')
    try {
      const [res, path] = await Promise.all([
        lerBoletoLocal(arquivo),
        casa ? subirComprovante(casa.id, arquivo).catch(() => null) : Promise.resolve(null),
      ])
      if (path) setComprovantePath(path)
      if (!res.ok) {
        setOcrStatus('falha')
        setOcrErro(res.mensagem ?? 'Não foi possível ler o comprovante.')
        return
      }
      const dados = res.dados
      setOcrDados(dados)
      if (dados.fornecedor) setFornecedor(dados.fornecedor)
      if (dados.valor && dados.valor > 0) setValor(String(dados.valor).replace('.', ','))
      if (dados.data) setData(dados.data)
      if (dados.categoria) setCategoria(dados.categoria)
      setOcrStatus('ok')
    } catch (err) {
      console.error('OCR falhou:', err)
      setOcrStatus('falha')
    }
  }

  const voltar = () => {
    if (comprovantePath && !salvoOK) void removerComprovante(comprovantePath)
    navigate(-1)
  }

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

    if (tipoRateio === 'percentual') {
      const soma = Object.values(percentuais).reduce((acc, v) => acc + (Number(v) || 0), 0)
      if (Math.abs(soma - 100) > 0.5) return setErro(`Percentuais somam ${soma}% — revise para 100%`)
    }

    const itens = calcularRateio(valorNum, moradores.map((m) => ({ user_id: m.id })), {
      regra: tipoRateio,
      percentuais: Object.fromEntries(
        Object.entries(percentuais).map(([k, v]) => [k, Number(v) || 0]),
      ),
      incluidos: Array.from(incluidos),
    })
    if (itens.length === 0) return setErro('O rateio não possui participantes válidos')

    try {
      let comprovante_url: string | null = comprovanteExistente
      if (comprovantePath) comprovante_url = comprovantePath
      else if (comprovante) comprovante_url = await subirComprovante(casa.id, comprovante)
      if (removerAnexo) {
        comprovante_url = null
        if (comprovantePath) {
          await removerComprovante(comprovantePath)
          setComprovantePath(null)
          setOcrStatus('ocioso')
        }
      }

      let despesaId = id
      if (editando && id) {
        const { error } = await supabase
          .from('despesas')
          .update({
            fornecedor: fornecedor.trim(),
            descricao: descricao.trim() || null,
            valor: valorNum,
            categoria,
            pago_por: pagoPorId,
            tipo_rateio: tipoRateio,
            data,
            comprovante_url,
            ocr_resultado: ocrDados,
          })
          .eq('id', id)
        if (error) throw error
        await supabase.from('rateios').delete().eq('despesa_id', id)
        if (comprovanteExistente && (comprovante || comprovantePath || removerAnexo)) {
          await removerComprovante(comprovanteExistente)
        }
      } else {
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
            ocr_resultado: ocrDados,
          })
          .select('id')
          .single()
        if (error) throw error
        despesaId = despesa.id
      }

      const { error: errRateios } = await supabase.from('rateios').insert(
        itens.map((i) => ({
          despesa_id: despesaId,
          morador_id: i.morador_id,
          valor_rateado: i.valor_rateado,
          pago: i.morador_id === pagoPorId,
          pago_em: i.morador_id === pagoPorId ? new Date().toISOString() : null,
          confirmado_por: i.morador_id === pagoPorId ? (user?.id ?? null) : null,
        })),
      )
      if (errRateios) throw errRateios

      setSalvoOK(true)
      invalidarCacheDespesas(casa.id)

      if (editando) navigate(-1)
      else navigate('/mes')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar despesa')
    }
  }

  if (carregandoEdit) return <div className="empty">Carregando…</div>

  return (
    <>
      <div className="nav-back">
        <button type="button" onClick={voltar}>
          <span aria-hidden>‹</span> Voltar
        </button>
      </div>

      <h1 className="bar-title">{editando ? 'Editar despesa' : 'Nova despesa avulsa'}</h1>
      <p className="small muted">
        {editando
          ? 'Altere os dados e o rateio deste lançamento.'
          : 'Lançamento pontual que não se repete todo mês.'}
      </p>

      <form className="card mt" onSubmit={salvar}>
        <label>Fornecedor</label>
        <div className="combobox">
          <input
            value={fornecedor}
            onChange={(e) => setFornecedor(e.target.value)}
            onClick={() => setMenuFornecedor(true)}
            onFocus={() => setMenuFornecedor(true)}
            placeholder="Ex.: Supermercado, janta…"
            className={erro.toLowerCase().includes('fornecedor') ? 'input-erro' : ''}
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
            <input
              required
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              className={erro.toLowerCase().includes('valor inválido') ? 'input-erro' : ''}
            />
          </div>
          <div>
            <label>Categoria</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {categoriasEfetivas(casa?.categorias).map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field-row">
          <div>
            <label>Quem pagou</label>
            <select
              value={pagoPor}
              onChange={(e) => setPagoPor(e.target.value)}
              className={erro === 'Quem pagou?' ? 'input-erro' : ''}
            >
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
            <div className="row">
              <input ref={inputFoto} type="file" accept="image/*" hidden onChange={aoEscolherArquivo} />
              <input
                ref={inputFotoCamera}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={aoEscolherArquivo}
              />
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => inputFoto.current?.click()}>
                Importar
              </button>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => inputFotoCamera.current?.click()}>
                Tirar foto
              </button>
            </div>
            {comprovanteUrl && (
              <img src={comprovanteUrl} alt="Comprovante" style={{ width: '100%', borderRadius: 8, marginTop: 8, display: 'block' }} />
            )}
            {ocrStatus === 'processando' && ocrBaixando && (
              <p className="small muted mt">⬇️ Baixando leitor de comprovante (1ª vez)…</p>
            )}
            {ocrStatus === 'processando' && !ocrBaixando && (
              <p className="small muted mt">🔎 Lendo comprovante no aparelho…</p>
            )}
            {ocrStatus === 'ok' && (
              <p className="small muted mt">✓ Dados preenchidos pelo OCR — confira antes de salvar.</p>
            )}
            {ocrStatus === 'falha' && (
              <div className="mt">
                <div className="error-box">{(ocrErro || 'Não foi possível ler o comprovante automaticamente')}</div>
                {comprovante && (
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary mt"
                    onClick={() => void processarOCR(comprovante)}
                  >
                    Tentar novamente
                  </button>
                )}
              </div>
            )}
            {editando && comprovanteUrlExistente && comprovanteExistente && !removerAnexo && (
              <div className="mt">
                <img
                  src={comprovanteUrlExistente}
                  alt="Boleto atual"
                  style={{ width: '100%', borderRadius: 8, display: 'block' }}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-secondary mt"
                  onClick={() => setRemoverAnexo(true)}
                >
                  Remover boleto
                </button>
              </div>
            )}
            {removerAnexo && <p className="small muted mt">O boleto atual será removido ao salvar.</p>}
          </div>
        </details>

        {erro && <div className="error-box">{erro}</div>}

        <button type="submit" className="btn btn-primary mt-lg">
              {editando ? 'Salvar alterações' : 'Salvar despesa'}
            </button>
      </form>
    </>
  )
}