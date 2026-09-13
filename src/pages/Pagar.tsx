import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../state/AppContext'
import { useDespesas } from '../lib/dados'
import { calcularRateio } from '../lib/rateio'
import { subirComprovante } from '../lib/comprovante'
import { formatBR, dataBR, mesAnoBR, parseCentavos } from '../lib/format'
import type { Categoria, Recorrencia, RegraRateio, TipoRateio } from '../types'

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
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const abrirPagamento = (d: { id: string; valor: number; tipo_rateio: TipoRateio; origem_recorrencia_id: string | null }) => {
    setPagandoId(d.id)
    setValorReal(String(d.valor))
    setQuemPagou(recDe(d)?.pagador_padrao ?? minhaMoradorId ?? '')
    setTipoRateioPag(d.tipo_rateio)
    setComprovante(null)
    setErro('')
  }

  const confirmarPagamento = async (d: { id: string }) => {
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

  const ignorar = async (id: string) => {
    await supabase.from('despesas').update({ status: 'cancelada' }).eq('id', id)
    setPagandoId(null)
    await recarregar()
  }

  const [visao, setVisao] = useState<'mes' | 'futuras'>('mes')

  if (carregando) return <div className="empty">Carregando…</div>

  return (
    <>
      <div className="row">
        <h1 style={{ fontSize: 20, margin: 0 }}>Pagar</h1>
        <Link to="/despesa/nova" viewTransition className="btn btn-sm btn-primary">
          + Avulsa
        </Link>
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

      {visao === 'mes' ? (
        doMes.length === 0 ? (
          <div className="empty">
            <strong>Nada a pagar neste mês.</strong>
            <button type="button" className="btn btn-sm btn-secondary mt" onClick={() => setVisao('futuras')}>
              Ver próximas
            </button>
          </div>
        ) : (
          <div className="grid3 mt">
            {doMes.map((d) => {
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
        )
      ) : futurasPorMes.size === 0 ? (
        <div className="empty">
          <strong>Nenhuma conta futura.</strong>
          <Link to="/projecao" viewTransition className="btn btn-sm btn-secondary mt">
            Gerenciar em Contas
          </Link>
        </div>
      ) : (
        Array.from(futurasPorMes.entries()).map(([chave, grupo]) => {
          const [ano, mes] = chave.split('-').map(Number)
          return (
            <div className="card mt" key={chave} style={{ padding: 0 }}>
              <div className="row" style={{ padding: 12 }}>
                <strong>{mesAnoBR(new Date(ano, mes - 1, 1))}</strong>
                <span className="small muted">
                  {grupo.length} conta(s) · <strong className="mono">{formatBR(grupo.reduce((a, b) => a + b.valor, 0))}</strong>
                </span>
              </div>
              {grupo.map((d) => (
                <div className="row" key={d.id} style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
                  <div className="small">
                    <strong>{d.fornecedor}</strong>
                    <span className="muted"> · {dataBR(d.data)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong className="mono small">{formatBR(d.valor)}</strong>
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
                <div className="field-row">
                  <div style={{ flex: 2 }}>
                    <select value={quemPagou} onChange={(e) => setQuemPagou(e.target.value)}>
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
                    onClick={() => confirmarPagamento({ id: d.id })}
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
        <Link to="/projecao" viewTransition className="btn btn-sm btn-secondary">
          Contas
        </Link>
      </p>
    </>
  )
}