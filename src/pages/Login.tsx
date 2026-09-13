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
  const navigate = useNavigate()

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
    <div className="content" style={{ paddingTop: 40 }}>
      <div className="center" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>🏠 Comorar</h1>
        <p className="muted">Divida as despesas da casa de forma justa</p>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button
            type="button"
            className={`btn ${modo === 'entrar' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setModo('entrar')}
          >
            Entrar
          </button>
          <button
            type="button"
            className={`btn ${modo === 'criar' ? 'btn-primary' : 'btn-secondary'}`}
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
            type="password"
            required
            minLength={6}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="••••••••"
          />

          {erro && <div className="error-box">{erro}</div>}

          <button type="submit" className="btn btn-primary mt-lg" disabled={carregando}>
            {carregando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </div>
    </div>
  )
}