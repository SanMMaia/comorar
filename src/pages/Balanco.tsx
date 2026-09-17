import { useMemo, useState } from 'react'
import { useApp, nomeMorador } from '../state/AppContext'
import { useDespesas, obrigacoesDe, useMeuSaldo } from '../lib/dados'
import { saldosPorPessoa, compactarTransferencias, planejarAcerto, type Obrigacao, type PrevisaoAcerto } from '../lib/balanco'
import { formatBR, parseCentavos } from '../lib/format'
import { supabase } from '../lib/supabase'

export function Balanco() {
  const { casa, user, minhaMoradorId, moradores, souOwner } = useApp()
  const { despesas, recarregar, carregando } = useDespesas(casa?.id ?? null)
  const [acertando, setAcertando] = useState<Obrigacao | null>(null)
  const [valorAcerto, setValorAcerto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const saldos = useMeuSaldo(souOwner ? null : (casa?.id ?? null), null, despesas)

  const meusSaldos = useMemo(
    () => (souOwner ? saldosPorPessoa(obrigacoesDe(despesas)) : {}),
    [despesas, souOwner],
  )

  // transferências a pagar: owner vê a casa toda, morador vê só o que deve
  const transferencias = useMemo<Obrigacao[]>(() => {
    if (souOwner) return compactarTransferencias(obrigacoesDe(despesas))
    return saldos
      .filter((s) => s.direcao === 'devo')
      .map((s) => ({
        devedor_id: minhaMoradorId ?? '',
        credor_id: s.contraparte_id,
        valor: Number(s.valor),
      }))
  }, [despesas, saldos, souOwner, minhaMoradorId])

  const aReceber = useMemo(() => {
    if (souOwner) return []
    return saldos
      .filter((s) => s.direcao === 'me_devem')
      .map((s) => ({ devedor_id: s.contraparte_id, valor: Number(s.valor) }))
  }, [saldos, souOwner])

  const meuSaldo = souOwner
    ? minhaMoradorId
      ? (meusSaldos[minhaMoradorId] ?? 0)
      : 0
    : aReceber.reduce((a, s) => a + s.valor, 0) -
      transferencias.reduce((a, t) => a + t.valor, 0)

  const pendentesDoPar = (devedorId: string, credorId: string): PrevisaoAcerto[] =>
    despesas
      .filter((d) => d.status === 'confirmada' && d.pago_por === credorId)
      .flatMap((d) =>
        d.rateios
          .filter((r) => !r.pago && r.morador_id === devedorId)
          .map((r) => ({ rateio_id: r.id, despesa_id: d.id, morador_id: r.morador_id, valor_rateado: r.valor_rateado })),
      )

  const abrirAcerto = (t: Obrigacao) => {
    setAcertando(t)
    setValorAcerto(t.valor.toFixed(2).replace('.', ','))
    setErro('')
  }

  const { planoAcerto, detalheRateio } = useMemo(() => {
    const vazio = { planoAcerto: null as null | ReturnType<typeof planejarAcerto>, detalheRateio: () => ({ fornecedor: '', valor: 0 }) }
    if (!acertando) return vazio
    const pendentes = pendentesDoPar(acertando.devedor_id, acertando.credor_id)
    const valorNum = parseCentavos(valorAcerto)
    if (valorNum === null || valorNum <= 0) return vazio
    const porRateio = new Map(
      despesas.flatMap((d) => d.rateios.map((r) => [r.id, { fornecedor: d.fornecedor, valor: r.valor_rateado }] as const)),
    )
    return {
      planoAcerto: planejarAcerto(pendentes, valorNum),
      detalheRateio: (id: string) => porRateio.get(id) ?? { fornecedor: '', valor: 0 },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acertando, valorAcerto, despesas])

  const confirmarAcerto = async () => {
    if (!acertando) return
    const valorNum = parseCentavos(valorAcerto)
    if (valorNum === null || valorNum <= 0) {
      setErro('Informe um valor válido.')
      return
    }
    if (!planoAcerto || (planoAcerto.quitar.length === 0 && !planoAcerto.dividir)) {
      setErro('Nada a quitar com esse valor.')
      return
    }
    setSalvando(true)
    setErro('')

    const pendentes = pendentesDoPar(acertando.devedor_id, acertando.credor_id)
    if (pendentes.length === 0) {
      setErro('Não há rateio pendente entre essas pessoas.')
      setSalvando(false)
      return
    }

    const plano = planoAcerto
    const agora = new Date().toISOString()

    if (plano.quitar.length > 0) {
      const { error } = await supabase
        .from('rateios')
        .update({ pago: true, pago_em: agora, confirmado_por: user?.id ?? null })
        .in('id', plano.quitar.map((q) => q.rateio_id))
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
      <h1 className="page-title">Balanço da casa</h1>
      <p className="page-sub">Quem deve para quem, no total</p>

      <div className="card saldo-card">
        <div className="linha">{meuSaldo >= 0 ? 'Devem para você' : 'Você deve'}</div>
        <div className="valor mono">
          {formatBR(Math.abs(meuSaldo))}
        </div>
      </div>

      {erro && <div className="error-box">{erro}</div>}

      <h2 className="section-title" style={{ marginTop: 20 }}>
        {souOwner ? 'Sugestões de pagamento' : 'Você deve'}
      </h2>
      {transferencias.length === 0 ? (
        <div className="empty">
          <div className="empty-icone" aria-hidden>🎉</div>
          <p>{souOwner ? 'Saldo zerado — nada a pagar.' : 'Você não deve nada.'}</p>
        </div>
      ) : (
        <div className="card-flush mt">
          {transferencias.map((t, idx) => (
            <div className="list-line" key={idx}>
              <div className="item-linha">
                <div className="item-corpo">
                  {t.devedor_id === minhaMoradorId ? (
                    <>
                      <strong>Você</strong>
                      <span className="muted"> paga para </span>
                    </>
                  ) : (
                    <>
                      <strong>{nomeMorador(moradores, t.devedor_id)}</strong>
                      <span className="muted"> paga para </span>
                    </>
                  )}
                  <strong>{nomeMorador(moradores, t.credor_id)}</strong>
                </div>
                <div className="item-lado">
                  <strong className="mono">{formatBR(t.valor)}</strong>
                </div>
              </div>
              <div className="item-acoes">
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => abrirAcerto(t)}>
                  Registrar pagamento
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!souOwner && aReceber.length > 0 && (
        <>
          <h2 className="section-title" style={{ marginTop: 20 }}>Devem a você</h2>
          <div className="card-flush">
            {aReceber.map((s, idx) => (
              <div className="list-line" key={idx}>
                <div className="item-linha">
                  <div className="item-corpo">
                    <strong>{nomeMorador(moradores, s.devedor_id)}</strong>
                    <span className="muted"> deve para você</span>
                  </div>
                  <div className="item-lado">
                    <strong className="mono">{formatBR(s.valor)}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="small muted mt">
            Combine com a pessoa (ou com o responsável) para confirmar o pagamento.
          </p>
        </>
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
              {acertando.devedor_id === minhaMoradorId
                ? 'Você paga agora. O valor será abatido das despesas em que deve.'
                : `${nomeMorador(moradores, acertando.devedor_id)} paga agora. O valor é abatido das despesas em que deve.`}
            </div>

            <label>Valor do acerto</label>
            <input
              inputMode="decimal"
              value={valorAcerto}
              onChange={(e) => setValorAcerto(e.target.value)}
              autoFocus
            />

            {planoAcerto && (planoAcerto.quitar.length > 0 || planoAcerto.dividir) && (
              <div className="card mt" style={{ padding: 10 }}>
                <div className="small muted" style={{ marginBottom: 6 }}>Prévia do que será quitado:</div>
                {planoAcerto.quitar.map((q) => {
                  const det = detalheRateio(q.rateio_id)
                  return (
                    <div className="row small" key={q.rateio_id} style={{ padding: '2px 0' }}>
                      <span>
                        {det.fornecedor || 'Rateio'}
                        <span className="muted"> · {formatBR(det.valor)}</span>
                      </span>
                      <span className="badge badge-ok">quita</span>
                    </div>
                  )
                })}
                {planoAcerto.dividir && (
                  <div className="row small" style={{ padding: '2px 0' }}>
                    <span>
                      {detalheRateio(planoAcerto.dividir.rateio_id).fornecedor || 'Rateio'}
                      <span className="muted"> · {formatBR(planoAcerto.dividir.valor_pago)} paga + {formatBR(planoAcerto.dividir.valor_restante)} fica</span>
                    </span>
                    <span className="badge badge-warn">divide</span>
                  </div>
                )}
                {planoAcerto.quitar.length === 0 && !planoAcerto.dividir && (
                  <div className="small muted">Nada a quitar com esse valor.</div>
                )}
              </div>
            )}

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