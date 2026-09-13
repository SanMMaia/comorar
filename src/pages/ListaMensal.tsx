import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useApp, nomeMorador } from '../state/AppContext'
import { useDespesas } from '../lib/dados'
import { formatBR, dataBR, mesAnoBR } from '../lib/format'
import type { Categoria } from '../types'

const labelsCat: Record<Categoria, string> = {
  aluguel: 'Aluguel',
  luz: 'Luz',
  agua: 'Água',
  internet: 'Internet',
  mercado: 'Mercado',
  outro: 'Outro',
}

export function ListaMensal() {
  const { casa, moradores } = useApp()
  const { despesas, carregando } = useDespesas(casa?.id ?? null)

  const doMes = useMemo(() => {
    const agora = new Date()
    const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0)
    return despesas.filter((d) => {
      if (d.status !== 'confirmada') return false
      const dt = new Date(d.data)
      return dt <= fim && dt.getMonth() === agora.getMonth() && dt.getFullYear() === agora.getFullYear()
    })
  }, [despesas])

  const total = useMemo(() => doMes.reduce((a, b) => a + b.valor, 0), [doMes])

  if (carregando) return <div className="empty">Carregando…</div>

  return (
    <>
      <div className="row">
        <h1 style={{ fontSize: 20, margin: 0 }}>{mesAnoBR(new Date())}</h1>
        <strong className="mono">{formatBR(total)}</strong>
      </div>

      {doMes.length === 0 ? (
        <div className="empty">Nenhuma despesa neste mês ainda.</div>
      ) : (
        doMes.map((d) => (
          <Link to={`/despesa/${d.id}`} key={d.id} className="card link-card">
            <div className="row">
              <div>
                <strong>{d.fornecedor}</strong>
                <div className="small muted">
                  {labelsCat[d.categoria]} · {dataBR(d.data)}
                </div>
                <div className="small muted">
                  {nomeMorador(moradores, d.pago_por)} pagou
                  {d.descricao ? ` · ${d.descricao}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong className="mono">{formatBR(d.valor)}</strong>
                {d.rateios.some((r) => !r.pago) && (
                  <div className="small">
                    <span className="badge badge-warn">
                      {d.rateios.filter((r) => !r.pago).length} pendente(s)
                    </span>
                  </div>
                )}
              </div>
            </div>
          </Link>
        ))
      )}
    </>
  )
}