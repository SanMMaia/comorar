import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp, nomeMorador } from '../state/AppContext'
import { lerTemaPref, salvarTema, type TemaPref } from '../lib/tema'
import { exportarBackup, restaurarBackup } from '../lib/backup'

const linkApp = 'https://comorar.vercel.app'

export function Perfil() {
  const { casa, user, moradores, minhaMoradorId, signOut, refreshCasa } = useApp()
  const navigate = useNavigate()

  const [msgCopia, setMsgCopia] = useState(false)
  const [tema, setTema] = useState<TemaPref>(lerTemaPref)
  const inputBackup = useRef<HTMLInputElement>(null)
  const [exportando, setExportando] = useState(false)
  const [restaurando, setRestaurando] = useState(false)
  const [msgBackup, setMsgBackup] = useState('')
  const [erroBackup, setErroBackup] = useState('')

  const trocarTema = (t: TemaPref) => {
    setTema(t)
    salvarTema(t)
  }

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
    if (!window.confirm(`Sair da casa "${casa.nome}"? Você precisará de um novo convite para voltar.`)) return
    await supabase.from('casa_morador').update({ ativo: false }).eq('casa_id', casa.id).eq('user_id', user.id)
    await refreshCasa()
    navigate('/onboarding')
  }

  const deslogar = async () => {
    await signOut()
    navigate('/login')
  }

  const baixarBackup = async () => {
    if (!casa) return
    setErroBackup('')
    setMsgBackup('')
    setExportando(true)
    try {
      await exportarBackup(casa.id, casa.nome)
      setMsgBackup('Backup baixado. Guarde o arquivo em local seguro.')
    } catch (err) {
      setErroBackup(err instanceof Error ? err.message : 'Erro ao exportar.')
    } finally {
      setExportando(false)
    }
  }

  const enviarBackup = async (arquivo: File) => {
    if (
      !window.confirm(
        'Restaurar este backup criará uma casa NOVA com os dados do arquivo. Deseja continuar?',
      )
    )
      return
    setErroBackup('')
    setMsgBackup('')
    setRestaurando(true)
    try {
      await restaurarBackup(arquivo)
      await refreshCasa()
      setMsgBackup('Backup restaurado. Você é o responsável pela casa restaurada.')
    } catch (err) {
      setErroBackup(err instanceof Error ? err.message : 'Erro ao restaurar.')
    } finally {
      setRestaurando(false)
    }
  }

  if (!casa) return <div className="empty">Sem casa vinculada.</div>

  return (
    <>
      <h1 className="page-title">{casa.nome}</h1>
      <p className="page-sub center">{nomeMorador(moradores, minhaMoradorId)} · {souOwner ? 'responsável' : 'morador'}</p>

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

      {souOwner && (
        <Link to="/perfil/contas" viewTransition className="card mt" style={{ display: 'block' }}>
          <div className="item-linha">
            <div className="item-corpo">
              <strong>Contas recorrentes</strong>
              <div className="small muted">Gerencie recorrências e lançamentos previstos</div>
            </div>
            <span className="item-seta" aria-hidden>›</span>
          </div>
        </Link>
      )}

      <h2 className="section-title" style={{ marginTop: 20 }}>Moradores</h2>
      <div className="card-flush">
        {moradores.map((m) => (
          <div className="list-line" key={m.id}>
            <div className="item-linha">
              <div className="item-corpo">
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
      </div>

      {souOwner && (
        <div className="card mt">
          <h2 className="section-title">Adicionar morador sem app</h2>
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

      <div className="card mt">
        <h2 className="section-title">Aparência</h2>
        <p className="small muted" style={{ margin: '6px 0 12px' }}>
          Escolha o tema do app ou acompanhe o do sistema.
        </p>
        <div className="seg seg-3">
          {([
            ['sistema', 'Sistema'],
            ['claro', 'Claro'],
            ['escuro', 'Escuro'],
          ] as const).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              className={tema === valor ? 'seg-on' : ''}
              onClick={() => trocarTema(valor)}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {souOwner && (
        <div className="card-flush mt">
          <Link to="/perfil/categorias" viewTransition className="list-line">
            <div className="item-linha">
              <div className="item-corpo">
                <strong>Categorias de despesa</strong>
                <div className="small muted">Adicione, renomeie ou remova categorias</div>
              </div>
              <span className="item-seta" aria-hidden>›</span>
            </div>
          </Link>
          <Link to="/perfil/regras" viewTransition className="list-line">
            <div className="item-linha">
              <div className="item-corpo">
                <strong>Taxa fixa de rateio (%)</strong>
                <div className="small muted">Percentual padrão das despesas do tipo "percentual"</div>
              </div>
              <span className="item-seta" aria-hidden>›</span>
            </div>
          </Link>
        </div>
      )}

      {souOwner && (
        <div className="card mt">
          <h2 className="section-title">Backup e restauração</h2>
          <p className="small muted" style={{ margin: '6px 0 0' }}>
            Baixe uma cópia de tudo (moradores, recorrências, despesas e rateios) em um arquivo
            JSON. Restaurar cria uma casa nova a partir do arquivo.
          </p>
          {msgBackup && <div className="info-box mt">{msgBackup}</div>}
          {erroBackup && <div className="error-box mt">{erroBackup}</div>}
          <input
            ref={inputBackup}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void enviarBackup(f)
              e.target.value = ''
            }}
          />
          <div className="row mt" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void baixarBackup()}
              disabled={exportando || restaurando}
            >
              {exportando ? 'Gerando…' : 'Exportar backup'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => inputBackup.current?.click()}
              disabled={exportando || restaurando}
            >
              {restaurando ? 'Restaurando…' : 'Restaurar'}
            </button>
          </div>
        </div>
      )}

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