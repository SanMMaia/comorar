import { useState, type ReactNode } from 'react'
import { dicaVista, marcarDicaVista } from '../lib/dicas'

export function Dica({ chave, children }: { chave: string; children: ReactNode }) {
  const [visivel, setVisivel] = useState(() => !dicaVista(chave))
  if (!visivel) return null
  return (
    <div className="dica-box" role="note">
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        onClick={() => {
          marcarDicaVista(chave)
          setVisivel(false)
        }}
      >
        Entendi
      </button>
    </div>
  )
}