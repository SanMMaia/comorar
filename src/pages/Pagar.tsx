import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../state/AppContext'
import { useDespesas } from '../lib/dados'
import { calcularRateio } from '../lib/rateio'
import { subirComprovante, removerComprovante, urlComprovante } from '../lib/comprovante'
import { lerBoletoLocal, onOcrCarregamento } from '../lib/ocr-local'
import { lerQrDaImagem, parsePixCopiaECola, type PixExtraido } from '../lib/pix'
import type { ResultadoOCR } from '../lib/ocr'
import { formatBR, dataBR, mesAnoBR, parseCentavos, estaAtrasada } from '../lib/format'
import type { Despesa, Recorrencia, RegraRateio, TipoRateio } from '../types'
import { labelCategoria } from '../lib/categorias'
import { DespesaAvulsa } from './DespesaAvulsa'
import { Confirmacao } from '../components/Confirmacao'

export function Pagar() {
  const { casa, user, minhaMoradorId, moradores } = useApp()
  const { despesas, recarregar, carregando } = useDespesas(casa?.id ?? null)

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

  const todasPrevistas = useMemo(
    () =>
      despesas
        .filter((d) => d.status === 'prevista')
        .sort((a, b) => a.data.localeCompare(b.data)),
    [despesas],
  )

  const chaveMes = (data: string) => data.slice(0, 7)

  const chaveAtual = useMemo(() => {
    const agora = new Date()
    return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const doMes = useMemo(
    () => todasPrevistas.filter((d) => chaveMes(d.data) === chaveAtual),
    [todasPrevistas, chaveAtual],
  )

  const futuras = useMemo(
    () => todasPrevistas.filter((d) => chaveMes(d.data) > chaveAtual),
    [todasPrevistas, chaveAtual],
  )

  const futurasPorMes = useMemo(() => {
    const grupos = new Map<string, typeof todasPrevistas>()
    for (const d of futuras) {
      const chave = chaveMes(d.data)
      const g = grupos.get(chave)
      if (g) g.push(d)
      else grupos.set(chave, [d])
    }
    return grupos
  }, [futuras])

  const recDe = (d: { origem_recorrencia_id: string | null }) =>
    recorrencias.find((r) => r.id === d.origem_recorrencia_id)

  const [pagandoId, setPagandoId] = useState<string | null>(null)
  const [valorReal, setValorReal] = useState('')
  const [quemPagou, setQuemPagou] = useState('')
  const [tipoRateioPag, setTipoRateioPag] = useState<TipoRateio>('igual')
  const [comprovante, setComprovante] = useState<File | null>(null)
  const comprovanteUrl = useMemo(
    () => (comprovante ? URL.createObjectURL(comprovante) : null),
    [comprovante],
  )
  const inputFoto = useRef<HTMLInputElement>(null)
  const inputFotoCamera = useRef<HTMLInputElement>(null)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [vencimento, setVencimento] = useState('')
  const [comprovantePath, setComprovantePath] = useState<string | null>(null)
  const [ocrStatus, setOcrStatus] = useState<'ocioso' | 'processando' | 'ok' | 'falha'>('ocioso')
  const [ocrDados, setOcrDados] = useState<ResultadoOCR | null>(null)
  const [ultimaIgnorada, setUltimaIgnorada] = useState<Despesa | null>(null)
  const [ignorando, setIgnorando] = useState<Despesa | null>(null)

  const [boletoId, setBoletoId] = useState<string | null>(null)
  const [boletoArquivo, setBoletoArquivo] = useState<File | null>(null)
  const [boletoPath, setBoletoPath] = useState<string | null>(null)
  const [boletoUrlExistente, setBoletoUrlExistente] = useState<string | null>(null)
  const [boletoOcrStatus, setBoletoOcrStatus] = useState<'ocioso' | 'processando' | 'ok' | 'falha'>('ocioso')
  const [boletoOcrDados, setBoletoOcrDados] = useState<ResultadoOCR | null>(null)
  const [boletoErro, setBoletoErro] = useState('')
  const [boletoEnviando, setBoletoEnviando] = useState(false)
  const [boletoPix, setBoletoPix] = useState<PixExtraido | null>(null)
  const [boletoPixTexto, setBoletoPixTexto] = useState<string | null>(null)
  const [boletoOcrErro, setBoletoOcrErro] = useState('')
  const [ocrBaixando, setOcrBaixando] = useState(false)
  const inputBoleto = useRef<HTMLInputElement>(null)
  const inputBoletoCamera = useRef<HTMLInputElement>(null)

  useEffect(() => {
    onOcrCarregamento(setOcrBaixando)
    return () => onOcrCarregamento(null)
  }, [])

  const processarBoleto = async (arquivo: File) => {
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
        setErro(res.mensagem ?? 'Não foi possível ler o boleto.')
        return
      }
      setOcrDados(res.dados)
      if (res.dados.valor && res.dados.valor > 0) setValorReal(String(res.dados.valor).replace('.', ','))
      if (res.dados.data) setVencimento(res.dados.data)
      setOcrStatus('ok')
    } catch (err) {
      console.error('OCR do boleto falhou:', err)
      setOcrStatus('falha')
    }
  }

  const fecharModal = () => {
    if (comprovantePath) void removerComprovante(comprovantePath)
    setComprovantePath(null)
    setPagandoId(null)
  }

  const aoEscolherArquivo = (e: ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0] ?? null
    setComprovante(arquivo)
    if (arquivo) {
      setOcrDados(null)
      void lerQrDaImagem(arquivo).then((texto) => {
        if (!texto) return
        const pix = parsePixCopiaECola(texto)
        if (pix.valor) setValorReal(String(pix.valor).replace('.', ','))
      })
      void processarBoleto(arquivo)
    } else {
      setOcrStatus('ocioso')
    }
    e.target.value = ''
  }

  const abrirBoleto = async (d: { id: string; boleto_url: string | null }) => {
    setBoletoId(d.id)
    setBoletoArquivo(null)
    setBoletoPath(null)
    setBoletoOcrStatus('ocioso')
    setBoletoOcrDados(null)
    setBoletoErro('')
    setBoletoOcrErro('')
    setBoletoPix(null)
    setBoletoPixTexto(null)
    setBoletoUrlExistente(null)
    if (d.boleto_url) setBoletoUrlExistente(await urlComprovante(d.boleto_url))
  }

  const fecharBoleto = () => {
    if (boletoPath) void removerComprovante(boletoPath)
    setBoletoPath(null)
    setBoletoPix(null)
    setBoletoPixTexto(null)
    setBoletoOcrErro('')
    setBoletoId(null)
  }

  const aoEscolherBoleto = (e: ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0] ?? null
    setBoletoArquivo(arquivo)
    if (arquivo) {
      setBoletoOcrDados(null)
      setBoletoOcrStatus('processando')
      setBoletoErro('')
      setBoletoOcrErro('')
      setBoletoPix(null)
      setBoletoPixTexto(null)
      void lerQrDaImagem(arquivo).then((texto) => {
        if (!texto) return
        const pix = parsePixCopiaECola(texto)
        if (pix.valor || pix.nome || pix.txid) {
          setBoletoPix(pix)
          setBoletoPixTexto(texto)
        }
      })
      void (async () => {
        try {
          const [res, path] = await Promise.all([
            lerBoletoLocal(arquivo),
            casa ? subirComprovante(casa.id, arquivo).catch(() => null) : Promise.resolve(null),
          ])
          if (path) setBoletoPath(path)
          if (!res.ok) {
            setBoletoOcrStatus('falha')
            setBoletoOcrErro(res.mensagem ?? 'Não foi possível ler o boleto.')
            return
          }
          setBoletoOcrDados(res.dados)
          setBoletoOcrStatus('ok')
        } catch (err) {
          console.error('OCR do boleto falhou:', err)
          setBoletoOcrStatus('falha')
        }
      })()
    } else {
      setBoletoOcrStatus('ocioso')
    }
    e.target.value = ''
  }

  const salvarBoleto = async () => {
    if (!boletoId || !casa) return
    setBoletoErro('')
    setBoletoEnviando(true)
    try {
      const d = todasPrevistas.find((p) => p.id === boletoId)
      const updates: Record<string, unknown> = {}
      if (boletoPath) updates.boleto_url = boletoPath
      const valorFinal = boletoOcrDados?.valor ?? boletoPix?.valor
      if (valorFinal && valorFinal > 0) updates.valor = valorFinal
      if (boletoOcrDados?.data) updates.data = boletoOcrDados.data
      const ocrFinal: Record<string, unknown> = boletoOcrDados ? { ...boletoOcrDados } : {}
      if (boletoPix) {
        ocrFinal.pix = boletoPixTexto
        ocrFinal.pix_valor = boletoPix.valor ?? null
        ocrFinal.pix_nome = boletoPix.nome ?? null
        ocrFinal.pix_txid = boletoPix.txid ?? null
      }
      updates.ocr_resultado = Object.keys(ocrFinal).length > 0 ? ocrFinal : null

      const { error: errUpd } = await supabase.from('despesas').update(updates).eq('id', boletoId)
      if (errUpd) throw errUpd
      if (d?.boleto_url && boletoPath && d.boleto_url !== boletoPath) void removerComprovante(d.boleto_url)
      setBoletoId(null)
      setBoletoPath(null)
      await recarregar()
    } catch (err) {
      setBoletoErro(err instanceof Error ? err.message : 'Erro ao salvar boleto')
    } finally {
      setBoletoEnviando(false)
    }
  }

  const removerBoleto = async () => {
    if (!boletoId) return
    const d = todasPrevistas.find((p) => p.id === boletoId)
    if (d?.boleto_url) void removerComprovante(d.boleto_url)
    const { error } = await supabase.from('despesas').update({ boleto_url: null }).eq('id', boletoId)
    if (error) {
      setBoletoErro(error.message)
      return
    }
    setBoletoId(null)
    await recarregar()
  }

  const abrirPagamento = (d: { id: string; valor: number; tipo_rateio: TipoRateio; origem_recorrencia_id: string | null; data: string }) => {
    setPagandoId(d.id)
    setValorReal(String(d.valor))
    setVencimento(d.data.slice(0, 10))
    setQuemPagou(recDe(d)?.pagador_padrao ?? minhaMoradorId ?? '')
    setTipoRateioPag(d.tipo_rateio)
    setComprovante(null)
    setComprovantePath(null)
    setOcrStatus('ocioso')
    setOcrDados(null)
    setErro('')
  }

  const confirmarPagamento = async (d: { id: string }) => {
    setErro('')
    const valorNum = parseCentavos(valorReal)
    if (valorNum === null || valorNum <= 0) return setErro('Valor inválido')
    if (!vencimento) return setErro('Vencimento do boleto?')
    if (!casa) return
    const pagadorId = quemPagou || minhaMoradorId
    if (!pagadorId) return setErro('Quem pagou?')
    setEnviando(true)
    try {
      let comprovante_url: string | null = null
      if (comprovantePath) comprovante_url = comprovantePath
      else if (comprovante) comprovante_url = await subirComprovante(casa.id, comprovante)

      const { data: despesaAtualizada, error: errUpd } = await supabase
        .from('despesas')
        .update({
          status: 'confirmada',
          valor: valorNum,
          data: vencimento,
          pago_por: pagadorId,
          comprovante_url,
          ocr_resultado: ocrDados,
        })
        .eq('id', d.id)
        .eq('status', 'prevista')
        .select('id')
      if (errUpd) throw errUpd
      if (!despesaAtualizada || despesaAtualizada.length === 0) {
        setErro('Pagamento já confirmado antes. Reabrindo a lista…')
        setPagandoId(null)
        await recarregar()
        return
      }

      const itens = calcularRateio(valorNum, moradores.map((m) => ({ user_id: m.id })), {
        regra: tipoRateioPag,
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

  const ignorar = (d: Despesa) => setIgnorando(d)

  const confirmarIgnorar = async () => {
    if (!ignorando) return
    const d = ignorando
    setIgnorando(null)
    await supabase.from('despesas').update({ status: 'cancelada' }).eq('id', d.id)
    if (comprovantePath) await removerComprovante(comprovantePath)
    setComprovantePath(null)
    setPagandoId(null)
    setUltimaIgnorada(d)
    await recarregar()
  }

  const desfazerIgnorar = async () => {
    if (!ultimaIgnorada) return
    await supabase.from('despesas').update({ status: 'prevista' }).eq('id', ultimaIgnorada.id)
    setUltimaIgnorada(null)
    await recarregar()
  }

  const [visao, setVisao] = useState<'mes' | 'futuras'>('mes')
  const [modoAvulsa, setModoAvulsa] = useState(false)

  if (carregando) return <div className="empty">Carregando…</div>

  if (modoAvulsa) {
    return <DespesaAvulsa />
  }

  return (
    <>
      <div className="row">
        <h1 className="bar-title">Pagar</h1>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => setModoAvulsa(true)}>
          + Avulsa
        </button>
      </div>

      <div className="seg mt">
        <button
          type="button"
          className={visao === 'mes' ? 'seg-on' : ''}
          onClick={() => setVisao('mes')}
        >
          Este mês
        </button>
        <button
          type="button"
          className={visao === 'futuras' ? 'seg-on' : ''}
          onClick={() => setVisao('futuras')}
        >
          Próximas
        </button>
      </div>
      <p className="small muted">Pague as contas do mês. Para adiantar uma conta futura, use a aba Próximas.</p>

      <Link to="/perfil/contas" viewTransition className="link-row list-line mt">
        <div className="item-linha">
          <div className="item-corpo">
            <strong>Contas que se repetem</strong>
            <div className="small muted">Ver próximas contas, datas e ignorar meses</div>
          </div>
          <span className="item-seta" aria-hidden>›</span>
        </div>
      </Link>

      {ultimaIgnorada && (
        <div className="card row mt" style={{ borderLeft: '4px solid var(--warn, #e0a92e)' }}>
          <span className="small">
            <strong>{ultimaIgnorada.fornecedor}</strong> foi ignorada.
          </span>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => void desfazerIgnorar()}>
            Desfazer
          </button>
        </div>
      )}

      {visao === 'mes' ? (
        doMes.length === 0 ? (
          <div className="empty">
            <div className="empty-icone" aria-hidden>✅</div>
            <strong>Nada a pagar neste mês.</strong>
            <button type="button" className="btn btn-sm btn-secondary mt" onClick={() => setVisao('futuras')}>
              Ver próximas
            </button>
          </div>
        ) : (
          <div className="grid-cards mt">
            {doMes.map((d) => {
              const rec = recDe(d)
              return (
                <div className="card grid-card" key={d.id}>
                  <Link to={`/despesa/${d.id}`} viewTransition className="grid-titulo" title={d.fornecedor} style={{ textDecoration: 'none' }}>
                    {d.fornecedor}
                  </Link>
                  <span className="small muted">{labelCategoria(d.categoria, casa?.categorias)}</span>
                  <span className="mono grid-valor">{formatBR(d.valor)}</span>
                  <span className="small muted">{dataBR(d.data)}</span>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                    {rec && <span className="badge badge-muted">recorrente</span>}
                    {d.boleto_url && <span className="badge badge-muted">boleto anexado</span>}
                  </div>
                  <div className="grid-acoes">
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => void abrirBoleto(d)}>
                      Boleto
                    </button>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => abrirPagamento(d)}>
                      Pagar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : futurasPorMes.size === 0 ? (
        <div className="empty">
          <div className="empty-icone" aria-hidden>📅</div>
          <strong>Nenhuma conta futura.</strong>
          <Link to="/perfil/contas" viewTransition className="btn btn-sm btn-secondary mt">
            Gerenciar em Contas
          </Link>
        </div>
      ) : (
        Array.from(futurasPorMes.entries()).map(([chave, grupo]) => {
          const [ano, mes] = chave.split('-').map(Number)
          return (
            <div className="card-flush mt" key={chave}>
              <div className="row list-line">
                <strong>{mesAnoBR(new Date(ano, mes - 1, 1))}</strong>
                <span className="small muted">
                  {grupo.length} conta(s) · <strong className="mono">{formatBR(grupo.reduce((a, b) => a + b.valor, 0))}</strong>
                </span>
              </div>
              {grupo.map((d) => (
                <div className="list-line" key={d.id}>
                  <div className="item-linha">
                    <div className="item-corpo small">
                      <Link to={`/despesa/${d.id}`} viewTransition style={{ textDecoration: 'none', color: 'inherit' }}>
                        <strong>{d.fornecedor}</strong>
                      </Link>
                      <span className="muted"> · {dataBR(d.data)}</span>
                    </div>
                    <div className="item-lado">
                      <strong className="mono">{formatBR(d.valor)}</strong>
                    </div>
                  </div>
                  <div className="item-acoes">
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => void abrirBoleto(d)}>
                      Boleto
                    </button>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => abrirPagamento(d)}>
                      Pagar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        })
      )}

      {pagandoId &&
        (() => {
          const d = todasPrevistas.find((p) => p.id === pagandoId)
          if (!d) return null
          return (
            <div className="overlay" onClick={fecharModal}>
              <div className="sheet" onClick={(e) => e.stopPropagation()}>
                <div className="row">
                  <div>
                    <strong>{d.fornecedor}</strong>
                    <div className="small muted">
                      prevista {formatBR(d.valor)} · {dataBR(d.data)}
                      {estaAtrasada(d.data) && (
                        <span className="badge badge-danger">Atrasada</span>
                      )}
                    </div>
                  </div>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={fecharModal}>
                    Fechar
                  </button>
                </div>

                <label>Valor real do boleto</label>
                <input
                  inputMode="decimal"
                  value={valorReal}
                  onChange={(e) => setValorReal(e.target.value)}
                  className={erro.startsWith('Valor inválido') ? 'input-erro' : ''}
                />

                <label>Vencimento real do boleto</label>
                <input
                  type="date"
                  value={vencimento}
                  onChange={(e) => setVencimento(e.target.value)}
                  className={erro === 'Vencimento do boleto?' ? 'input-erro' : ''}
                />

                <label>Quem pagou</label>
                <div className="field-row">
                  <div style={{ flex: 2 }}>
                    <select
                      value={quemPagou}
                      onChange={(e) => setQuemPagou(e.target.value)}
                      className={erro === 'Quem pagou?' ? 'input-erro' : ''}
                    >
                      {moradores.map((m) => (
                        <option key={m.id} value={m.id}>{m.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 3 }}>
                    <select value={tipoRateioPag} onChange={(e) => setTipoRateioPag(e.target.value as TipoRateio)}>
                      <option value="igual">Igual todos</option>
                      <option value="percentual">Por percentual</option>
                      <option value="consumo">Só quem usa</option>
                    </select>
                  </div>
                </div>

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
                  <img src={comprovanteUrl} alt="Comprovante" style={{ width: '100%', borderRadius: 'var(--radius-sm)', marginTop: 'var(--space-2)', display: 'block' }} />
                )}
                {ocrStatus === 'processando' && ocrBaixando && <p className="small muted mt">⬇️ Baixando leitor de boleto (1ª vez)…</p>}
                  {ocrStatus === 'processando' && !ocrBaixando && <p className="small muted mt">🔎 Lendo boleto no aparelho…</p>}
                {ocrStatus === 'ok' && (
                  <p className="small muted mt">✓ Valor e vencimento preenchidos do boleto — confira.</p>
                )}
                {ocrStatus === 'falha' && (
                  <div className="mt">
                    <p className="small muted">Não foi possível ler o boleto — preencha manualmente.</p>
                    {comprovante && (
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary mt"
                        onClick={() => void processarBoleto(comprovante)}
                      >
                        Tentar novamente
                      </button>
                    )}
                  </div>
                )}

                {erro && <div className="error-box">{erro}</div>}

                <div className="row mt">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => ignorar(d)}>
                    Ignorar mês
                  </button>
                  <button
                    type="button"
                    className={`btn btn-primary${enviando ? ' btn-spinner' : ''}`}
                    disabled={enviando}
                    onClick={() => confirmarPagamento({ id: d.id })}
                  >
                    {enviando ? '' : 'Confirmar pagamento'}
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

      {boletoId &&
        (() => {
          const d = todasPrevistas.find((p) => p.id === boletoId)
          if (!d) return null
          const boletoUrlNova = boletoArquivo ? URL.createObjectURL(boletoArquivo) : null
          return (
            <div className="overlay" onClick={fecharBoleto}>
              <div className="sheet" onClick={(e) => e.stopPropagation()}>
                <div className="row">
                  <div>
                    <strong>Boleto</strong>
                    <div className="small muted">
                      {d.fornecedor} · prevista {formatBR(d.valor)} em {dataBR(d.data)}
                    </div>
                  </div>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={fecharBoleto}>
                    Fechar
                  </button>
                </div>

                <p className="small muted mt">
                  Anexe a foto ou scan do boleto (antes de pagar). Se tiver QR Pix, o valor é lido do código; o OCR
                  complementa com vencimento. A previsão é atualizada ao salvar.
                </p>

                {d.boleto_url && !boletoArquivo && (
                  <div className="card mt" style={{ padding: 'var(--space-2)' }}>
                    <div className="small">Boleto salvo:</div>
                    {boletoUrlExistente && (
                      <img
                        src={boletoUrlExistente}
                        alt="Boleto salvo"
                        style={{ width: '100%', borderRadius: 'var(--radius-sm)', display: 'block', margin: 'var(--space-2) 0' }}
                      />
                    )}
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => void removerBoleto()}>
                      Remover boleto
                    </button>
                  </div>
                )}

                <label className="mt">Anexar/atualizar boleto</label>
                <div className="row">
                  <input ref={inputBoleto} type="file" accept="image/*" hidden onChange={aoEscolherBoleto} />
                  <input
                    ref={inputBoletoCamera}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    onChange={aoEscolherBoleto}
                  />
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => inputBoleto.current?.click()}>
                    Importar
                  </button>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => inputBoletoCamera.current?.click()}>
                    Tirar foto
                  </button>
                </div>

                {boletoUrlNova && (
                  <img
                    src={boletoUrlNova}
                    alt="Boleto novo"
                    style={{ width: '100%', borderRadius: 'var(--radius-sm)', marginTop: 'var(--space-2)', display: 'block' }}
                  />
                )}
                {boletoOcrStatus === 'processando' && !boletoPix && !ocrBaixando && <p className="small muted mt">🔎 Lendo boleto no aparelho…</p>}
                {boletoOcrStatus === 'processando' && !boletoPix && ocrBaixando && <p className="small muted mt">⬇️ Baixando leitor de boleto (1ª vez)…</p>}
                {boletoOcrStatus === 'processando' && boletoPix && (
                  <p className="small muted mt">✓ QR lido — aguardando leitura do documento…</p>
                )}
                {boletoPix && (
                  <p className="small mt">
                    ✓ <strong>QR Pix lido</strong>
                    {boletoPix.valor ? (
                      <> · valor <strong className="mono">{formatBR(boletoPix.valor)}</strong></>
                    ) : null}
                    {boletoPix.nome ? <> · {boletoPix.nome}</> : null}
                  </p>
                )}
                {boletoOcrStatus === 'ok' && boletoOcrDados && (
                  <div className="card mt" style={{ padding: 'var(--space-2)' }}>
                    <div className="small">
                      ✓ Lido: valor <strong className="mono">{formatBR(boletoOcrDados.valor ?? d.valor)}</strong>
                      {boletoOcrDados.data && (
                        <>
                          {' '}· vence em <strong>{dataBR(boletoOcrDados.data)}</strong>
                        </>
                      )}
                    </div>
                  </div>
                )}
                {boletoOcrStatus === 'falha' && (
                  <div className="error-box mt">
                    {boletoOcrErro || 'Não foi possível ler o boleto — você ainda pode salvar o anexo.'}
                  </div>
                )}

                {boletoErro && <div className="error-box">{boletoErro}</div>}

                <div className="row mt">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={fecharBoleto}>
                    Descartar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={boletoEnviando || !boletoArquivo}
                    onClick={() => void salvarBoleto()}
                  >
                    {boletoEnviando ? '…' : 'Salvar boleto e atualizar previsão'}
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

      <p className="small muted center mt">
        Só quem é responsável pela casa edita as contas que se repetem.
      </p>

      <Confirmacao
        aberto={ignorando !== null}
        titulo={`Ignorar "${ignorando?.fornecedor ?? ''}" de ${ignorando ? dataBR(ignorando.data) : ''}?`}
        mensagem="Esta conta deixa de aparecer aqui, mas a recorrência continua valendo para os próximos meses. Você pode desfazer."
        rotulo="Ignorar"
        onFechar={() => setIgnorando(null)}
        onConfirmar={() => void confirmarIgnorar()}
      />
    </>
  )
}