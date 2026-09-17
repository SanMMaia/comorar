import type { Categoria } from '../types'

export interface ResultadoOCR {
  fornecedor?: string
  valor?: number
  data?: string
  categoria?: Categoria
}