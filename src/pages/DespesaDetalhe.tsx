import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp, nomeMorador } from '../state/AppContext'
import { invalidarCacheDespesas } from '../lib/dados'
import { subirComprovante, urlComprovante, removerComprovante } from '../lib/comprovante'
import { formatBR, dataBR, estaAtrasada } from '../lib/format'
import { labelCategoria } from '../lib/categorias'
import type { Despesa, ItensDespesa, LeituraMedidor, Parcela, Rateio } from '../types'

interface Detalhe extends Despesa {
  rateios: Rateio[]
  itens_despesa?: ItensDespesa[]
  parcelas?: Parcela[]
}

export function DespesaDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { moradores, minhaMoradorId, user, casa } = useApp()

  const inputBoleto = useRef<HTMLInputElement>(null)

  const [despesa, setDespesa] = useState<Detalhe | null>(null)
  const [foto, setFoto] = useState<string | null>(null)
  const [leituras, setLeituras] = useState<LeituraMedidor[]>([])
  const [leiturasAnteriores, setLeiturasAnteriores] = useState<Record<string, number>>({})
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)

  const souOwner = moradores.find((m) => m.id === minhaMoradorId)?.role === 'owner'

  const detalheDe = async (despesaId: string) => {
    const { data } = await supabase
      .from('despesas')
      .select('*, rateios(*), itens_despesa(*), parcelas(*)')
      .eq('id', despesaId)
      .single()
    if (data) setDespesa(data as unknown as Detalhe)
  }

  useEffect(() => {
    if (!id) return
    let ativo = true
    supabase
      .from('despesas')
      .select('*, rateios(*), itens_despesa(*), parcelas(*)')
      .eq('id', id)
      .single()
      .then(async ({ data, error }) => {
        if (!ativo) return
        setCarregando(false)
        if (error || !data) {
          setErro(error?.message ?? 'Despesa não encontrada')
          return
        }
        const d = data as unknown as Detalhe
        setDespesa(d)
        if (d.comprovante_url) {
          setFoto(await urlComprovante(d.comprovante_url))
        }
        if ((d.categoria === 'agua' || d.categoria === 'luz') && casa?.id) {
          const tipo = d.categoria as 'agua' | 'luz'
          const dataLeitura = d.data.slice(0, 10)
          const [{ data: leiturasHoje }, { data: anteriores }] = await Promise.all([
            supabase
              .from('leituras_medidor')
              .select('*')
              .eq('casa_id', casa.id)
              .eq('tipo', tipo)
              .eq('data_leitura', dataLeitura),
            supabase
              .from('leituras_medidor')
              .select('*')
              .eq('casa_id', casa.id)
              .eq('tipo', tipo)
              .lt('data_leitura', dataLeitura)
              .order('data_leitura', { ascending: false }),
          ])
          if (!ativo) return
          const mapaPrev: Record<string, number> = {}
          for (const l of (anteriores ?? []) as LeituraMedidor[]) {
            if (mapaPrev[l.morador_id] === undefined) mapaPrev[l.morador_id] = l.leitura
          }
          setLeiturasAnteriores(mapaPrev)
          setLeituras((leiturasHoje ?? []) as LeituraMedidor[])
        }
      })
    return () => {
      ativo = false
    }
  }, [id, casa?.id])

  const marcarPago = async (r: Rateio) => {
    await supabase
      .from('rateios')
      .update({ pago: true, pago_em: new Date().toISOString(), confirmado_por: user?.id ?? null })
      .eq('id', r.id)
      .eq('pago', false)
    invalidarCacheDespesas(casa?.id)
    await detalheDe(id!)
  }

  const alternarParcela = async (p: Parcela) => {
    if (!despesa) return
    const { error } = await supabase
      .from('parcelas')
      .update({ paga: !p.paga })
      .eq('id', p.id)
    if (error) return setErro(error.message)
    invalidarCacheDespesas(casa?.id)
    await detalheDe(despesa.id)
  }

  const excluir = async () => {
    if (!despesa) return
    if (!window.confirm(`Excluir a despesa "${despesa.fornecedor}"?`)) return
    if (despesa.comprovante_url) await removerComprovante(despesa.comprovante_url)
    const { error } = await supabase.from('despesas').delete().eq('id', despesa.id)
    if (error) return setErro(error.message)
    invalidarCacheDespesas(casa?.id)
    navigate('/mes')
  }

  const desfazerPagamento = async () => {
    if (!despesa) return
    if (!window.confirm(`Desfazer o pagamento de "${despesa.fornecedor}"? A despesa volta a ser prevista e o rateio é apagado.`)) return
    setErro('')
    try {
      const { error: errRateios } = await supabase.from('rateios').delete().eq('despesa_id', despesa.id)
      if (errRateios) throw errRateios
      if (despesa.comprovante_url) await removerComprovante(despesa.comprovante_url)
      const { error: errUpd } = await supabase
        .from('despesas')
        .update({ status: 'prevista', pago_por: null, comprovante_url: null, ocr_resultado: null })
        .eq('id', despesa.id)
      if (errUpd) throw errUpd
      invalidarCacheDespesas(casa?.id)
      await detalheDe(despesa.id)
      setFoto(null)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao desfazer o pagamento')
    }
  }

  const anexarBoleto = async (file: File) => {
    if (!despesa || !casa) return
    setErro('')
    try {
      const url = await subirComprovante(casa.id, file)
      const { error } = await supabase
        .from('despesas')
        .update({ comprovante_url: url })
        .eq('id', despesa.id)
      if (error) throw error
      if (despesa.comprovante_url) await removerComprovante(despesa.comprovante_url)
      setDespesa({ ...despesa, comprovante_url: url })
      setFoto((await urlComprovante(url)) ?? null)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao anexar boleto')
    }
  }

  const removerBoleto = async () => {
    if (!despesa) return
    setErro('')
    try {
      if (despesa.comprovante_url) await removerComprovante(despesa.comprovante_url)
      const { error } = await supabase
        .from('despesas')
        .update({ comprovante_url: null })
        .eq('id', despesa.id)
      if (error) throw error
      setDespesa({ ...despesa, comprovante_url: null })
      setFoto(null)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao remover boleto')
    }
  }

  if (carregando) return <div className="empty">Carregando…</div>
  if (!despesa) return <div className="empty">{erro || 'Despesa não encontrada.'}</div>

  return (
    <>
      <div className="nav-back">
        <button type="button" onClick={() => navigate(-1)}>
          <span aria-hidden>‹</span> Voltar
        </button>
      </div>

      <div className="row">
        <h1 className="bar-title">{despesa.fornecedor}</h1>
        {despesa.status === 'prevista' && estaAtrasada(despesa.data) && (
          <span className="badge badge-danger">atrasada</span>
        )}
        {despesa.status === 'prevista' && !estaAtrasada(despesa.data) && (
          <span className="badge badge-warn">prevista</span>
        )}
        {despesa.status === 'cancelada' && <span className="badge badge-muted">cancelada</span>}
        {despesa.status === 'confirmada' && <span className="badge badge-ok">confirmada</span>}
        {despesa.parcelada && <span className="badge badge-muted">{despesa.total_parcelas}x</span>}
        {despesa.mercado && <span className="badge badge-muted">mercado</span>}
      </div>

      <div className="card mt">
        <div className="row">
          <div>
            <div className="small muted">{labelCategoria(despesa.categoria, casa?.categorias)} · {dataBR(despesa.data)}</div>
            {despesa.descricao && <div className="small mt">{despesa.descricao}</div>}
            <div className="small muted mt">
              Pago por <strong>{nomeMorador(moradores, despesa.pago_por)}</strong>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="valor mono" style={{ fontSize: 22, fontWeight: 700 }}>
              {formatBR(despesa.valor)}
            </div>
          </div>
        </div>
      </div>

      {foto && (
        <div className="card mt">
          <div className="small muted" style={{ marginBottom: 8 }}>Comprovante</div>
          <a href={foto} target="_blank" rel="noreferrer">
            <img src={foto} alt="Comprovante" style={{ width: '100%', borderRadius: 8, display: 'block' }} />
          </a>
        </div>
      )}

      {despesa.status === 'confirmada' && (
        <>
          <h2 className="section-title" style={{ marginTop: 20 }}>Rateio</h2>
          <div className="card-flush mt">
            {despesa.rateios.map((r) => (
              <div className="list-line" key={r.id}>
                <div className="item-linha">
                  <div className="item-corpo">
                    <strong>{nomeMorador(moradores, r.morador_id)}</strong>
                    <div className="small muted">deve {formatBR(r.valor_rateado)}</div>
                  </div>
                  <div className="item-lado">
                    {r.pago ? (
                      <span className="badge badge-ok">pago</span>
                    ) : (
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => marcarPago(r)}>
                        Marcar pago
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {despesa.itens_despesa && despesa.itens_despesa.length > 0 && (
            <>
              <h2 className="section-title" style={{ marginTop: 20 }}>Itens</h2>
              <div className="card-flush mt">
                {despesa.itens_despesa.map((it) => (
                  <div className="list-line" key={it.id}>
                    <div className="item-linha">
                      <div className="item-corpo">
                        <strong>{it.descricao}</strong>
                        <div className="small muted">
                          {it.donos.length === 0
                            ? 'comum (todos)'
                            : it.donos.map((moId) => nomeMorador(moradores, moId)).join(', ')}
                        </div>
                      </div>
                      <div className="mono">{formatBR(it.valor)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {leituras.length > 0 && (
            <>
              <h2 className="section-title" style={{ marginTop: 20 }}>Leitura do medidor</h2>
              <div className="card-flush mt">
                {leituras.map((l) => {
                  const anterior = leiturasAnteriores[l.morador_id] ?? 0
                  const consumo = Math.max(0, Math.round((l.leitura - anterior) * 10) / 10)
                  const rateio = despesa.rateios.find((r) => r.morador_id === l.morador_id)
                  return (
                    <div className="list-line" key={l.id}>
                      <div className="item-linha">
                        <div className="item-corpo">
                          <strong>{nomeMorador(moradores, l.morador_id)}</strong>
                          <div className="small muted">
                            leitura {l.leitura.toLocaleString('pt-BR')} · consumo {consumo.toLocaleString('pt-BR')}
                          </div>
                        </div>
                        <div className="mono">{formatBR(rateio?.valor_rateado ?? 0)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {despesa.parcelas && despesa.parcelas.length > 0 && (
            <>
              <h2 className="section-title" style={{ marginTop: 20 }}>Parcelas</h2>
              <div className="card-flush mt">
                {despesa.parcelas.map((p) => (
                  <div className="list-line" key={p.id}>
                    <div className="item-linha">
                      <div className="item-corpo">
                        <strong>Parcela {p.numero} de {despesa.total_parcelas}</strong>
                        <div className="small muted">{dataBR(p.data_vencimento)} · {formatBR(p.valor)}</div>
                      </div>
                      <div className="item-lado">
                        {p.paga ? (
                          <span className="badge badge-ok">paga</span>
                        ) : (
                          <button type="button" className="btn btn-sm btn-secondary" onClick={() => void alternarParcela(p)}>
                            Marcar paga
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {erro && <div className="error-box mt">{erro}</div>}

      <div className="card mt">
        <strong>Boleto / comprovante</strong>
        <div className="small muted mt">{despesa.comprovante_url ? 'Anexado — toque para ampliar.' : 'Nenhum boleto anexado.'}</div>
        <input
          ref={inputBoleto}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void anexarBoleto(f)
            e.target.value = ''
          }}
        />
        <div className="row mt" style={{ gap: 8 }}>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => inputBoleto.current?.click()}>
            {despesa.comprovante_url ? 'Substituir boleto' : 'Anexar boleto'}
          </button>
          {despesa.comprovante_url && (
            <button type="button" className="btn btn-sm btn-danger" onClick={() => void removerBoleto()}>
              Remover boleto
            </button>
          )}
        </div>
      </div>

      {souOwner && (
        <>
          <Link
            to={`/despesa/${despesa.id}/editar`}
            viewTransition
            className="btn btn-secondary mt-lg"
            style={{ display: 'block', textAlign: 'center' }}
          >
            ✎ Editar despesa
          </Link>

          {despesa.status === 'confirmada' && despesa.origem_recorrencia_id && (
            <button type="button" className="btn btn-secondary mt" onClick={() => void desfazerPagamento()}>
              ↩ Desfazer pagamento
            </button>
          )}
        </>
      )}

      {souOwner && despesa.status !== 'cancelada' && (
        <button type="button" className="btn btn-danger mt" onClick={excluir}>
          Excluir despesa
        </button>
      )}
    </>
  )
}