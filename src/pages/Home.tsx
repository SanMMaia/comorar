import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Dica } from '../components/Dica'
import { useApp, nomeMorador } from '../state/AppContext'
import { useDespesas, useMeuSaldo } from '../lib/dados'
import { supabase } from '../lib/supabase'
import { formatBR, dataBR, mesAnoBR, estaAtrasada, mesAtual, mesChave } from '../lib/format'
import { labelCategoria } from '../lib/categorias'
import type { Recorrencia } from '../types'

export function Home() {
  const { casa, user, minhaMoradorId, moradores, loading, souOwner } = useApp()
  const { despesas, recarregar, carregando } = useDespesas(casa?.id ?? null)
  const navigate = useNavigate()
  const [mantendo, setMantendo] = useState(false)
  const chaveAtual = mesAtual()
  const saldos = useMeuSaldo(souOwner ? null : (casa?.id ?? null), chaveAtual, despesas)

  const [recorrencias, setRecorrencias] = useState<Recorrencia[]>([])

  useEffect(() => {
    if (!casa) return
    supabase
      .from('recorrencias')
      .select('*')
      .eq('casa_id', casa.id)
      .then(({ data }) => setRecorrencias((data ?? []) as Recorrencia[]))
  }, [casa])

  const { totalMes, vcDeve, devemAVoce } = useMemo(() => {
    const uid = minhaMoradorId
    let totalMes = 0
    let vcDeve = 0
    let devemAVoce = 0
    for (const d of despesas) {
      if (d.status !== 'confirmada') continue
      if (mesChave(d.data) !== chaveAtual) continue
      if (souOwner) totalMes += d.valor
      const aberto = d.rateios.filter((r) => !r.pago)
      for (const r of aberto) {
        if (uid && r.morador_id === uid) vcDeve += r.valor_rateado
        if (uid && d.pago_por === uid) devemAVoce += r.valor_rateado
      }
      // morador: mostra a própria parte no mês, não o gasto total da casa
      if (!souOwner && uid) {
        totalMes += d.rateios
          .filter((r) => r.morador_id === uid)
          .reduce((a, r) => a + r.valor_rateado, 0)
      }
    }
    if (!souOwner) {
      vcDeve = saldos
        .filter((s) => s.direcao === 'devo')
        .reduce((a, s) => a + Number(s.valor), 0)
      devemAVoce = saldos
        .filter((s) => s.direcao === 'me_devem')
        .reduce((a, s) => a + Number(s.valor), 0)
    }
    return {
      totalMes,
      vcDeve: Math.round(vcDeve * 100) / 100,
      devemAVoce: Math.round(devemAVoce * 100) / 100,
    }
  }, [despesas, minhaMoradorId, souOwner, saldos, chaveAtual])

  const previstasMes = useMemo(() => {
    const chaveAtual = mesAtual()
    const uid = minhaMoradorId
    return despesas
      .filter((d) => d.status === 'prevista' && mesChave(d.data) === chaveAtual)
      .filter((d) => {
        if (souOwner) return true
        if (!uid) return false
        if (d.rateios.some((r) => r.morador_id === uid)) return true
        const rec = recorrencias.find((r) => r.id === d.origem_recorrencia_id)
        if (!rec) return false
        return rec.tipo_rateio === 'igual' || rec.pagador_padrao === uid
      })
      .sort((a, b) => a.data.localeCompare(b.data))
  }, [despesas, recorrencias, minhaMoradorId, souOwner])

  const totalPrevisto = useMemo(() => previstasMes.reduce((a, b) => a + b.valor, 0), [previstasMes])

  const marcarMinhaParte = async (rateioId: string) => {
    setMantendo(true)
    await supabase
      .from('rateios')
      .update({ pago: true, pago_em: new Date().toISOString(), confirmado_por: user?.id ?? null })
      .eq('id', rateioId)
      .eq('pago', false)
    await recarregar()
    setMantendo(false)
  }

  const recentes = useMemo(() => {
    const uid = minhaMoradorId
    return despesas
      .filter((d) => d.status === 'confirmada')
      .filter((d) => souOwner || d.rateios.some((r) => r.morador_id === uid))
      .slice(0, 5)
      .map((d) => {
        const minhaParte = d.rateios.find((r) => r.morador_id === uid)
        return { d, minhaParte }
      })
  }, [despesas, minhaMoradorId, souOwner])

  if (loading || (casa && carregando)) {
    return <div className="empty">Carregando…</div>
  }

  return (
    <>
      <h1 className="page-title">Início</h1>
      <p className="page-sub">Visão geral da casa</p>
      <Dica chave="inicio">
        Aqui você vê o quanto a casa gastou no mês e quanto falta acertar. Toque numa despesa
        para ver a sua parte.
      </Dica>
      <div className="card saldo-card">
        <div className="linha">
          {mesAnoBR(new Date())} · {souOwner ? 'gasto total' : 'sua parte'}
        </div>
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
        <Link
          to="/balanco"
          viewTransition
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 'var(--space-3)',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            color: 'var(--on-accent)',
            textDecoration: 'none',
            padding: '6px 12px',
            border: '1px solid color-mix(in srgb, var(--on-accent) 35%, transparent)',
            borderRadius: 999,
          }}
        >
          Ver acerto ›
        </Link>
      </div>

      {previstasMes.length > 0 && (
        <>
          <div className="row mt-lg">
            <h2 className="section-title">Contas do mês (previstas)</h2>
            <strong className="mono">{formatBR(totalPrevisto)}</strong>
          </div>
          <p className="small muted">Pagou? Use <strong>Pagar</strong> e a previsão é convertida em despesa confirmada.</p>
          <div className="card-flush mt">
            {previstasMes.map((d) => (
              <Link to={`/despesa/${d.id}`} viewTransition key={d.id} className="list-line">
                <div className="item-linha">
                  <div className="item-corpo">
                    <strong>{d.fornecedor}</strong>
                    <div className="small muted">
                      {labelCategoria(d.categoria, casa?.categorias)} · {dataBR(d.data)}
                    </div>
                  </div>
                  <div className="item-lado">
                    <strong className="mono">{formatBR(d.valor)}</strong>
                    {estaAtrasada(d.data) && (
                      <span className="badge badge-danger">atrasado</span>
                    )}
                  </div>
                  <span className="item-seta" aria-hidden>›</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="row mt-lg">
        <h2 className="section-title">Últimas despesas</h2>
        <span className="small muted">em + Pagar dá pra pagar ou lançar</span>
      </div>

      {recentes.length === 0 ? (
        <div className="empty">
          <div className="empty-icone" aria-hidden>🧾</div>
          <p>Nenhuma despesa ainda.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 'var(--space-3)' }}>
            <Link to="/nova" viewTransition className="btn btn-primary btn-sm">
              Pagar conta
            </Link>
            <Link to="/avulsa" viewTransition className="btn btn-secondary btn-sm">
              Lançar despesa
            </Link>
          </div>
        </div>
      ) : (
        <div className="card-flush">
          {recentes.map(({ d, minhaParte }) => (
            <div
              key={d.id}
              className="list-line clicavel"
              onClick={() => navigate(`/despesa/${d.id}`)}
              role="link"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/despesa/${d.id}`)}
            >
              <div className="item-linha">
                <div className="item-corpo">
                  <strong>{d.fornecedor}</strong>
                  <div className="small muted">
                    {nomeMorador(moradores, d.pago_por)} pagou · {labelCategoria(d.categoria, casa?.categorias)}
                  </div>
                </div>
                <div className="item-lado">
                  <strong className="mono">{formatBR(d.valor)}</strong>
                  {minhaParte?.pago
                    ? <span className="badge badge-ok">pago</span>
                    : minhaParte
                      ? <span className="badge badge-warn">sua parte {formatBR(minhaParte.valor_rateado)}</span>
                      : <span className="small muted">—</span>}
                </div>
                <span className="item-seta" aria-hidden>›</span>
              </div>
              {minhaParte && !minhaParte.pago && (
                <div className="item-acoes">
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    disabled={mantendo}
                    onClick={(e) => {
                      e.stopPropagation()
                      void marcarMinhaParte(minhaParte.id)
                    }}
                  >
                    {mantendo ? '…' : 'Marcar minha parte'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {souOwner && (
        <p className="center small muted mt">
          Cadastre <Link to="/perfil/contas" viewTransition>contas recorrentes</Link> para as próximas contas
          aparecerem aqui automaticamente.
        </p>
      )}
    </>
  )
}