import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp, nomeMorador } from '../state/AppContext'
import { useDespesas } from '../lib/dados'
import { formatBR, dataBR, mesAnoBR } from '../lib/format'
import { labelCategoria } from '../lib/categorias'

export function ListaMensal() {
  const { casa, moradores } = useApp()
  const { despesas, carregando } = useDespesas(casa?.id ?? null)
  const hoje = new Date()
  const [mes, setMes] = useState(hoje.getMonth())
  const [ano, setAno] = useState(hoje.getFullYear())

  const voltarMes = () => {
    if (mes === 0) {
      setMes(11)
      setAno((a) => a - 1)
    } else {
      setMes((m) => m - 1)
    }
  }
  const avancarMes = () => {
    if (mes === 11) {
      setMes(0)
      setAno((a) => a + 1)
    } else {
      setMes((m) => m + 1)
    }
  }

  const { doMes, total, totalPrevisto } = useMemo(() => {
    const chave = `${ano}-${String(mes + 1).padStart(2, '0')}`
    const lista = despesas.filter((d) => {
      if (d.status === 'cancelada') return false
      return d.data.slice(0, 7) === chave
    })
    return {
      doMes: lista,
      total: lista.filter((d) => d.status === 'confirmada').reduce((a, b) => a + b.valor, 0),
      totalPrevisto: lista.filter((d) => d.status === 'prevista').reduce((a, b) => a + b.valor, 0),
    }
  }, [despesas, mes, ano])

  const mesIndex = ano * 12 + mes
  const hojeIndex = hoje.getFullYear() * 12 + hoje.getMonth()

  if (carregando) return <div className="empty">Carregando…</div>

  return (
    <>
      <div className="row">
        <button type="button" className="btn btn-secondary btn-sm" onClick={voltarMes}>←</button>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, margin: 0 }}>{mesAnoBR(new Date(ano, mes, 1))}</h1>
          <div className="small muted">
            {formatBR(total)}{totalPrevisto > 0 ? ` · ${formatBR(totalPrevisto)} previstos` : ''}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={avancarMes}
          disabled={mesIndex >= hojeIndex + 12}
        >
          →
        </button>
      </div>

      {doMes.length === 0 ? (
        <div className="empty">Nenhum lançamento neste mês.</div>
      ) : (
        doMes
          .sort((a, b) => a.data.localeCompare(b.data))
          .map((d) => (
            <Link to={`/despesa/${d.id}`} viewTransition key={d.id} className="card link-card">
              <div className="row">
                <div>
                  <strong>{d.fornecedor}</strong>
                  <div className="small muted">
                    {labelCategoria(d.categoria, casa?.categorias)} · {dataBR(d.data)}
                  </div>
                  {d.status === 'confirmada' && (
                    <div className="small muted">
                      {nomeMorador(moradores, d.pago_por)} pagou
                      {d.descricao ? ` · ${d.descricao}` : ''}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong className="mono">{formatBR(d.valor)}</strong>
                  <div className="small mt">
                    {d.status === 'confirmada' && d.rateios.some((r) => !r.pago) && (
                      <span className="badge badge-warn">
                        {d.rateios.filter((r) => !r.pago).length} pendente(s)
                      </span>
                    )}
                    {d.status === 'prevista' && <span className="badge badge-warn">previsto</span>}
                  </div>
                </div>
                <span className="small muted">›</span>
              </div>
            </Link>
          ))
      )}

      <div style={{ height: 8 }} />
    </>
  )
}