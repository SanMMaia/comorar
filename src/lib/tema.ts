export type TemaPref = 'sistema' | 'claro' | 'escuro'
export type TemaResolvido = 'claro' | 'escuro'

const CHAVE = 'comorar:tema'

const COR_FUNDO: Record<TemaResolvido, string> = {
  claro: '#f3f5f7',
  escuro: '#0c1116',
}

export function lerTemaPref(): TemaPref {
  try {
    const v = localStorage.getItem(CHAVE)
    if (v === 'claro' || v === 'escuro' || v === 'sistema') return v
  } catch {
    /* storage indisponível */
  }
  return 'sistema'
}

export function temaResolvido(pref: TemaPref): TemaResolvido {
  if (pref === 'sistema') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro'
  }
  return pref
}

export function aplicarTema(pref: TemaPref): TemaResolvido {
  const resolvido = temaResolvido(pref)
  const html = document.documentElement
  html.dataset.tema = resolvido
  html.dataset.temaPref = pref
  html.style.colorScheme = resolvido
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', COR_FUNDO[resolvido])
  return resolvido
}

export function salvarTema(pref: TemaPref): TemaResolvido {
  try {
    localStorage.setItem(CHAVE, pref)
  } catch {
    /* storage indisponível */
  }
  return aplicarTema(pref)
}
