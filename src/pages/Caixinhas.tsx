import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp, nomeMorador } from '../state/AppContext'
import { formatBR, parseCentavos, dataBR } from '../lib/format'
import { Confirmacao } from '../components/Confirmacao'
import type { Caixinha, MovimentoCaixinha } from '../types'

type AbaMovimento = 'entrada' | 'saida'

export function Caixinhas() {
  const { casa, minhaMoradorId, moradores, souOwner } = useApp()
  const navigate = useNavigate()

  const [caixinhas, setCaixinhas] = useState<Caixinha[]>([])
  const [movimentos, setMovimentos] = useState<Record<string, MovimentoCaixinha[]>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const [criando, setCriando] = useState(false)
  const [nomeNova, setNomeNova] = useState('')
  const [salvandoNova, setSalvandoNova] = useState(false)

  const [movendo, setMovendo] = useState<Caixinha | null>(null)
  const [abaMovimento, setAbaMovimento] = useState<AbaMovimento>('entrada')
  const [valorMovimento, setValorMovimento] = useState('')
  const [descricaoMovimento, setDescricaoMovimento] = useState('')
  const [salvandoMovimento, setSalvandoMovimento] = useState(false)
  const [erroMovimento, setErroMovimento] = useState('')

  const [excluindo, setExcluindo] = useState<Caixinha | null>(null)
  const [salvandoExclusao, setSalvandoExclusao] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)

  const carregar = async () => {
    if (!casa) return
    const { data: cx, error: errCx } = await supabase
      .from('caixinhas')
      .select('*')
      .eq('casa_id', casa.id)
      .order('criado_em', { ascending: true })
    if (errCx) {
      setErro(errCx.message)
      return
    }
    setCaixinhas((cx ?? []) as Caixinha[])
    const ids = ((cx ?? []) as Caixinha[]).map((c: Caixinha) => c.id)
    if (ids.length === 0) {
      setMovimentos({})
      return
    }
    const { data: mov } = await supabase
      .from('movimentos_caixinha')
      .select('*')
      .in('caixinha_id', ids)
    const porCaixinha: Record<string, MovimentoCaixinha[]> = {}
    for (const m of (mov ?? []) as MovimentoCaixinha[]) {
      porCaixinha[m.caixinha_id] = porCaixinha[m.caixinha_id] ?? []
      porCaixinha[m.caixinha_id].push(m)
    }
    for (const id of Object.keys(porCaixinha)) {
      porCaixinha[id].sort((a, b) => (a.data > b.data ? -1 : 1))
    }
    setMovimentos(porCaixinha)
  }

  useEffect(() => {
    setCarregando(true)
    void carregar().then(() => setCarregando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casa?.id])

  const criarCaixinha = async () => {
    if (!casa) return
    const nome = nomeNova.trim()
    if (!nome) return
    setSalvandoNova(true)
    setErro('')
    const { error } = await supabase.from('caixinhas').insert({
      casa_id: casa.id,
      nome,
      regra: 'igual',
    })
    setSalvandoNova(false)
    if (error) {
      setErro(error.message)
      return
    }
    setCriando(false)
    setNomeNova('')
    await carregar()
  }

  const salvarMovimento = async () => {
    if (!casa || !movendo || !minhaMoradorId) return
    const valorNum = parseCentavos(valorMovimento)
    if (valorNum === null || valorNum <= 0) {
      setErroMovimento('Informe um valor válido.')
      return
    }
    setErroMovimento('')
    setSalvandoMovimento(true)
    const { error } = await supabase.from('movimentos_caixinha').insert({
      caixinha_id: movendo.id,
      morador_id: minhaMoradorId,
      tipo: abaMovimento,
      valor: valorNum,
      descricao: descricaoMovimento.trim() || null,
    })
    setSalvandoMovimento(false)
    if (error) {
      setErroMovimento(error.message)
      return
    }
    setMovendo(null)
    setValorMovimento('')
    setDescricaoMovimento('')
    setExpandida(movendo.id)
    await carregar()
  }

  const confirmarExclusao = async () => {
    const alvo = excluindo
    if (!alvo) return
    setSalvandoExclusao(true)
    const { error } = await supabase.from('caixinhas').delete().eq('id', alvo.id)
    setSalvandoExclusao(false)
    setExcluindo(null)
    if (!error) {
      setErro('')
      await carregar()
    } else {
      setErro(error.message)
    }
  }

  const movimentoLabel = (tipo: string) => (tipo === 'entrada' ? 'Depósito' : 'Retirada')

  return (
    <>
      <div className="nav-back">
        <button type="button" onClick={() => navigate('/perfil')}>
          <span aria-hidden>‹</span> Voltar para Perfil
        </button>
      </div>

      <h1 className="page-title">Caixinhas</h1>
      <p className="page-sub">
        Dinheiro comum da casa — fundo de festa, condomínio do quindim, o que a casa decidir.
      </p>

      {erro && <div className="error-box mt">{erro}</div>}

      {souOwner && (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setCriando(true)}>
          Criar caixinha
        </button>
      )}

      {carregando ? (
        <div className="empty">Carregando…</div>
      ) : caixinhas.length === 0 ? (
        <div className="empty">
          <div className="empty-icone" aria-hidden>🪙</div>
          <p>Nenhuma caixinha ainda.</p>
          <p className="small muted">Crie uma para guardar um valor comum da casa.</p>
        </div>
      ) : (
        caixinhas.map((c) => {
          const lista = movimentos[c.id] ?? []
          const aberta = expandida === c.id
          return (
            <div className="card mt" key={c.id}>
              <div className="row">
                <div>
                  <strong>{c.nome}</strong>
                  <div className="small muted">divisão: igual</div>
                </div>
                <span className="mono" style={{ fontSize: 'var(--text-2xl)' }}>
                  {formatBR(Number(c.saldo) || 0)}
                </span>
              </div>

              <div className="row mt" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    setMovendo(c)
                    setAbaMovimento('entrada')
                    setValorMovimento('')
                    setDescricaoMovimento('')
                    setErroMovimento('')
                  }}
                >
                  Depositar
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    setMovendo(c)
                    setAbaMovimento('saida')
                    setValorMovimento('')
                    setDescricaoMovimento('')
                    setErroMovimento('')
                  }}
                >
                  Tirar
                </button>
                <button type="button" className="btn btn-sm btn-mudo" onClick={() => setExpandida(aberta ? null : c.id)}>
                  {aberta ? 'Ocultar extrato' : `Extrato (${lista.length})`}
                </button>
                {souOwner && (
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => setExcluindo(c)}>
                    Excluir
                  </button>
                )}
              </div>

              {aberta && (
                <div className="card-flush mt" style={{ marginTop: 'var(--space-3)' }}>
                  {lista.length === 0 ? (
                    <div className="empty">
                      <p className="small">Nenhum movimento ainda.</p>
                    </div>
                  ) : (
                    lista.map((m) => (
                      <div className="list-line" key={m.id}>
                        <div className="item-linha">
                          <div className="item-corpo small">
                            <strong>
                              {m.tipo === 'entrada' ? '+' : '−'} {formatBR(Number(m.valor) || 0)}
                            </strong>
                            <span className="muted">
                              {' '}
                              {m.tipo === 'entrada' ? 'entrou por' : 'saiu por'} {nomeMorador(moradores, m.morador_id)}
                            </span>
                            {m.descricao && <div className="muted">{m.descricao}</div>}
                          </div>
                          <span className="small muted">{dataBR(m.data)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })
      )}

      {criando && (
        <div className="overlay" onClick={() => setCriando(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <strong className="sheet-titulo">Criar caixinha</strong>
            <p className="small muted mt">
              Um nome simples: "fundo da festa", "condomínio", "café de casa".
            </p>

            <label>Nome</label>
            <input
              value={nomeNova}
              onChange={(e) => setNomeNova(e.target.value)}
              placeholder="Ex.: fundo da festa"
              autoFocus
            />

            <button
              type="button"
              className={`btn btn-primary${salvandoNova ? ' btn-spinner' : ''}`}
              style={{ width: '100%', marginTop: 'var(--space-4)' }}
              disabled={salvandoNova}
              onClick={() => void criarCaixinha()}
            >
              {salvandoNova ? '' : 'Criar'}
            </button>
          </div>
        </div>
      )}

      {movendo && (
        <div className="overlay" onClick={() => setMovendo(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <div>
                <strong className="sheet-titulo">{movimentoLabel(abaMovimento)}</strong>
                <div className="small muted">{movendo.nome} · saldo {formatBR(Number(movendo.saldo) || 0)}</div>
              </div>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => setMovendo(null)}>
                Cancelar
              </button>
            </div>

            <div className="seg seg-2 mt">
              <button
                type="button"
                className={abaMovimento === 'entrada' ? 'seg-on' : ''}
                onClick={() => setAbaMovimento('entrada')}
              >
                Depositar
              </button>
              <button
                type="button"
                className={abaMovimento === 'saida' ? 'seg-on' : ''}
                onClick={() => setAbaMovimento('saida')}
              >
                Tirar
              </button>
            </div>

            <label>{abaMovimento === 'entrada' ? 'Valor guardado' : 'Valor retirado'}</label>
            <input
              inputMode="decimal"
              value={valorMovimento}
              onChange={(e) => setValorMovimento(e.target.value)}
              placeholder="Ex.: 50,00"
              autoFocus
            />

            <label>Motivo (opcional)</label>
            <input
              value={descricaoMovimento}
              onChange={(e) => setDescricaoMovimento(e.target.value)}
              placeholder="Ex.: churrasco da casa"
            />

            {erroMovimento && <div className="error-box">{erroMovimento}</div>}

            <button
              type="button"
              className={`btn btn-primary${salvandoMovimento ? ' btn-spinner' : ''}`}
              style={{ width: '100%', marginTop: 'var(--space-4)' }}
              disabled={salvandoMovimento}
              onClick={() => void salvarMovimento()}
            >
              {salvandoMovimento ? '' : abaMovimento === 'entrada' ? 'Guardar' : 'Retirar'}
            </button>
          </div>
        </div>
      )}

      <Confirmacao
        aberto={excluindo !== null}
        titulo={`Excluir a caixinha "${excluindo?.nome ?? ''}"?`}
        mensagem="A caixinha e todo o histórico de movimentos serão apagados. O dinheiro não é movido de volta."
        rotulo="Excluir"
        perigoso
        carregando={salvandoExclusao}
        onFechar={() => setExcluindo(null)}
        onConfirmar={() => void confirmarExclusao()}
      />
    </>
  )
}

export default Caixinhas