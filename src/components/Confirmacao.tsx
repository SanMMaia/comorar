import { useEffect, useRef } from 'react'

interface ConfirmacaoProps {
  aberto: boolean
  titulo: string
  mensagem?: string
  rotulo?: string
  perigoso?: boolean
  carregando?: boolean
  onConfirmar: () => void
  onFechar: () => void
}

export function Confirmacao({
  aberto,
  titulo,
  mensagem,
  rotulo = 'Continuar',
  perigoso = false,
  carregando = false,
  onConfirmar,
  onFechar,
}: ConfirmacaoProps) {
  const refBotao = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!aberto) return
    refBotao.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [aberto, onFechar])

  if (!aberto) return null

  return (
    <div className="overlay" onClick={onFechar}>
      <div
        className="sheet"
        role="alertdialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
      >
        <strong className="sheet-titulo">{titulo}</strong>
        {mensagem && <p className="small muted mt">{mensagem}</p>}
        <div className="row mt-lg" style={{ gap: 'var(--space-2)' }}>
          <button type="button" className="btn btn-secondary" onClick={onFechar} disabled={carregando}>
            Cancelar
          </button>
          <button
            ref={refBotao}
            type="button"
            className={`btn ${perigoso ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirmar}
            disabled={carregando}
          >
            {carregando ? 'Aguarde…' : rotulo}
          </button>
        </div>
      </div>
    </div>
  )
}