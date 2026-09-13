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
  const d = typeof data === 'string' ? new Date(data) : data
  return d.toLocaleDateString('pt-BR')
}

export function mesAnoBR(data: Date | string): string {
  const d = typeof data === 'string' ? new Date(data) : data
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}