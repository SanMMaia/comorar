import type { Categoria, CategoriaItem } from '../types'

export const CATEGORIAS_PADRAO: CategoriaItem[] = [
  { id: 'aluguel', label: 'Aluguel' },
  { id: 'luz', label: 'Luz' },
  { id: 'agua', label: 'Água' },
  { id: 'internet', label: 'Internet' },
  { id: 'mercado', label: 'Mercado' },
  { id: 'outro', label: 'Outro' },
]

/** Lista efetiva da casa: valida o jsonb e cai nas padrão se estiver vazio/inválido. */
export function categoriasEfetivas(
  custom: CategoriaItem[] | null | undefined,
): CategoriaItem[] {
  if (!Array.isArray(custom)) return CATEGORIAS_PADRAO
  const valido = custom.filter(
    (c): c is CategoriaItem =>
      !!c &&
      typeof c.id === 'string' &&
      c.id.trim() !== '' &&
      typeof c.label === 'string' &&
      c.label.trim() !== '',
  )
  if (valido.length === 0) return CATEGORIAS_PADRAO
  const vistos = new Set<string>()
  const out: CategoriaItem[] = []
  for (const c of valido) {
    const id = c.id.trim()
    if (vistos.has(id)) continue
    vistos.add(id)
    out.push({ id, label: c.label.trim() })
  }
  return out
}

/** Rótulo de exibição: label da casa, senão o padrão, senão o id formatado. */
export function labelCategoria(
  id: Categoria,
  custom?: CategoriaItem[] | null,
): string {
  const item = categoriasEfetivas(custom).find((c) => c.id === id)
  if (item) return item.label
  const padrao = CATEGORIAS_PADRAO.find((c) => c.id === id)
  if (padrao) return padrao.label
  const legivel = id
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim()
  return legivel || 'Outro'
}

/** Slug estável para uma categoria nova (sem acentos, minúsculas, hífens). */
export function slugCategoria(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const PALAVRAS_CATEGORIA: Array<[Categoria, string[]]> = [
  ['aluguel', ['aluguel', 'locacao', 'imobiliari']],
  ['luz', ['enel', 'celesc', 'coelba', 'energia', 'conta de luz', 'eletrico']],
  ['agua', ['sabesp', 'copasa', 'saneamento', 'abastecimento', 'esgoto']],
  ['internet', ['internet', 'fibra', 'banda larga', 'wi-fi', 'provedor', 'telefonica', 'net']],
  ['mercado', ['mercado', 'supermercado', 'hipermercado', 'atacadao', 'carrefour', 'pao de acucar', 'hortifruit', 'padaria']],
]

/**
 * Infere a categoria de um comprovante pelo texto OCR (fornecedor/linhas).
 * Retorna a primeira categoria que bater com o texto, senão undefined.
 * Ordem importa: aluguel antes de mercado evita "locação de imobiliária".
 */
export function inferirCategoriaDoTexto(texto: string): Categoria | undefined {
  const t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const [cat, palavras] of PALAVRAS_CATEGORIA) {
    if (palavras.some((p) => t.includes(p))) return cat
  }
  return undefined
}

/** True se o texto parece se referir a mercado/supermercado (para sugerir rateio por itens). */
export function pareceMercado(texto: string): boolean {
  const t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const palavras = PALAVRAS_CATEGORIA.find(([c]) => c === 'mercado')?.[1] ?? []
  return palavras.some((p) => t.includes(p))
}