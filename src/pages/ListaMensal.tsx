import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp, nomeMorador } from '../state/AppContext'
import { useDespesas } from '../lib/dados'
import { supabase } from '../lib/supabase'
import { formatBR, dataBR, mesAnoBR, estaAtrasada } from '../lib/format'
import { categoriasEfetivas, labelCategoria } from '../lib/categorias'

export function ListaMensal() {
  const { casa, user, minhaMoradorId, moradores } = useApp()
  const { despesas, recarregar, carregando } = useDespesas(casa?.id ?? null)
  const navigate = useNavigate()
  const [mantendo, setMantendo] = useState(false)
  const [busca, setBusca] = useState('')
  const [categoriaSel, setCategoriaSel] = useState('')
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
    const termo = busca.trim().toLowerCase()
    const lista = despesas.filter((d) => {
      if (d.status === 'cancelada') return false
      if (d.data.slice(0, 7) !== chave) return false
      if (categoriaSel && d.categoria !== categoriaSel) return false
      if (termo) {
        if (d.fornecedor.toLowerCase().includes(termo)) return true
        const cat = labelCategoria(d.categoria, casa?.categorias).toLowerCase()
        if (cat.includes(termo)) return true
        if (d.descricao?.toLowerCase().includes(termo)) return true
        if (nomeMorador(moradores, d.pago_por).toLowerCase().includes(termo)) return true
        return false
      }
      return true
    })
    return {
      doMes: lista,
      total: lista.filter((d) => d.status === 'confirmada').reduce((a, b) => a + b.valor, 0),
      totalPrevisto: lista.filter((d) => d.status === 'prevista').reduce((a, b) => a + b.valor, 0),
    }
  }, [despesas, mes, ano, busca, categoriaSel, casa, moradores])

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

      <input
        type="search"
        className="mt"
        placeholder="Buscar por fornecedor, categoria ou morador…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      <div className="row mt" style={{ gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={categoriaSel === '' ? 'chip chip-ativo' : 'chip'}
          onClick={() => setCategoriaSel('')}
        >
          Todas
        </button>
        {categoriasEfetivas(casa?.categorias).map((c) => (
          <button
            type="button"
            key={c.id}
            className={categoriaSel === c.id ? 'chip chip-ativo' : 'chip'}
            onClick={() => setCategoriaSel((v) => (v === c.id ? '' : c.id))}
          >
            {c.label}
          </button>
        ))}
      </div>

      {busca.trim() && doMes.length === 0 && (
        <div className="empty">
          <div className="empty-icone" aria-hidden>🔍</div>
          <p>Nada encontrado para "{busca.trim()}" neste mês.</p>
        </div>
      )}
      {!busca.trim() && doMes.length === 0 && (
        <div className="empty">
          <div className="empty-icone" aria-hidden>🗓️</div>
          <p>Nenhum lançamento neste mês.</p>
        </div>
      )}

      {doMes.length > 0 && (
        <div className="card-flush mt">
          {doMes
            .sort((a, b) => a.data.localeCompare(b.data))
            .map((d) => {
              const minhaParte = d.rateios.find((r) => r.morador_id === minhaMoradorId && !r.pago)
              return (
                <div
                  key={d.id}
                  className="list-line clicavel"
                  onClick={() => navigate(`/despesa/${d.id}`)}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/despesa/${d.id}`)}
                >
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
                        {d.status === 'prevista' && estaAtrasada(d.data) && (
                          <span className="badge badge-danger">atrasado</span>
                        )}
                        {d.status === 'prevista' && !estaAtrasada(d.data) && (
                          <span className="badge badge-warn">previsto</span>
                        )}
                      </div>
                    </div>
                    {minhaParte && (
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
                    )}
                    <span className="small muted">›</span>
                  </div>
                </div>
              )
            })}
        </div>
      )}

      <div style={{ height: 8 }} />
    </>
  )
}