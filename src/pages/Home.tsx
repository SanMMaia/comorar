import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useApp, nomeMorador } from '../state/AppContext'
import { useDespesas } from '../lib/dados'
import { formatBR, dataBR, mesAnoBR, estaAtrasada } from '../lib/format'
import { labelCategoria } from '../lib/categorias'

export function Home() {
  const { casa, minhaMoradorId, moradores, loading } = useApp()
  const { despesas, carregando } = useDespesas(casa?.id ?? null)

  const { totalMes, vcDeve, devemAVoce } = useMemo(() => {
    const uid = minhaMoradorId
    const chaveAtual = new Date().toISOString().slice(0, 7)
    let totalMes = 0
    let vcDeve = 0
    let devemAVoce = 0
    for (const d of despesas) {
      if (d.status !== 'confirmada') continue
      if (d.data.slice(0, 7) !== chaveAtual) continue
      totalMes += d.valor
      const aberto = d.rateios.filter((r) => !r.pago)
      for (const r of aberto) {
        if (uid && r.morador_id === uid) vcDeve += r.valor_rateado
        if (uid && d.pago_por === uid) devemAVoce += r.valor_rateado
      }
    }
    return {
      totalMes,
      vcDeve: Math.round(vcDeve * 100) / 100,
      devemAVoce: Math.round(devemAVoce * 100) / 100,
    }
  }, [despesas, minhaMoradorId])

  const previstasMes = useMemo(() => {
    const chaveAtual = new Date().toISOString().slice(0, 7)
    return despesas
      .filter((d) => d.status === 'prevista' && d.data.slice(0, 7) === chaveAtual)
      .sort((a, b) => a.data.localeCompare(b.data))
  }, [despesas])

  const totalPrevisto = useMemo(() => previstasMes.reduce((a, b) => a + b.valor, 0), [previstasMes])

  const recentes = useMemo(() => {
    const uid = minhaMoradorId
    return despesas
      .filter((d) => d.status === 'confirmada')
      .slice(0, 5)
      .map((d) => {
        const minhaParte = d.rateios.find((r) => r.morador_id === uid)
        return { d, minhaParte }
      })
  }, [despesas, minhaMoradorId])

  if (loading || (casa && carregando)) {
    return <div className="empty">Carregando…</div>
  }

  return (
    <>
      <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Resumo</h1>
      <div className="card saldo-card">
        <div className="linha">{mesAnoBR(new Date())} · gasto total</div>
        <div className="valor mono">{formatBR(totalMes)}</div>
        <div className="row mt">
          <div className="linha">
            Você deve
            <br />
            <strong>{formatBR(vcDeve)}</strong>
          </div>
          <div className="linha" style={{ textAlign: 'right' }}>
            Devem a você
            <br />
            <strong>{formatBR(devemAVoce)}</strong>
          </div>
        </div>
      </div>

      {previstasMes.length > 0 && (
        <>
          <div className="row mt-lg">
            <h2 style={{ fontSize: 16, margin: 0 }}>Contas do mês (previstas)</h2>
            <strong className="mono">{formatBR(totalPrevisto)}</strong>
          </div>
          <p className="small muted">Pagou? Use <strong>Pagar</strong> e a previsão é convertida em despesa confirmada.</p>
          {previstasMes.map((d) => (
            <Link to={`/despesa/${d.id}`} viewTransition key={d.id} className="card link-card">
              <div className="row">
                <div>
                  <strong>{d.fornecedor}</strong>
                  <div className="small muted">
                    {labelCategoria(d.categoria, casa?.categorias)} · {dataBR(d.data)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong className="mono">{formatBR(d.valor)}</strong>
                  {estaAtrasada(d.data) && (
                    <div className="small mt">
                      <span className="badge badge-danger">atrasado</span>
                    </div>
                  )}
                </div>
                <span className="small muted">›</span>
              </div>
            </Link>
          ))}
        </>
      )}

      <div className="row mt-lg">
        <h2 style={{ fontSize: 16, margin: 0 }}>Últimas despesas</h2>
        <span className="small muted">toque em + Pagar para lançar</span>
      </div>

      {recentes.length === 0 ? (
        <div className="empty">
          <p>Nenhuma despesa ainda.</p>
          <Link to="/nova" viewTransition className="btn btn-primary btn-sm mt">Pagar a primeira</Link>
        </div>
      ) : (
        recentes.map(({ d, minhaParte }) => (
          <Link to={`/despesa/${d.id}`} viewTransition key={d.id} className="card link-card">
            <div className="row">
              <div>
                <strong>{d.fornecedor}</strong>
                <div className="small muted">
                  {nomeMorador(moradores, d.pago_por)} pagou · {labelCategoria(d.categoria, casa?.categorias)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong className="mono">{formatBR(d.valor)}</strong>
                <div className="small muted">
                  {minhaParte?.pago
                    ? <span className="badge badge-ok">pago</span>
                    : minhaParte
                      ? <span className="badge badge-warn">sua parte {formatBR(minhaParte.valor_rateado)}</span>
                      : '—'}
                </div>
              </div>
              <span className="small muted">›</span>
            </div>
          </Link>
        ))
      )}

      <p className="center small muted mt">
        Cadastre <Link to="/projecao" viewTransition>contas recorrentes</Link> e veja as{' '}
        <Link to="/projecao" viewTransition>próximas contas</Link> automaticamente.
      </p>
    </>
  )
}