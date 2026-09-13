import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../state/AppContext'

export function Onboarding() {
  const [modo, setModo] = useState<'criar' | 'entrar'>('criar')
  const [nomeCasa, setNomeCasa] = useState('')
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const navigate = useNavigate()
  const { refreshCasa } = useApp()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      if (modo === 'criar') {
        if (!nomeCasa.trim()) throw new Error('Dê um nome para a casa')
        const { error } = await supabase.rpc('create_casa', { p_nome: nomeCasa.trim() })
        if (error) throw error
      } else {
        if (!codigo.trim()) throw new Error('Digite o código de convite')
        const { error } = await supabase.rpc('join_casa', { p_codigo: codigo.trim() })
        if (error) throw error
      }
      await refreshCasa()
      navigate('/')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao configurar a casa')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="content" style={{ paddingTop: 24 }}>
      <h1 style={{ fontSize: 22 }}>Bem-vindo! 👋</h1>
      <p className="muted">Crie uma casa para começar a dividir despesas ou entre com o código de convite dos seus moradores.</p>

      <div className="card">
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button
            type="button"
            className={`btn ${modo === 'criar' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setModo('criar')}
          >
            Criar casa
          </button>
          <button
            type="button"
            className={`btn ${modo === 'entrar' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setModo('entrar')}
          >
            Tenho um código
          </button>
        </div>

        <form onSubmit={submit}>
          {modo === 'criar' ? (
            <>
              <label htmlFor="nomeCasa">Nome da casa</label>
              <input
                id="nomeCasa"
                value={nomeCasa}
                onChange={(e) => setNomeCasa(e.target.value)}
                placeholder="Ex.: República do Centro"
              />
              <p className="small muted mt">
                Você será o(a) responsável. Depois, compartilhe o código de convite com os outros moradores.
              </p>
            </>
          ) : (
            <>
              <label htmlFor="codigo">Código de convite</label>
              <input
                id="codigo"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="EX.: AB12CD34"
              />
            </>
          )}

          {erro && <div className="error-box">{erro}</div>}

          <button type="submit" className="btn btn-primary mt-lg" disabled={carregando}>
            {carregando ? 'Aguarde…' : 'Continuar'}
          </button>
        </form>
      </div>
    </div>
  )
}