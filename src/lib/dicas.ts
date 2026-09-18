const PREFIXO = 'comorar:dica:v1:'

export function dicaVista(chave: string): boolean {
  return localStorage.getItem(PREFIXO + chave) === '1'
}

export function marcarDicaVista(chave: string): void {
  localStorage.setItem(PREFIXO + chave, '1')
}