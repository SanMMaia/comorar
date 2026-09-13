import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useApp, nomeMorador } from '../state/AppContext'
import { useDespesas } from '../lib/dados'
import { formatBR, mesAnoBR } from '../lib/format'

export function Home() {
  const { casa, minhaMoradorId, moradores, loading } = useApp()
  const { despesas, carregando } = useDespesas(casa?.id ?? null)

  const { totalMes, vcDeve, devemAVoce } = useMemo(() => {
    const uid = minhaMoradorId
    const agora = new Date()
    const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0)
    let totalMes = 0
    let vcDeve = 0
    let devemAVoce = 0
    for (const d of despesas) {
      if (d.status !== 'confirmada') continue
      const dataD = new Date(d.data)
      if (dataD > fim || dataD.getMonth() !== agora.getMonth() || dataD.getFullYear() !== agora.getFullYear()) continue
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

      <div className="row mt-lg">
        <h2 style={{ fontSize: 16, margin: 0 }}>Últimas despesas</h2>
        <Link to="/nova" className="btn btn-primary btn-sm">+ Nova despesa</Link>
      </div>

      {recentes.length === 0 ? (
        <div className="empty">
          <p>Nenhuma despesa ainda.</p>
          <Link to="/nova" className="btn btn-primary btn-sm mt">Lançar a primeira</Link>
        </div>
      ) : (
        recentes.map(({ d, minhaParte }) => (
          <Link to={`/despesa/${d.id}`} key={d.id} className="card link-card">
            <div className="row">
              <div>
                <strong>{d.fornecedor}</strong>
                <div className="small muted">
                  {nomeMorador(moradores, d.pago_por)} pagou · {d.categoria}
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
            </div>
          </Link>
        ))
      )}

      <p className="center small muted mt">
        Cadastre <Link to="/recorrencias">recorrências</Link> e veja as{' '}
        <Link to="/projecao">próximas contas</Link> automaticamente.
      </p>
    </>
  )
}