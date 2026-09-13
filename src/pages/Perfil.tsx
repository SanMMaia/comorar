import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../state/AppContext'
import type { RegraRateio } from '../types'

export function Perfil() {
  const { casa, user, moradores, signOut, refreshCasa } = useApp()
  const navigate = useNavigate()
  const [role, setRole] = useState<'owner' | 'member' | null>(null)
  const [percentuais, setPercentuais] = useState<Record<string, string>>({})
  const [salvo, setSalvo] = useState(false)

  useEffect(() => {
    if (!casa || !user) return
    supabase
      .from('casa_morador')
      .select('role')
      .eq('casa_id', casa.id)
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => setRole((data?.role as 'owner' | 'member') ?? null))

    supabase
      .from('regras_rateio')
      .select('*')
      .eq('casa_id', casa.id)
      .then(({ data }) => {
        const m = new Map((data ?? []).map((r: RegraRateio) => [r.user_id, r.percentual]))
        const inicial: Record<string, string> = {}
        for (const mor of moradores) {
          const v = m.get(mor.user_id)
          inicial[mor.user_id] = v !== undefined ? String(v) : ''
        }
        setPercentuais(inicial)
      })
  }, [casa, user, moradores])

  const salvarRegras = async () => {
    if (!casa) return
    const linhas = Object.entries(percentuais)
      .filter(([, v]) => v !== '' && Number(v) > 0)
      .map(([userId, v]) => ({ casa_id: casa.id, user_id: userId, percentual: Number(v) }))

    const { error: delErr } = await supabase.from('regras_rateio').delete().eq('casa_id', casa.id)
    if (delErr) return
    if (linhas.length) {
      const { error: insErr } = await supabase.from('regras_rateio').insert(linhas)
      if (insErr) return
    }
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2000)
  }

  const sairDaCasa = async () => {
    if (!casa || !user) return
    await supabase.from('casa_morador').update({ ativo: false }).eq('casa_id', casa.id).eq('user_id', user.id)
    await refreshCasa()
    navigate('/onboarding')
  }

  const deslogar = async () => {
    await signOut()
    navigate('/login')
  }

  if (!casa) return <div className="empty">Sem casa vinculada.</div>

  return (
    <>
      <h1 style={{ fontSize: 20 }}>{casa.nome}</h1>

      <div className="card">
        <div className="row">
          <div>
            <div className="small muted">Código de convite</div>
            <strong className="mono">{casa.codigo_convite}</strong>
          </div>
          <span className={`badge ${role === 'owner' ? 'badge-ok' : 'badge-muted'}`}>
            {role === 'owner' ? 'responsável' : 'morador'}
          </span>
        </div>
      </div>

      <h2 style={{ fontSize: 15, marginTop: 20 }}>Moradores</h2>
      {moradores.map((m) => (
        <div className="card" key={m.user_id}>
          <div className="row">
            <div>
              <strong>{m.nome}</strong>
              <div className="small muted">{m.email}</div>
            </div>
          </div>
        </div>
      ))}

      <h2 style={{ fontSize: 15, marginTop: 20 }}>Taxa fixa de rateio</h2>
      <div className="card">
        <p className="small muted" style={{ margin: 0 }}>
          Percentual padrão usado nas despesas do tipo "percentual". A soma deve ser 100.
        </p>
        {role !== 'owner' ? (
          <p className="small muted mt">Somente o(a) responsável pode editar.</p>
        ) : (
          <>
            {moradores.map((m) => (
              <div className="row" key={m.user_id} style={{ marginTop: 8 }}>
                <span className="small">{m.nome}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    style={{ width: 80 }}
                    value={percentuais[m.user_id] ?? ''}
                    onChange={(e) =>
                      setPercentuais((prev) => ({
                        ...prev,
                        [m.user_id]: e.target.value.replace(/[^\d.]/g, ''),
                      }))
                    }
                    disabled={role !== 'owner'}
                  />
                  <span className="muted">%</span>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-primary btn-sm mt" onClick={salvarRegras}>
              {salvo ? 'Salvo ✓' : 'Salvar taxa'}
            </button>
          </>
        )}
      </div>

      <div className="mt-lg">
        <button type="button" className="btn btn-secondary" onClick={sairDaCasa}>Sair da casa</button>
      </div>

      {user && (
        <p className="small muted center">
          Logado como <strong>{user.email}</strong>
          <br />
          <button type="button" className="btn btn-sm btn-secondary mt" onClick={deslogar}>
            Sair da conta
          </button>
        </p>
      )}
    </>
  )
}