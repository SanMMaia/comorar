import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useNotificacoes } from '../state/NotificacoesContext'
import { useApp } from '../state/AppContext'
import type { Notificacao, PreferenciaNotificacao } from '../types'

const emojiTipo: Record<Notificacao['tipo'], string> = {
  rateio_criado: '💸',
  pagamento_confirmado: '✅',
  vencimento_proximo: '⏰',
}

function tempoRelativo(iso: string): string {
  const d = new Date(iso)
  const agora = new Date()
  const diff = agora.getTime() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const dias = Math.floor(h / 24)
  if (dias === 1) return 'ontem'
  if (dias < 7) return `${dias} dias`
  return d.toLocaleDateString('pt-BR')
}

export function Notificacoes() {
  const { user } = useApp()
  const { notificacoes, carregando, naoLidas, marcarLida, marcarTodasLidas } = useNotificacoes()
  const navigate = useNavigate()

  const [pref, setPref] = useState<PreferenciaNotificacao | null>(null)
  const [falhaPref, setFalhaPref] = useState('')

  useEffect(() => {
    if (!user) return
    void supabase
      .from('preferencias_notificacao')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPref(data as unknown as PreferenciaNotificacao)
      })
  }, [user])

  const salvarPref = async (patch: Partial<PreferenciaNotificacao>) => {
    if (!user) return
    const nova: PreferenciaNotificacao = {
      user_id: user.id,
      ativo: pref?.ativo ?? true,
      dias_antecedencia: pref?.dias_antecedencia ?? 3,
      canais: ['inbox'],
      ...pref,
      ...patch,
    }
    setPref(nova)
    setFalhaPref('')
    const { error } = await supabase
      .from('preferencias_notificacao')
      .upsert(nova, { onConflict: 'user_id' })
    if (error) setFalhaPref(error.message)
  }

  const abrir = async (n: Notificacao) => {
    if (!n.lida) await marcarLida(n.id)
    navigate(n.link_destino)
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 44 }}>
        <h1 className="bar-title">Notificações</h1>
        {naoLidas > 0 && (
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => void marcarTodasLidas()}>
            Marcar todas como lidas
          </button>
        )}
      </div>

      {carregando ? (
        <div className="empty">Carregando…</div>
      ) : notificacoes.length === 0 ? (
        <div className="empty">
          <p>Nenhuma notificação por enquanto.</p>
          <p className="small muted">Acompanhe cobranças, pagamentos e contas a vencer por aqui.</p>
        </div>
      ) : (
        <div className="card-flush">
          {notificacoes.map((n) => (
            <div
              key={n.id}
              className={n.lida ? 'list-line clicavel' : 'list-line clicavel notif-naolida'}
              onClick={() => void abrir(n)}
              role="link"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && void abrir(n)}
            >
              <div className="item-linha">
                <span className="notif-emoji" aria-hidden>{emojiTipo[n.tipo] ?? '🔔'}</span>
                <div className="item-corpo">
                  <div className="item-titulo">
                    <strong>{n.titulo}</strong>
                    <span className="small muted notif-tempo">{tempoRelativo(n.criado_em)}</span>
                  </div>
                  <div className="small muted" style={{ marginTop: 2 }}>{n.corpo}</div>
                </div>
                {!n.lida && <span className="notif-ponto" aria-hidden />}
                <span className="item-seta" aria-hidden>›</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card mt-lg">
        <h2 className="section-title">Preferências</h2>

        <label className="config-linha">
          <div>
            <strong>Receber notificações</strong>
            <div className="small muted">Alertas de cobrança, pagamento e vencimento</div>
          </div>
          <input
            type="checkbox"
            checked={pref?.ativo ?? true}
            onChange={(e) => void salvarPref({ ativo: e.target.checked })}
          />
        </label>

        <label className="config-linha" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div>
            <strong>Lembrar vencimentos com</strong>
            <div className="small muted">Antecedência para as contas recorrentes</div>
          </div>
          <select
            value={pref?.dias_antecedencia ?? 3}
            disabled={pref?.ativo === false}
            onChange={(e) => void salvarPref({ dias_antecedencia: Number(e.target.value) })}
            style={{ width: 'auto' }}
          >
            {[1, 2, 3, 5, 7, 14].map((d) => (
              <option key={d} value={d}>{d} dia{d > 1 ? 's' : ''}</option>
            ))}
          </select>
        </label>

        {falhaPref && <div className="error-box">{falhaPref}</div>}
        <p className="small muted" style={{ marginBottom: 0 }}>
          Hoje as notificações chegam por aqui mesmo (inbox). Notificações por push e e-mail ficam para uma próxima versão.
        </p>
      </div>
    </>
  )
}