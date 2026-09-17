import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { supabase } from '../lib/supabase'
import {
  CATEGORIAS_PADRAO,
  categoriasEfetivas,
  slugCategoria,
} from '../lib/categorias'
import type { CategoriaItem } from '../types'

export function Categorias() {
  const { casa, moradores, minhaMoradorId, refreshCasa } = useApp()
  const navigate = useNavigate()
  const souOwner = moradores.find((m) => m.id === minhaMoradorId)?.role === 'owner'

  const [lista, setLista] = useState<CategoriaItem[]>(() =>
    categoriasEfetivas(casa?.categorias),
  )
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editandoValor, setEditandoValor] = useState('')
  const [nova, setNova] = useState('')
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState('')

  const gravar = async (proxima: CategoriaItem[]) => {
    if (!casa || !souOwner) return
    setGravando(true)
    setErro('')
    const { error } = await supabase
      .from('casas')
      .update({ categorias: proxima })
      .eq('id', casa.id)
    if (error) {
      setErro('Não foi possível salvar: ' + error.message)
      setGravando(false)
      return
    }
    setLista(proxima)
    setGravando(false)
    await refreshCasa()
  }

  const comecarRenomear = (item: CategoriaItem) => {
    setEditandoId(item.id)
    setEditandoValor(item.label)
  }

  const salvarRenome = async () => {
    const label = editandoValor.trim()
    const id = editandoId
    setEditandoId(null)
    if (!id || !label) return
    await gravar(lista.map((c) => (c.id === id ? { ...c, label } : c)))
  }

  const excluir = async (id: string) => {
    if (!window.confirm('Remover essa categoria das opções?')) return
    await gravar(lista.filter((c) => c.id !== id))
  }

  const adicionar = async () => {
    const label = nova.trim()
    if (!label) return
    const id = slugCategoria(label)
    if (!id) {
      setErro('Nome inválido para a categoria.')
      return
    }
    setNova('')
    const existente = lista.some((c) => c.id === id)
    await gravar(
      existente
        ? lista.map((c) => (c.id === id ? { ...c, label } : c))
        : [...lista, { id, label }],
    )
  }

  const restaurarPadrao = async () => {
    if (!window.confirm('Restaurar a lista padrão de categorias?')) return
    await gravar(CATEGORIAS_PADRAO)
  }

  return (
    <>
      <div className="nav-back">
        <button type="button" onClick={() => navigate(-1)}>
          <span aria-hidden>‹</span> Voltar
        </button>
      </div>

      <h1 className="page-title">Categorias de despesa</h1>
      <p className="small muted">
        Os nomes que aparecem nos lançamentos. Renomear ou excluir não altera
        lançamentos antigos.
      </p>

      {!souOwner && (
        <div className="error-box">
          Somente o(a) responsável pela casa pode editar as categorias.
        </div>
      )}
      {erro && <div className="error-box">{erro}</div>}

      <div className="card-flush mt">
        {lista.map((c) => (
          <div className="list-line" key={c.id}>
            {editandoId === c.id && souOwner ? (
              <div className="row">
                <input
                  style={{ flex: 1, minWidth: 0 }}
                  value={editandoValor}
                  onChange={(e) => setEditandoValor(e.target.value)}
                  disabled={gravando}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') salvarRenome()
                    if (e.key === 'Escape') setEditandoId(null)
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={salvarRenome}
                  disabled={gravando || !editandoValor.trim()}
                >
                  Salvar
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setEditandoId(null)}
                  disabled={gravando}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="item-linha">
                <div className="item-corpo">
                  <strong>{c.label}</strong>
                  <div className="small muted">{c.id}</div>
                </div>
                {souOwner && (
                  <div className="row" style={{ flex: 'none', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => comecarRenomear(c)}
                      disabled={gravando}
                      title="Renomear"
                    >
                      ✎
                    </button>
                    {c.id !== 'outro' && (
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => excluir(c.id)}
                        disabled={gravando}
                        title="Remover"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {souOwner && (
        <div className="card mt">
          <label htmlFor="nova-categoria">Nova categoria</label>
          <div className="row">
            <input
              id="nova-categoria"
              style={{ flex: 1, minWidth: 0 }}
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              placeholder="Ex.: Condomínio"
              disabled={gravando}
              onKeyDown={(e) => {
                if (e.key === 'Enter') adicionar()
              }}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={adicionar}
              disabled={gravando || !nova.trim()}
            >
              Adicionar
            </button>
          </div>
        </div>
      )}

      {souOwner && (
        <p className="mt-lg">
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={restaurarPadrao}
            disabled={gravando}
          >
            Restaurar categorias padrão
          </button>
        </p>
      )}
    </>
  )
}