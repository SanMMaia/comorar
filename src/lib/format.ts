const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatBR(valor: number): string {
  return brl.format(valor)
}

export function parseCentavos(texto: string): number | null {
  const limpo = texto.replace(/[^\d,]/g, '').replace(/\./g, '').replace(',', '.')
  if (!limpo) return null
  const v = Number(limpo)
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null
}

export function dataBR(data: Date | string): string {
  const d = typeof data === 'string' ? new Date(`${data}T12:00:00`) : data
  return d.toLocaleDateString('pt-BR')
}

export function mesAnoBR(data: Date | string): string {
  const d = typeof data === 'string' ? new Date(`${data}T12:00:00`) : data
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export function hojeData(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Chave YYYY-MM do mês corrente no fuso local (evita inconsistência UTC/local). */
export function mesAtual(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Chave YYYY-MM a partir de uma data YYYY-MM-DD. */
export function mesChave(data: string): string {
  return data.slice(0, 7)
}

/** True se `data` (YYYY-MM-DD) já passou de hoje — lançamento vencido/atrasado. */
export function estaAtrasada(data: string, hoje: string = hojeData()): boolean {
  return data < hoje
}