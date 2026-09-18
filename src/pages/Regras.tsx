import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { validarPercentuais } from '../lib/rateio'
import { useApp } from '../state/AppContext'
import type { RegraRateio } from '../types'

export function Regras() {
  const navigate = useNavigate()
  const { casa, moradores, minhaMoradorId } = useApp()
  const [percentuais, setPercentuais] = useState<Record<string, string>>({})
  const [salvo, setSalvo] = useState(false)
  const [erro, setErro] = useState('')

  const souOwner = moradores.find((m) => m.id === minhaMoradorId)?.role === 'owner'

  useEffect(() => {
    if (!casa) return
    supabase
      .from('regras_rateio')
      .select('*')
      .eq('casa_id', casa.id)
      .then(({ data }) => {
        const m = new Map((data ?? []).map((r: RegraRateio) => [r.user_id, r.percentual]))
        const inicial: Record<string, string> = {}
        for (const mor of moradores) {
          const userRef = mor.user_id
          const v = userRef ? m.get(userRef) : undefined
          inicial[mor.id] = v !== undefined ? String(v) : ''
        }
        setPercentuais(inicial)
      })
  }, [casa, moradores])

  const salvar = async () => {
    if (!casa) return
    const comConta = moradores.filter((m) => m.user_id)
    const err = validarPercentuais(
      comConta,
      Object.fromEntries(comConta.map((m) => [m.id, Number(percentuais[m.id]) || 0])),
    )
    if (err) {
      setErro(err)
      return
    }
    setErro('')
    const linhas = comConta
      .map((m) => ({
        casa_id: casa.id,
        user_id: m.user_id as string,
        percentual: Number(percentuais[m.id]) || 0,
      }))
      .filter((l) => l.percentual > 0)

    const { error: delErr } = await supabase.from('regras_rateio').delete().eq('casa_id', casa.id)
    if (delErr) return
    if (linhas.length) {
      const { error: insErr } = await supabase.from('regras_rateio').insert(linhas)
      if (insErr) return
    }
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2000)
  }

  return (
    <>
      <div className="nav-back">
        <button type="button" onClick={() => navigate(-1)}>
          <span aria-hidden>‹</span> Voltar
        </button>
      </div>

      <h1 className="page-title">Taxa fixa de rateio</h1>
      <p className="small muted" style={{ margin: '0 0 var(--space-3)' }}>
        Percentual padrão das despesas do tipo "percentual". Somente moradores com conta podem ter
        taxa fixa.
      </p>

      {erro && <div className="error-box">{erro}</div>}

      <div className="card">
        {!souOwner ? (
          <p className="small muted">Somente o(a) responsável pode editar.</p>
        ) : (
          <>
            {moradores.map((m) => (
              <div className="row" key={m.id} style={{ marginTop: 'var(--space-2)' }}>
                <span className="small">{m.nome}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    style={{ width: 80 }}
                    value={percentuais[m.id] ?? ''}
                    onChange={(e) =>
                      setPercentuais((prev) => ({
                        ...prev,
                        [m.id]: e.target.value.replace(/[^\d.]/g, ''),
                      }))
                    }
                  />
                  <span className="muted">%</span>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-primary btn-sm mt" onClick={salvar}>
              {salvo ? 'Salvo ✓' : 'Salvar taxa'}
            </button>
          </>
        )}
      </div>
    </>
  )
}