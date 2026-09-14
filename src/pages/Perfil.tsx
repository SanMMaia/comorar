import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp, nomeMorador } from '../state/AppContext'

const linkApp = 'https://comorar.vercel.app'

export function Perfil() {
  const { casa, user, moradores, minhaMoradorId, signOut, refreshCasa } = useApp()
  const navigate = useNavigate()

  const [msgCopia, setMsgCopia] = useState(false)

  const [novoNome, setNovoNome] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [erroNovo, setErroNovo] = useState('')
  const [enviandoNovo, setEnviandoNovo] = useState(false)

  const souOwner = moradores.find((m) => m.id === minhaMoradorId)?.role === 'owner'

  const mensagemConvite = () =>
    `Entre na casa "${casa?.nome}" no Comorar! Código de convite: ${casa?.codigo_convite}. Acesse ${linkApp}`

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(mensagemConvite())
    } catch {
      const ta = document.createElement('textarea')
      ta.value = mensagemConvite()
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setMsgCopia(true)
    setTimeout(() => setMsgCopia(false), 2000)
  }

  const compartilhar = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Comorar', text: mensagemConvite(), url: linkApp })
        return
      } catch {
        /* cancelado — segue para cópia */
      }
    }
    await copiar()
  }

  const criarMoradorSemApp = async (e: FormEvent) => {
    e.preventDefault()
    setErroNovo('')
    if (!casa) return
    const nome = novoNome.trim()
    if (!nome) return setErroNovo('Informe o nome')
    setEnviandoNovo(true)
    const { error } = await supabase.from('casa_morador').insert({
      casa_id: casa.id,
      user_id: null,
      nome,
      email: novoEmail.trim() || null,
      role: 'member',
      ativo: true,
    })
    setEnviandoNovo(false)
    if (error) return setErroNovo(error.message)
    setNovoNome('')
    setNovoEmail('')
    await refreshCasa()
  }

  const removerMorador = async (id: string) => {
    const nome = moradores.find((m) => m.id === id)?.nome ?? ''
    if (!window.confirm(`Remover "${nome}" da casa?`)) return
    const { error } = await supabase.from('casa_morador').update({ ativo: false }).eq('id', id)
    if (!error) await refreshCasa()
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
      <p className="small muted center">{nomeMorador(moradores, minhaMoradorId)} · {souOwner ? 'responsável' : 'morador'}</p>

      <div className="card">
        <div className="row">
          <div>
            <div className="small muted">Código de convite</div>
            <strong className="mono" style={{ fontSize: 22 }}>{casa.codigo_convite}</strong>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={copiar}>
            {msgCopia ? 'Copiado ✓' : 'Copiar'}
          </button>
        </div>

        <button
          type="button"
          className={`btn btn-primary btn-sm mt ${souOwner ? '' : 'btn-secondary'}`}
          onClick={() => void compartilhar()}
        >
          Convidar morador
        </button>
        <p className="small muted mt" style={{ marginBottom: 0 }}>
          Envie o código <strong>{casa.codigo_convite}</strong> para outra pessoa. Ela entra em{' '}
          <strong>Onboarding → “Já tenho código”</strong> no app.
        </p>
      </div>

      <Link to="/perfil/contas" viewTransition className="card mt" style={{ display: 'block' }}>
        <div className="row">
          <div>
            <strong>Contas recorrentes</strong>
            <div className="small muted">Gerencie recorrências e lançamentos previstos</div>
          </div>
          <span className="small muted" aria-hidden>›</span>
        </div>
      </Link>

      <h2 style={{ fontSize: 15, marginTop: 20 }}>Moradores</h2>
      {moradores.map((m) => (
        <div className="card" key={m.id}>
          <div className="row">
            <div>
              <strong>{m.nome}</strong>
              {m.user_id === user?.id && <span className="badge badge-ok" style={{ marginLeft: 6 }}>você</span>}
              {m.tipo === 'extra' && <span className="badge badge-muted" style={{ marginLeft: 6 }}>sem app</span>}
              {m.role === 'owner' && m.user_id !== user?.id && (
                <span className="badge badge-muted" style={{ marginLeft: 6 }}>responsável</span>
              )}
              {m.email && <div className="small muted">{m.email}</div>}
            </div>
            {souOwner && m.id !== minhaMoradorId && (
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => removerMorador(m.id)}>
                Remover
              </button>
            )}
          </div>
        </div>
      ))}

      {souOwner && (
        <div className="card mt">
          <h2 style={{ fontSize: 15, margin: 0 }}>Adicionar morador sem app</h2>
          <p className="small muted" style={{ margin: '6px 0 0' }}>
            Para quem divide a casa mas não vai instalar o app (o saldo dele também fica no Balanço).
          </p>
          <form onSubmit={criarMoradorSemApp}>
            <label>Nome</label>
            <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex.: Marcos" />
            <label>E-mail (opcional)</label>
            <input type="email" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} placeholder="Ex.: marcos@email.com" />
            {erroNovo && <div className="error-box">{erroNovo}</div>}
            <button type="submit" className="btn btn-primary mt" disabled={enviandoNovo}>
              {enviandoNovo ? 'Adicionando…' : 'Adicionar morador'}
            </button>
          </form>
        </div>
      )}

      <Link to="/perfil/regras" viewTransition className="card mt" style={{ display: 'block' }}>
        <div className="row">
          <div>
            <strong>Taxa fixa de rateio (%)</strong>
            <div className="small muted">Percentual padrão das despesas do tipo "percentual"</div>
          </div>
          <span className="small muted" aria-hidden>›</span>
        </div>
      </Link>

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