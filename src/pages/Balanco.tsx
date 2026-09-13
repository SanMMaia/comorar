import { useMemo, useState } from 'react'
import { useApp, nomeMorador } from '../state/AppContext'
import { useDespesas, obrigacoesDe } from '../lib/dados'
import { saldosPorPessoa, compactarTransferencias } from '../lib/balanco'
import { formatBR } from '../lib/format'
import { supabase } from '../lib/supabase'

export function Balanco() {
  const { casa, user, moradores } = useApp()
  const { despesas, recarregar, carregando } = useDespesas(casa?.id ?? null)
  const [liquidando, setLiquidando] = useState<string | null>(null)
  const [erro, setErro] = useState('')

  const { meusSaldos, transferencias } = useMemo(() => {
    const obrigacoes = obrigacoesDe(despesas)
    const saldos = saldosPorPessoa(obrigacoes)
    const t = compactarTransferencias(obrigacoes)
    return { meusSaldos: saldos, transferencias: t }
  }, [despesas])

  const uid = user?.id ?? ''
  const meuSaldo = meusSaldos[uid] ?? 0

  const liquidar = async (rateioId: string) => {
    setLiquidando(rateioId)
    setErro('')
    const { error } = await supabase
      .from('rateios')
      .update({ pago: true, pago_em: new Date().toISOString(), confirmado_por: uid })
      .eq('id', rateioId)
    if (error) setErro(error.message)
    await recarregar()
    setLiquidando(null)
  }

  if (carregando) return <div className="empty">Carregando…</div>

  return (
    <>
      <h1 style={{ fontSize: 20 }}>Balanço da casa</h1>

      <div className={`card ${meuSaldo >= 0 ? 'saldo-card' : ''}`} style={meuSaldo < 0 ? undefined : undefined}>
        <div className="linha">{meuSaldo >= 0 ? 'Devem para você' : 'Você deve'}</div>
        <div className="valor mono">
          {formatBR(Math.abs(meuSaldo))}
        </div>
      </div>

      {erro && <div className="error-box">{erro}</div>}

      <h2 style={{ fontSize: 15, marginTop: 20 }}>Sugestões de pagamento</h2>
      {transferencias.length === 0 ? (
        <div className="empty">Saldo zerado — nada a pagar. 🎉</div>
      ) : (
        transferencias.map((t, idx) => (
          <div className="card" key={idx}>
            <div className="row">
              <div>
                <strong>{nomeMorador(moradores, t.devedor_id)}</strong>
                <span className="muted"> paga para </span>
                <strong>{nomeMorador(moradores, t.credor_id)}</strong>
                <div className="small muted">{formatBR(t.valor)}</div>
              </div>
            </div>
          </div>
        ))
      )}

      <h2 style={{ fontSize: 15, marginTop: 20 }}>Liquidação de rateios abertos</h2>
      {despesas
        .filter((d) => d.status === 'confirmada' && d.rateios.some((r) => !r.pago))
        .map((d) => (
          <div className="card" key={d.id}>
            <div className="row">
              <div>
                <strong>{d.fornecedor}</strong>
                <div className="small muted">{nomeMorador(moradores, d.pago_por)} pagou</div>
              </div>
            </div>
            {d.rateios
              .filter((r) => !r.pago)
              .map((r) => (
                <div className="row mt" key={r.id}>
                  <span className="small">
                    {nomeMorador(moradores, r.morador_id)} deve {formatBR(r.valor_rateado)}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    disabled={liquidando === r.id}
                    onClick={() => liquidar(r.id)}
                  >
                    {liquidando === r.id ? '…' : 'Marcar pago'}
                  </button>
                </div>
              ))}
          </div>
        ))}
    </>
  )
}