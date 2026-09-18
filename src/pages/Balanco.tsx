import { useMemo, useState } from 'react'
import { Dica } from '../components/Dica'
import { Confirmacao } from '../components/Confirmacao'
import { useApp, nomeMorador } from '../state/AppContext'
import { useDespesas, obrigacoesDe, ajustesEmObrigacoes, useMeuSaldo, useAjustes } from '../lib/dados'
import { compactarTransferencias, planejarAcerto, type Obrigacao, type PrevisaoAcerto } from '../lib/balanco'
import { formatBR, parseCentavos } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { Ajuste } from '../types'

export function Balanco() {
  const { casa, user, minhaMoradorId, moradores, souOwner } = useApp()
  const { despesas, recarregar, carregando } = useDespesas(casa?.id ?? null)
  const { ajustes, recarregar: recarregarAjustes } = useAjustes(casa?.id ?? null)
  const [acertando, setAcertando] = useState<Obrigacao | null>(null)
  const [valorAcerto, setValorAcerto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [msgPixCopia, setMsgPixCopia] = useState(false)
  const [novoIouAberto, setNovoIouAberto] = useState(false)
  const [iouDevedor, setIouDevedor] = useState('')
  const [iouCredor, setIouCredor] = useState('')
  const [iouValor, setIouValor] = useState('')
  const [iouMotivo, setIouMotivo] = useState('')
  const [salvandoIou, setSalvandoIou] = useState(false)
  const [iouCancelando, setIouCancelando] = useState<Ajuste | null>(null)

  // fonte única: a RPC `meu_saldo` (inclui ajustes/IOU) vale para todos,
  // inclusive o owner
  const saldos = useMeuSaldo(casa?.id ?? null, null, [despesas, ajustes])

  const transferencias = useMemo<Obrigacao[]>(() => {
    if (souOwner) {
      return compactarTransferencias([...obrigacoesDe(despesas), ...ajustesEmObrigacoes(ajustes)])
    }
    return saldos
      .filter((s) => s.direcao === 'devo')
      .map((s) => ({
        devedor_id: minhaMoradorId ?? '',
        credor_id: s.contraparte_id,
        valor: Number(s.valor),
      }))
  }, [despesas, ajustes, saldos, souOwner, minhaMoradorId])

  const aReceber = useMemo(() => {
    if (souOwner) return []
    return saldos
      .filter((s) => s.direcao === 'me_devem')
      .map((s) => ({ devedor_id: s.contraparte_id, valor: Number(s.valor) }))
  }, [saldos, souOwner])

  const meuSaldo =
    aReceber.reduce((a, s) => a + s.valor, 0) -
    transferencias.reduce((a, t) => a + t.valor, 0)

  const abertosIou = ajustes.filter((a) => !a.pago && !a.cancelado)

  const iouEntre = (devedorId: string, credorId: string): Ajuste[] =>
    abertosIou.filter(
      (a) => a.de_morador === devedorId && a.para_morador === credorId,
    )

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

  const { planoAcerto, detalheRateio, soIou } = useMemo(() => {
    const vazio = { planoAcerto: null as null | ReturnType<typeof planejarAcerto>, detalheRateio: () => ({ fornecedor: '', valor: 0 }), soIou: true as boolean }
    if (!acertando) return vazio
    const pendentes = pendentesDoPar(acertando.devedor_id, acertando.credor_id)
    const iou = iouEntre(acertando.devedor_id, acertando.credor_id)
    if (pendentes.length === 0) return {
      ...vazio,
      soIou: iou.length > 0,
    }
    const valorNum = parseCentavos(valorAcerto)
    if (valorNum === null || valorNum <= 0) return vazio
    const porRateio = new Map(
      despesas.flatMap((d) => d.rateios.map((r) => [r.id, { fornecedor: d.fornecedor, valor: r.valor_rateado }] as const)),
    )
    return {
      planoAcerto: planejarAcerto(pendentes, valorNum),
      detalheRateio: (id: string) => porRateio.get(id) ?? { fornecedor: '', valor: 0 },
      soIou: false,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acertando, valorAcerto, despesas, ajustes])

  const confirmarAcerto = async () => {
    if (!acertando) return
    const valorNum = parseCentavos(valorAcerto)
    if (valorNum === null || valorNum <= 0) {
      setErro('Informe um valor válido.')
      return
    }
    const iou = iouEntre(acertando.devedor_id, acertando.credor_id)
    const temRateio = !!(planoAcerto && (planoAcerto.quitar.length > 0 || planoAcerto.dividir))
    if (!temRateio && iou.length === 0) {
      setErro('Nada a quitar com esse valor.')
      return
    }
    setSalvando(true)
    setErro('')
    const agora = new Date().toISOString()

    if (temRateio && planoAcerto) {
      const pendentes = pendentesDoPar(acertando.devedor_id, acertando.credor_id)
      if (pendentes.length === 0) {
        setErro('Não há rateio pendente entre essas pessoas.')
        setSalvando(false)
        return
      }
      const plano = planoAcerto
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
    }

    if (iou.length > 0) {
      const { error } = await supabase
        .from('ajustes')
        .update({ pago: true, pago_em: agora, confirmado_por: user?.id ?? null })
        .in(
          'id',
          iou.map((a) => a.id),
        )
      if (error) {
        setErro(error.message)
        setSalvando(false)
        return
      }
    }

    await Promise.all([recarregar(), recarregarAjustes()])
    setSalvando(false)
    setAcertando(null)
  }

  const confirmarIou = async (a: Ajuste) => {
    setSalvandoIou(true)
    const { error } = await supabase
      .from('ajustes')
      .update({ pago: true, pago_em: new Date().toISOString(), confirmado_por: user?.id ?? null })
      .eq('id', a.id)
    setSalvandoIou(false)
    if (!error) await recarregarAjustes()
  }

  const salvarIou = async () => {
    if (!casa) return
    const valorNum = parseCentavos(iouValor)
    if (iouDevedor === iouCredor || !iouDevedor || !iouCredor) {
      setErro('Escolha pessoas diferentes: quem deve e para quem.')
      return
    }
    if (valorNum === null || valorNum <= 0) {
      setErro('Informe um valor válido.')
      return
    }
    setErro('')
    setSalvandoIou(true)
    const motivo = iouMotivo.trim() || null
    const { error } = await supabase.from('ajustes').insert({
      casa_id: casa.id,
      de_morador: iouDevedor,
      para_morador: iouCredor,
      valor: valorNum,
      motivo,
    })
    setSalvandoIou(false)
    if (error) {
      setErro(error.message)
      return
    }
    setNovoIouAberto(false)
    setIouValor('')
    setIouMotivo('')
    await recarregarAjustes()
  }

  const cancelarIou = async () => {
    if (!iouCancelando) return
    setSalvandoIou(true)
    const { error } = await supabase
      .from('ajustes')
      .update({ cancelado: true })
      .eq('id', iouCancelando.id)
    setSalvandoIou(false)
    if (!error) {
      setIouCancelando(null)
      await recarregarAjustes()
    }
  }

  if (carregando) return <div className="empty">Carregando…</div>

  return (
    <>
      <h1 className="page-title">Meu saldo</h1>
      <p className="page-sub">
        {souOwner ? 'Saldos e sugestões de pagamento de toda a casa' : 'Suas pendências e o que devem para você'}
      </p>

      <Dica chave="meu-saldo">
        Aqui ficam os acertos: o que devem para você e o que você deve.
      </Dica>

      <div className="card saldo-card">
        <div className="linha">{meuSaldo >= 0 ? 'Devem para você' : 'Você deve'}</div>
        <div className="valor mono">
          {formatBR(Math.abs(meuSaldo))}
        </div>
      </div>

      {erro && <div className="error-box">{erro}</div>}

      <div className="row mt" style={{ justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setNovoIouAberto(true)}
        >
          Anotar acerto
        </button>
      </div>

      <h2 className="section-title" style={{ marginTop: 'var(--space-5)' }}>
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
          <h2 className="section-title" style={{ marginTop: 'var(--space-5)' }}>Devem a você</h2>
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

      {abertosIou.length > 0 && (
        <>
          <h2 className="section-title" style={{ marginTop: 'var(--space-5)' }}>Acertos anotados</h2>
          <div className="card-flush mt">
            {abertosIou.map((a) => (
              <div className="list-line" key={a.id}>
                <div className="item-linha">
                  <div className="item-corpo small">
                    <strong>{nomeMorador(moradores, a.de_morador)}</strong>
                    <span className="muted"> deve </span>
                    <strong>{formatBR(a.valor)}</strong>
                    <span className="muted"> para {nomeMorador(moradores, a.para_morador)}</span>
                    {a.motivo && <div className="muted">{a.motivo}</div>}
                  </div>
                  <div className="item-lado">
                    {minhaMoradorId === a.para_morador ? (
                      <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          disabled={salvandoIou}
                          onClick={() => void confirmarIou(a)}
                        >
                          {salvandoIou ? '…' : 'Confirmar'}
                        </button>
                        <button type="button" className="btn btn-sm btn-mudo" onClick={() => setIouCancelando(a)}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <span className="small muted">aguardando {nomeMorador(moradores, a.para_morador)}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
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

            <div className="small muted mt" style={{ marginTop: 'var(--space-3)' }}>
              {acertando.devedor_id === minhaMoradorId
                ? 'Você paga agora. O valor será abatido das despesas em que deve.'
                : `${nomeMorador(moradores, acertando.devedor_id)} paga agora. O valor é abatido das despesas em que deve.`}
            </div>

            {acertando.devedor_id === minhaMoradorId &&
              moradores.find((m) => m.id === acertando.credor_id)?.chave_pix && (
                <div className="card mt" style={{ padding: 'var(--space-3)' }}>
                  <div className="small" style={{ fontWeight: 600 }}>Pix de {nomeMorador(moradores, acertando.credor_id)}</div>
                  <div className="row mt" style={{ gap: 'var(--space-2)' }}>
                    <span className="small mono" style={{ wordBreak: 'break-all', flex: 1 }}>
                      {moradores.find((m) => m.id === acertando.credor_id)?.chave_pix}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => {
                        const pix = moradores.find((m) => m.id === acertando.credor_id)?.chave_pix
                        if (!pix) return
                        void navigator.clipboard.writeText(pix)
                        setMsgPixCopia(true)
                        setTimeout(() => setMsgPixCopia(false), 2000)
                      }}
                    >
                      {msgPixCopia ? 'Copiado ✓' : 'Copiar'}
                    </button>
                  </div>
                </div>
              )}

            <label>Valor do acerto</label>
            <input
              inputMode="decimal"
              value={valorAcerto}
              onChange={(e) => setValorAcerto(e.target.value)}
              autoFocus
            />

            {(planoAcerto && (planoAcerto.quitar.length > 0 || planoAcerto.dividir)) || soIou ? (
              <div className="card mt" style={{ padding: 'var(--space-3)' }}>
                <div className="small muted" style={{ marginBottom: 'var(--space-2)' }}>Prévia do que será quitado:</div>
                {planoAcerto?.quitar.map((q) => {
                  const det = detalheRateio(q.rateio_id)
                  return (
                    <div className="row small" key={q.rateio_id} style={{ padding: 'var(--space-1) 0' }}>
                      <span>
                        {det.fornecedor || 'Rateio'}
                        <span className="muted"> · {formatBR(det.valor)}</span>
                      </span>
                      <span className="badge badge-ok">quita</span>
                    </div>
                  )
                })}
                {planoAcerto?.dividir && (
                  <div className="row small" style={{ padding: 'var(--space-1) 0' }}>
                    <span>
                      {detalheRateio(planoAcerto.dividir.rateio_id).fornecedor || 'Rateio'}
                      <span className="muted"> · {formatBR(planoAcerto.dividir.valor_pago)} paga + {formatBR(planoAcerto.dividir.valor_restante)} fica</span>
                    </span>
                    <span className="badge badge-warn">divide</span>
                  </div>
                )}
                {soIou && iouEntre(acertando.devedor_id, acertando.credor_id).map((a) => (
                  <div className="row small" key={a.id} style={{ padding: 'var(--space-1) 0' }}>
                    <span>
                      Acerto anotado{a.motivo ? ` · ${a.motivo}` : ''}
                      <span className="muted"> · {formatBR(a.valor)}</span>
                    </span>
                    <span className="badge badge-ok">quita</span>
                  </div>
                ))}
                {(planoAcerto?.quitar.length ?? 0) === 0 && !planoAcerto?.dividir && !soIou && (
                  <div className="small muted">Nada a quitar com esse valor.</div>
                )}
              </div>
            ) : null}

            <button
              type="button"
              className={`btn btn-primary${salvando ? ' btn-spinner' : ''}`}
              style={{ width: '100%', marginTop: 'var(--space-4)' }}
              disabled={salvando}
              onClick={() => void confirmarAcerto()}
            >
              {salvando ? '' : 'Confirmar acerto'}
            </button>
          </div>
        </div>
      )}

      {novoIouAberto && (
        <div className="overlay" onClick={() => setNovoIouAberto(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <strong className="sheet-titulo">Anotar acerto</strong>
            <p className="small muted mt">
              Registra um valor combinado entre moradores: "fulano deve tal valor para ciclano".
            </p>

            <label>Quem deve</label>
            <select value={iouDevedor} onChange={(e) => setIouDevedor(e.target.value)}>
              <option value="">Escolher…</option>
              {moradores.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>

            <label>Para quem</label>
            <select value={iouCredor} onChange={(e) => setIouCredor(e.target.value)}>
              <option value="">Escolher…</option>
              {moradores.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>

            <label>Valor</label>
            <input inputMode="decimal" value={iouValor} onChange={(e) => setIouValor(e.target.value)} />

            <label>Motivo (opcional)</label>
            <input value={iouMotivo} onChange={(e) => setIouMotivo(e.target.value)} placeholder="ex.: vale do mercado" />

            <button
              type="button"
              className={`btn btn-primary${salvandoIou ? ' btn-spinner' : ''}`}
              style={{ width: '100%', marginTop: 'var(--space-4)' }}
              disabled={salvandoIou}
              onClick={() => void salvarIou()}
            >
              {salvandoIou ? '' : 'Anotar'}
            </button>
          </div>
        </div>
      )}

      <Confirmacao
        aberto={!!iouCancelando}
        titulo="Cancelar acerto"
        mensagem={
          iouCancelando
            ? `${nomeMorador(moradores, iouCancelando.de_morador)} deixa de dever ${formatBR(iouCancelando.valor)} para ${nomeMorador(moradores, iouCancelando.para_morador)}.`
            : undefined
        }
        rotulo="Cancelar acerto"
        perigoso
        carregando={salvandoIou}
        onConfirmar={() => void cancelarIou()}
        onFechar={() => setIouCancelando(null)}
      />
    </>
  )
}