import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar')
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [mostrandoSenha, setMostrandoSenha] = useState(false)
  const [msgRecuperar, setMsgRecuperar] = useState('')
  const [recuperando, setRecuperando] = useState(false)
  const navigate = useNavigate()

  const recuperarSenha = async () => {
    setErro('')
    setMsgRecuperar('')
    if (!email.trim()) {
      setErro('Informe seu e-mail para recuperar a senha.')
      return
    }
    setRecuperando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim())
    setRecuperando(false)
    if (error) {
      setErro(error.message)
      return
    }
    setMsgRecuperar('Enviamos um link de recuperação para o seu e-mail.')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      if (modo === 'criar') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { data: { full_name: nome || undefined } },
        })
        if (error) throw error
        if (data.session) {
          navigate('/onboarding')
        } else {
          setErro('Conta criada. Verifique sua caixa de entrada para confirmar o e-mail antes de entrar.')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
        if (error) throw error
        navigate('/')
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao entrar')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="content" style={{ paddingTop: 'var(--space-10)' }}>
      <div className="center" style={{ marginBottom: 'var(--space-6)' }}>
        <h1 className="page-title" style={{ fontSize: 'var(--text-hero)', margin: 0 }}>🏠 Comorar</h1>
        <p className="muted">Sua casa, suas contas, um app só.</p>
      </div>

      <div className="card-elevado">
        <div className="seg">
          <button
            type="button"
            className={modo === 'entrar' ? 'seg-on' : ''}
            onClick={() => setModo('entrar')}
          >
            Entrar
          </button>
          <button
            type="button"
            className={modo === 'criar' ? 'seg-on' : ''}
            onClick={() => setModo('criar')}
          >
            Criar conta
          </button>
        </div>

        <form onSubmit={submit}>
          {modo === 'criar' && (
            <>
              <label htmlFor="nome">Como você se chama?</label>
              <input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Ana"
              />
            </>
          )}
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@email.com"
          />
          <label htmlFor="senha">Senha</label>
          <input
            id="senha"
            type={mostrandoSenha ? 'text' : 'password'}
            required
            minLength={6}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="••••••••"
          />
          <div className="row mt" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="btn-mudo" onClick={() => setMostrandoSenha((v) => !v)}>
              {mostrandoSenha ? 'Ocultar senha' : 'Mostrar senha'}
            </button>
            {modo === 'entrar' && (
              <button type="button" className="btn-mudo" onClick={() => void recuperarSenha()} disabled={recuperando}>
                {recuperando ? 'Enviando…' : 'Esqueci a senha'}
              </button>
            )}
          </div>

          {msgRecuperar && <div className="info-box mt">{msgRecuperar}</div>}
          {erro && <div className="error-box mt">{erro}</div>}

          <button type="submit" className="btn btn-primary mt-lg" disabled={carregando}>
            {carregando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </div>
    </div>
  )
}