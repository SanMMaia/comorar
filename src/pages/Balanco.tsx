import { useMemo, useState } from 'react'
import { useApp, nomeMorador } from '../state/AppContext'
import { useDespesas, obrigacoesDe } from '../lib/dados'
import { saldosPorPessoa, compactarTransferencias, planejarAcerto, type Obrigacao, type PrevisaoAcerto } from '../lib/balanco'
import { formatBR, parseCentavos } from '../lib/format'
import { supabase } from '../lib/supabase'

export function Balanco() {
  const { casa, user, minhaMoradorId, moradores } = useApp()
  const { despesas, recarregar, carregando } = useDespesas(casa?.id ?? null)
  const [acertando, setAcertando] = useState<Obrigacao | null>(null)
  const [valorAcerto, setValorAcerto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const { meusSaldos, transferencias } = useMemo(() => {
    const obrigacoes = obrigacoesDe(despesas)
    const saldos = saldosPorPessoa(obrigacoes)
    const t = compactarTransferencias(obrigacoes)
    return { meusSaldos: saldos, transferencias: t }
  }, [despesas])

  const meuSaldo = minhaMoradorId ? (meusSaldos[minhaMoradorId] ?? 0) : 0

  const abrirAcerto = (t: Obrigacao) => {
    setAcertando(t)
    setValorAcerto(t.valor.toFixed(2).replace('.', ','))
    setErro('')
  }

  const confirmarAcerto = async () => {
    if (!acertando) return
    const valorNum = parseCentavos(valorAcerto)
    if (valorNum === null || valorNum <= 0) {
      setErro('Informe um valor válido.')
      return
    }
    setSalvando(true)
    setErro('')

    const pendentes: PrevisaoAcerto[] = despesas
      .filter((d) => d.status === 'confirmada' && d.pago_por === acertando.credor_id)
      .flatMap((d) =>
        d.rateios
          .filter((r) => !r.pago && r.morador_id === acertando.devedor_id)
          .map((r) => ({ rateio_id: r.id, despesa_id: d.id, morador_id: r.morador_id, valor_rateado: r.valor_rateado })),
      )

    if (pendentes.length === 0) {
      setErro('Não há rateio pendente entre essas pessoas.')
      setSalvando(false)
      return
    }

    const plano = planejarAcerto(pendentes, valorNum)
    const agora = new Date().toISOString()

    for (const q of plano.quitar) {
      const { error } = await supabase
        .from('rateios')
        .update({ pago: true, pago_em: agora, confirmado_por: user?.id ?? null })
        .eq('id', q.rateio_id)
      if (error) {
        setErro(error.message)
        setSalvando(false)
        return
      }
    }

    if (plano.dividir) {
      const dv = plano.dividir
      const { error: errResto } = await supabase
        .from('rateios')
        .update({ valor_rateado: dv.valor_restante })
        .eq('id', dv.rateio_id)
      if (errResto) {
        setErro(errResto.message)
        setSalvando(false)
        return
      }
      const { error: errNovo } = await supabase.from('rateios').insert({
        despesa_id: dv.despesa_id,
        morador_id: dv.morador_id,
        valor_rateado: dv.valor_pago,
        pago: true,
        pago_em: agora,
        confirmado_por: user?.id ?? null,
      })
      if (errNovo) {
        setErro(errNovo.message)
        setSalvando(false)
        return
      }
    }

    await recarregar()
    setSalvando(false)
    setAcertando(null)
  }

  if (carregando) return <div className="empty">Carregando…</div>

  return (
    <>
      <h1 style={{ fontSize: 20 }}>Balanço da casa</h1>

      <div className="card">
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
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => abrirAcerto(t)}>
                Registrar pagamento
              </button>
            </div>
          </div>
        ))
      )}

      {acertando && (
        <div className="overlay" onClick={() => setAcertando(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <div>
                <strong>{nomeMorador(moradores, acertando.devedor_id)}</strong>
                <span className="muted"> paga para </span>
                <strong>{nomeMorador(moradores, acertando.credor_id)}</strong>
              </div>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAcertando(null)}>
                Cancelar
              </button>
            </div>

            <div className="small muted mt" style={{ marginTop: 12 }}>
              Todas as despesas em que {nomeMorador(moradores, acertando.devedor_id)} deve a{' '}
              {nomeMorador(moradores, acertando.credor_id)} serão quitadas até o valor informado.
            </div>

            <label>Valor do acerto</label>
            <input
              inputMode="decimal"
              value={valorAcerto}
              onChange={(e) => setValorAcerto(e.target.value)}
              autoFocus
            />

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 16 }}
              disabled={salvando}
              onClick={() => void confirmarAcerto()}
            >
              {salvando ? 'Salvando…' : 'Confirmar acerto'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}