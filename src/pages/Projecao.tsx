import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp, nomeMorador } from '../state/AppContext'
import { useDespesas } from '../lib/dados'
import { calcularRateio } from '../lib/rateio'
import { formatBR, dataBR, parseCentavos } from '../lib/format'
import type { Despesa } from '../types'

export function Projecao() {
  const { casa, minhaMoradorId, moradores } = useApp()
  const { despesas, recarregar, carregando } = useDespesas(casa?.id ?? null)
  const [abrindo, setAbrindo] = useState<string | null>(null)
  const [valorEdit, setValorEdit] = useState('')
  const [pagador, setPagador] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const previstas = despesas
    .filter((d) => d.status === 'prevista')
    .sort((a, b) => a.data.localeCompare(b.data))

  const ordenadasBr: Despesa[] = previstas

  const abrir = (d: Despesa) => {
    setAbrindo(d.id)
    setValorEdit(String(d.valor))
    setPagador(minhaMoradorId ?? '')
    setErro('')
  }

  const confirmar = async (d: Despesa) => {
    setErro('')
    const valorNum = parseCentavos(valorEdit)
    if (valorNum === null || valorNum <= 0) return setErro('Valor inválido')
    setEnviando(true)
    try {
      const { data: atualizada, error } = await supabase
        .from('despesas')
        .update({
          status: 'confirmada',
          valor: valorNum,
          pago_por: pagador || null,
        })
        .eq('id', d.id)
        .select('id, tipo_rateio, valor')
        .single()
      if (error) throw error

      const itens = calcularRateio(valorNum, moradores.map((m) => ({ user_id: m.id })), {
        regra: atualizada.tipo_rateio as Despesa['tipo_rateio'],
        incluidos: moradores.map((m) => m.id),
      })
      const { error: errRateios } = await supabase.from('rateios').insert(
        itens.map((i) => ({
          despesa_id: atualizada.id,
          morador_id: i.morador_id,
          valor_rateado: i.valor_rateado,
        })),
      )
      if (errRateios) throw errRateios

      setAbrindo(null)
      await recarregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao confirmar')
    } finally {
      setEnviando(false)
    }
  }

  const cancelar = async (id: string) => {
    await supabase.from('despesas').update({ status: 'cancelada' }).eq('id', id)
    await recarregar()
  }

  if (carregando) return <div className="empty">Carregando…</div>

  return (
    <>
      <h1 style={{ fontSize: 20 }}>Próximas contas</h1>
      <p className="small muted">Previsões geradas pelas recorrências até +12 meses. Confirme quando pagar.</p>

      {ordenadasBr.length === 0 ? (
        <div className="empty">Nenhuma despesa prevista. Cadastre uma <strong>recorrência</strong> para gerar previsões.</div>
      ) : (
        ordenadasBr.map((d) => (
          <div className="card" key={d.id}>
            <div className="row">
              <div>
                <strong>{d.fornecedor}</strong>
                <div className="small muted">
                  {dataBR(d.data)} · valor previsto
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong className="mono">{formatBR(d.valor)}</strong>
                <div className="small mt">
                  {abrindo === d.id ? (
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAbrindo(null)}>Fechar</button>
                  ) : (
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => abrir(d)}>Confirmar</button>
                  )}
                </div>
              </div>
            </div>

            {abrindo === d.id && (
              <div className="mt">
                <label>Valor real (do boleto)</label>
                <input
                  inputMode="decimal"
                  value={valorEdit}
                  onChange={(e) => setValorEdit(e.target.value)}
                />
                <label>Quem pagou</label>
                <select value={pagador} onChange={(e) => setPagador(e.target.value)}>
                  {moradores.map((m) => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
                </select>
                {erro && <div className="error-box">{erro}</div>}
                <div className="row mt">
                  <button type="button" className="btn btn-secondary" onClick={() => cancelar(d.id)}>
                    Cancelar esta conta
                  </button>
                  <button type="button" className="btn btn-primary" disabled={enviando} onClick={() => confirmar(d)}>
                    {enviando ? '…' : 'Confirmar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}

      <p className="small muted center mt">
        {nomeMorador(moradores, minhaMoradorId)} · taxa atual na casa
      </p>
    </>
  )
}