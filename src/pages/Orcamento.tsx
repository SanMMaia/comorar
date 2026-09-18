import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { supabase } from '../lib/supabase'
import { formatBR, parseCentavos, mesAtual, mesAnoBR } from '../lib/format'
import { categoriasEfetivas, labelCategoria } from '../lib/categorias'
import type { Categoria } from '../types'
import { Confirmacao } from '../components/Confirmacao'

interface OrcamentoLinha {
  categoria: string
  limite: number
  usado: number
  restante: number
  pct: number
}

function deslocarMes(chave: string, delta: number): string {
  const [y, m] = chave.split('-').map(Number)
  const idx = y * 12 + (m - 1) + delta
  const ny = Math.floor(idx / 12)
  const nm = idx % 12
  return `${ny}-${String(nm + 1).padStart(2, '0')}`
}

function corPct(pct: number): string {
  if (pct >= 100) return 'danger'
  if (pct >= 80) return 'warn'
  return 'ok'
}

export function Orcamento() {
  const { casa } = useApp()
  const navigate = useNavigate()
  const [mes, setMes] = useState(() => mesAtual())
  const [linhas, setLinhas] = useState<OrcamentoLinha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [editando, setEditando] = useState<Categoria | null>(null)
  const [categoriaNova, setCategoriaNova] = useState(false)
  const [valor, setValor] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erroEdicao, setErroEdicao] = useState('')
  const [removendo, setRemovendo] = useState<Categoria | null>(null)

  useEffect(() => {
    if (!casa) return
    let ativo = true
    setCarregando(true)
    setErro('')
    void supabase
      .rpc('orcamento_uso', { p_casa: casa.id, p_mes: mes })
      .then(({ data, error }) => {
        if (!ativo) return
        setLinhas(error ? [] : ((data ?? []) as unknown as OrcamentoLinha[]))
        if (error) setErro(error.message)
        setCarregando(false)
      })
    return () => {
      ativo = false
    }
  }, [casa, mes])

  const categorias = categoriasEfetivas(casa?.categorias)
  const comOrcamento = new Set(linhas.map((l) => l.categoria))
  const categoriaLabel = (c: Categoria) => labelCategoria(c, casa?.categorias)

  const abrirEdicao = (c: Categoria, limiteAtual = 0) => {
    setCategoriaNova(false)
    setEditando(c)
    setValor(limiteAtual > 0 ? limiteAtual.toFixed(2).replace('.', ',') : '')
    setErroEdicao('')
  }

  const abrirNova = () => {
    const disponiveis = categorias.filter((c) => !comOrcamento.has(c.id))
    if (disponiveis.length === 0) {
      setErro('Todas as categorias já têm limite neste mês.')
      return
    }
    setErro('')
    setCategoriaNova(true)
    setEditando(disponiveis[0].id)
    setValor('')
    setErroEdicao('')
  }

  const salvar = async () => {
    if (!casa || editando === null) return
    const limite = parseCentavos(valor)
    if (limite === null || limite <= 0) {
      setErroEdicao('Informe um limite válido maior que zero.')
      return
    }
    setSalvando(true)
    setErroEdicao('')
    const { error } = await supabase.from('orcamentos').upsert(
      { casa_id: casa.id, categoria: editando, mes, limite },
      { onConflict: 'casa_id,categoria,mes' },
    )
    setSalvando(false)
    if (error) {
      setErroEdicao(error.message)
      return
    }
    setEditando(null)
    await carregar()
  }

  const confirmarRemocao = async () => {
    const c = removendo
    setRemovendo(null)
    if (!casa || !c) return
    const { error } = await supabase
      .from('orcamentos')
      .delete()
      .eq('casa_id', casa.id)
      .eq('categoria', c)
      .eq('mes', mes)
    if (error) {
      setErro(error.message)
      return
    }
    await carregar()
  }

  const carregar = async () => {
    if (!casa) return
    const { data, error } = await supabase
      .rpc('orcamento_uso', { p_casa: casa.id, p_mes: mes })
    setLinhas(error ? [] : ((data ?? []) as unknown as OrcamentoLinha[]))
    if (error) setErro(error.message)
  }

  const mesIndex = Number(mes.slice(0, 4)) * 12 + (Number(mes.slice(5, 7)) - 1)
  const hojeIndex = new Date().getFullYear() * 12 + new Date().getMonth()

  return (
    <>
      <div className="nav-back">
        <button type="button" onClick={() => navigate(-1)}>
          <span aria-hidden>‹</span> Voltar
        </button>
      </div>

      <div className="row">
        <button type="button" className="btn btn-secondary btn-sm" aria-label="Mês anterior" onClick={() => setMes(deslocarMes(mes, -1))}>
          ←
        </button>
        <div style={{ textAlign: 'center' }}>
          <h1 className="bar-title">{mesAnoBR(`${mes}-01`)}</h1>
          <div className="small muted">Orçamento da casa</div>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          aria-label="Próximo mês"
          onClick={() => setMes(deslocarMes(mes, 1))}
          disabled={mesIndex >= hojeIndex + 12}
        >
          →
        </button>
      </div>

      {erro && <div className="error-box mt">{erro}</div>}

      {carregando ? (
        <div className="empty">Carregando…</div>
      ) : (
        <>
          {linhas.map((l) => {
            const pct = Number(l.pct) || 0
            return (
              <div className="card" key={l.categoria} style={{ marginTop: 'var(--space-3)' }}>
                <div className="row">
                  <strong>{categoriaLabel(l.categoria)}</strong>
                  <span className={`badge badge-${corPct(pct)}`}>
                    {pct >= 100 ? 'estourou' : pct >= 80 ? 'quase no limite' : 'dentro'}
                  </span>
                </div>
                <div className="row small muted" style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                  <span>{formatBR(Number(l.usado) || 0)} de {formatBR(Number(l.limite) || 0)}</span>
                  <span>{pct.toFixed(0)}%</span>
                </div>
                <div className="barra" aria-hidden>
                  <div className={`barra-fill ${corPct(pct)}`} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <div className="row small muted" style={{ marginTop: 'var(--space-2)' }}>
                  <span>
                    {Number(l.restante) >= 0
                      ? `Restam ${formatBR(Number(l.restante))}`
                      : `Excedeu ${formatBR(Math.abs(Number(l.restante)))}`}
                  </span>
                </div>
                <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => abrirEdicao(l.categoria, Number(l.limite) || 0)}>
                    Editar
                  </button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => setRemovendo(l.categoria)}>
                    Remover
                  </button>
                </div>
              </div>
            )
          })}

          <button type="button" className="btn btn-secondary btn-sm mt" onClick={abrirNova}>
            Adicionar limite
          </button>

          {linhas.length > 0 && (
            <p className="small muted" style={{ marginTop: 'var(--space-2)' }}>
              Categorias sem limite não aparecem aqui.
            </p>
          )}

          {linhas.length === 0 && (
            <div className="empty">
              <div className="empty-icone" aria-hidden>🎯</div>
              <p>Nenhum limite definido para este mês.</p>
              <p className="small muted">{categorias.length === 0 ? 'Nenhuma categoria disponível.' : 'Adicione o primeiro limite e o app avisa quando passar do orçamento.'}</p>
            </div>
          )}
        </>
      )}

      {editando && (
        <div className="overlay" onClick={() => setEditando(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <div>
                <strong>{categoriaNova ? 'Novo limite' : categoriaLabel(editando)}</strong>
                <div className="small muted">{mesAnoBR(`${mes}-01`)}</div>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => setEditando(null)}
              >
                Cancelar
              </button>
            </div>

            {categoriaNova && (
              <>
                <label>Categoria</label>
                <select
                  value={editando ?? ''}
                  onChange={(e) => setEditando(e.target.value as Categoria)}
                >
                  {categorias
                    .filter((c) => !comOrcamento.has(c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                </select>
              </>
            )}

            <label>Limite do mês</label>
            <input
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="Ex.: 800,00"
              autoFocus
              className={erroEdicao.toLowerCase().includes('limite') ? 'input-erro' : ''}
            />

            {erroEdicao && <div className="error-box">{erroEdicao}</div>}

            <button
              type="button"
              className={`btn btn-primary${salvando ? ' btn-spinner' : ''}`}
              style={{ width: '100%', marginTop: 'var(--space-4)' }}
              disabled={salvando}
              onClick={() => void salvar()}
            >
              {salvando ? '' : 'Salvar limite'}
            </button>
          </div>
        </div>
      )}

      <Confirmacao
        aberto={removendo !== null}
        titulo={`Remover o limite de ${removendo ? categoriaLabel(removendo) : ''}?`}
        mensagem={`O limite deste mês será apagado. A categoria continua aparecendo nas contas.`}
        rotulo="Remover"
        perigoso
        onFechar={() => setRemovendo(null)}
        onConfirmar={() => void confirmarRemocao()}
      />
    </>
  )
}